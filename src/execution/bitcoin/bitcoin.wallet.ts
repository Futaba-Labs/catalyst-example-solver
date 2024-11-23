// import { solverConfig as config } from "../../../../config/mod.ts";
import ECPairFactory, { ECPairInterface, networks } from '@catalabs/ecpair';
import * as ecc from 'tiny-secp256k1';
// import { MempoolProvider } from "../../../providers/mempool.ts";
import { HDKey } from "@scure/bip32";
import * as bitcoin from 'bitcoinjs-lib';
import { hexStringToUint8Array } from "./bitcoin.utils";
import { wait } from "src/utils/index";
import { MempoolProvider } from './mempool';

const ECPair = ECPairFactory(ecc);
bitcoin.initEccLib(ecc);

const SECONDS = 1000;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;
const DAYS = 24 * HOURS;

export interface AddressTxsUtxo {
    txid: string;
    vout: number;
    status: {
        confirmed: boolean;
        block_height: number;
        block_hash: string;
        block_time: number;
    };
    value: number;
    spentAt: number;
    pathIndex: number;
}

// get UTC timestamp
export const now = () => new Date().getTime() / 1000;

export class BitcoinWallet {
    mempoolProvider: MempoolProvider;

    // Continous services:
    private UTXO_ORACLE_VALIDITY_PERIOD = (3 * DAYS + 1 * DAYS) / SECONDS; // Validity period is 3 days, safety buffer is 1 day.
    private GET_COINS_EVERY = 5 * MINUTES; // TODO_QOL: Move into config
    private UPDATE_BITCOIN_FEE_EVERY = 2 * MINUTES; // TODO_QOL: Move into config
    private CLEAR_SPENT_COIN_FLAG_AFTER = 10 * MINUTES;
    private BIP32_XPRIV = "xprvA8YrhEjRG1XDnVEdwh4sfCtddnD9cNhTd46rSWSGk3SNm6Bhe79N3GsgvKoLe3M2JAvWve8FhpN1cLvA1oSxVhBVK6cSKaEo9s6DSigg5XR"

    private MEMPOOL_WAIT_TIME = 400; // TODO_QOL: move into config
    private MAX_TRIES_FOR_SAFE_ADDRESS = 30000; // TODO_QOL: Move into config.
    // TODO_QOL: Compute based on fee such that no unspendable outputs are created.
    BITCOIN_DUST_LIMIT = 1000n; // sats.
    private hdkey: HDKey;

    mainnet: boolean;

    private satsPerVirtualBytes = 60n;
    private findCoins;

    // 0 is used as a change address. So we will start it at 1.
    // This leads to ~MEMPOOL_WAIT_TIME ms faster startup
    private goodToBeUsedAddressIndex = 1; // TODO: this should be persistet.
    private addressDiscoveryIndex = 1; // this should not be persistet.
    /** Maps an address index to when it was last used as an in */
    private addressLastInput = new Map<number, number>;
    coins: AddressTxsUtxo[] = [];

    public ownTransactions = new Map<string, boolean>;

    /** 
     * Maps addresses to spent amount. Only needs to be valid for the head since we
     * will rotate non-head addresses forward.
     */
    private spendAddress: Map<string, Map<string, boolean>>;

    private getECPairNetwork() {
        return this.mainnet ? networks.bitcoin : networks.testnet;
    }

    private getBitcoinJSNetwork() {
        return this.mainnet ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
    }

    static utxoSum(utxos: AddressTxsUtxo[]) {
        let sum = 0;
        for (const utxo of utxos) {
          sum += utxo.value;
        }
        return sum;
    }
      
    /** Once this promise resolves, the wallet can generate safe addresses. */
    public ready: Promise<string>;
    /** Once this promise resolves, the wallet can generate safe addresses and access its balance. */
    public initialization: Promise<void>;

    constructor(mainnet: boolean, findCoins: boolean = true) {
        this.spendAddress = new Map<string, Map<string, boolean>>;
        this.mempoolProvider = new MempoolProvider();
        const rootKey = HDKey.fromJSON({ xpriv: this.BIP32_XPRIV });
        this.hdkey = rootKey.derive(`m/44'/0'/0'`);
        this.findCoins = findCoins;

        this.mainnet = mainnet;

        this.initialization = this.initialize();
    }

    /** Sets goodToBeUsedAddressIndex to the head of the address list. */
    private async initialize() {
        console.log(`Initializing Bitcoin wallet with pubKey: ${this.hdkey.publicExtendedKey}`);
        this.updateLatestFee();
        this.ready = this.getNextSafeBitcoinAddress(0n);
        await this.ready;
        await this.discoverAddresses();
        if (this.findCoins) {
            await this.fetchCoins()
            console.log(this.coins);
            console.log(`Finished Initializing Bitcoin wallet with pubKey: ${this.hdkey.publicExtendedKey}, containing: ${BitcoinWallet.utxoSum(this.coins)/10**8} Bitcoins`);

            setInterval(() => {
                this.fetchCoins(0);
            }, this.GET_COINS_EVERY);
        } else {
            console.log(`Finished Initializing Bitcoin wallet with pubKey: ${this.hdkey.publicExtendedKey}, coin discovery disabled`);
        }
        
        setInterval(() => {
            this.updateLatestFee();
        }, this.UPDATE_BITCOIN_FEE_EVERY);
    }

    async updateLatestFee() {
        const fees = await this.mempoolProvider.retry(() => this.mempoolProvider.bitcoin.fees.getFeesRecommended());
        this.satsPerVirtualBytes = BigInt(fees.fastestFee);
    }

    /** If goodToBeUsedAddressIndex is persistet, it is important that this is called on init. */
    async discoverAddresses() {
        // It is assumed that if this.goodToBeUsedAddressIndex contains 1 then this.goodToBeUsedAddressIndex hasn't been persistet.
        this.addressDiscoveryIndex = this.addressLastInput.get(1) === undefined ? 1 : this.goodToBeUsedAddressIndex;
        let mempoolWait = wait(0);
        let addressLastUsedAt = 1; // This variable aids to ensure the while loop can't run forever.
        while (addressLastUsedAt != 0) {
            const { address: tryNextAddress } = this.getAddressAtIndex(this.addressDiscoveryIndex);
            await mempoolWait;
            addressLastUsedAt = await this.mempoolProvider.addressLastUsedAt(tryNextAddress);
            mempoolWait = wait(this.MEMPOOL_WAIT_TIME);
            if (addressLastUsedAt > 0) {
                this.addressDiscoveryIndex += 1;
                this.addressLastInput.set(this.addressDiscoveryIndex, addressLastUsedAt);
                continue;
            }
            break;
        }
    }

    /**
     * Calling this function will attempt to decrease the goodToBeUsedAddressIndex.
     * If this is called before a bitcoin address loop, it will attempt to optimise
     * address generation.
     */
    async recycleAddressIndex() {
        // If not, it means we need to search. We want the lowest key with a value that works.
        let lowestKey = -1;
        let currentTimestamp = now();
        this.addressLastInput.forEach((v, k) => {
            if (k < lowestKey) {
                if (v <= currentTimestamp - this.UTXO_ORACLE_VALIDITY_PERIOD) {
                    lowestKey = k;
                }
            }
        });
        // if this is true, we can use the newly found index.
        if (lowestKey != -1) {
            // Sanity check. Ensure that this has had a tx in the past.
            if (this.addressLastInput.get(lowestKey) > 0) {
                // We can reset the spend map.
                const { address } = this.getAddressAtIndex(lowestKey);
                this.spendAddress.set(address, new Map<string, boolean>());
            }
            this.goodToBeUsedAddressIndex = lowestKey;
        } else {
            let largestKey: number = Math.max(...this.addressLastInput.keys(), 0);
            if (largestKey > this.goodToBeUsedAddressIndex) this.goodToBeUsedAddressIndex = largestKey + 1;
        }
    }

    /** 
     * Gets the next address that is safe for a Bitcoin swap and marks the new address unsafe.
     * @dev Returns undefined if no address was found. Make sure to catch in a safe way. 
     */
    async getNextSafeBitcoinAddress(amount: bigint): Promise<string | undefined> {
        this.recycleAddressIndex();
        let mempoolWait = wait (0);
        let offset = 0;
        for (let i = 0; i < this.MAX_TRIES_FOR_SAFE_ADDRESS; ++i) {
            // Get an unchecked clean address.
            const tryNextAddress = this.getNextBitcoinAddress(offset);
            // Don't spam mempool.
            await mempoolWait;
            const addressLastUsedAt = await this.mempoolProvider.addressLastUsedAt(tryNextAddress);
            console.log({tryNextAddress, addressLastUsedAt, clearenceTime: now() - this.UTXO_ORACLE_VALIDITY_PERIOD });
            if (addressLastUsedAt > now() - this.UTXO_ORACLE_VALIDITY_PERIOD) {
                this.addressLastInput.set(this.goodToBeUsedAddressIndex + offset, addressLastUsedAt);
                this.goodToBeUsedAddressIndex += 1;
                mempoolWait = wait(this.MEMPOOL_WAIT_TIME);
                // if we tried an address recommended by recycleAddressIndex and it failed. We should try another recommendation.
                this.recycleAddressIndex();
                continue;
            };
            // Check if we have attempted to get this address before.
            const tried = this.spendAddress.get(tryNextAddress)?.get(amount.toString());
            if (tried === undefined || tried === false) {
                // Check if this address is fresh.
                const addressMap = this.spendAddress.get(tryNextAddress);
                if (addressMap === undefined) this.spendAddress.set(tryNextAddress, new Map<string, boolean>());
                this.spendAddress.get(tryNextAddress)!.set(amount.toString(), true);
                return tryNextAddress
            };
            ++offset;
        }
        return undefined;
    }

    /** Gets the last spend address. An offset can be added if it intersects with a known spend. */
    getNextBitcoinAddress(offset: number): string {
        const { address: derivedWalletAddress } = this.getAddressAtIndex(this.goodToBeUsedAddressIndex + offset);

        return derivedWalletAddress;
    }

    getAddressAtIndex(index: number): {address: string, script: Uint8Array, bitcoinWallet: ECPairInterface} {
        const pathHdKey = this.hdkey.derive(`m/${index}`);
        const privateKey = pathHdKey.privateKey!;

        const bitcoinWallet = ECPair.fromPrivateKey(
            privateKey,
            {
                network: 
                this.getECPairNetwork(),
            }
        );

        const { address, output } = bitcoin.payments.p2wpkh({
            pubkey: bitcoinWallet.publicKey,
            network: this.getBitcoinJSNetwork(),
        });

        if (address === undefined) throw new Error("Could not derive address");

        return {address: address!, script: output!, bitcoinWallet};
    }

    /**
     * Finds the fewest utxos requried to generate a transaction of amount.
     * May not be optimal as this does not consider how large the excess is thus more fees may actually be paid
     * then desired.
     * @param amount Number of sats to find
     * @param selectedUxtos Already selected UTXOs. Will be included in return
     * @returns Minimal list of utxos to get slightly more than amount.
     */
    getInputs(
        amount: bigint,
        selectedUxtos: AddressTxsUtxo[] = [],
      ): { inputs: AddressTxsUtxo[]; value: bigint } {
        let candidateUxtos = this.coins;
        // Filer inputs based on the ones already used.
        candidateUxtos = candidateUxtos.filter((utxo) => {
          if (utxo.spentAt != 0) return false;
          if (!utxo.status.confirmed) {
            // Only select unconfirmed transactions that we sent. This ensures there is
            // a minimum fee & it won't get replaced invalidating any transactions we may have sent.
            // This does decrease our money velocity. If you want to fix, make the selection more clever.
            const ourTransaction = this.ownTransactions.get(utxo.txid.toLowerCase());
            if (!ourTransaction) return false;
        };

          // Check if we already selected this utxo for inclusion.
        for (const sUtxo of selectedUxtos) {
            if (utxo.vout === sUtxo.vout && utxo.txid === sUtxo.txid) return false;
          }
          return true;
        });
        if (candidateUxtos.length === 0)
          return { inputs: selectedUxtos, value: BigInt(BitcoinWallet.utxoSum(selectedUxtos)) };
        // Search inputs for the smallest amount above inputs.
        let selectedInput: (typeof candidateUxtos)[0];
        for (selectedInput of candidateUxtos) {
          if (BigInt(selectedInput.value) > amount) break;
        }
        const selectedInputs = [...selectedUxtos, selectedInput!]; // selectedInput is not undefined since candidateUxtos .length > 0
        const valueSum = BigInt(BitcoinWallet.utxoSum(selectedInputs));
        if (valueSum < amount) return this.getInputs(amount, selectedInputs);
        return { inputs: selectedInputs, value: valueSum };
    }

    /**
     * Finds available UTXOs from the stored key.
     * @param from Starting index. If unset, will searched and empty addresses.
     */
    async fetchCoins(from: number = 0) {
        let w = wait(0);
        for (let i = from; i < Math.max(this.addressDiscoveryIndex, this.goodToBeUsedAddressIndex); ++i) {
            const { address } = this.getAddressAtIndex(i);

            await w;
            const utxos = await this.mempoolProvider.getAddressUtxo(address);
            w = wait(this.MEMPOOL_WAIT_TIME);

            // Get the utxos we know for the address index.
            const knownUtxosForAddressIndex = this.coins.filter(utxo => utxo.pathIndex === i);

            // We need to check if there are utxos in this that isn't in utxos.
            // Those have been spent.
            const spentUtxos = knownUtxosForAddressIndex.filter(knownUtxo => {
                for (const stillUtxo of utxos) {
                    if (stillUtxo.txid === knownUtxo.txid && stillUtxo.vout === knownUtxo.vout) return false;
                }
                return true;
            });
            // Delete all spentUtxos from our coin list. Perf: Long loop is examined first.
            for (let j = 0; j < this.coins.length;) {
                const examinedCoin = this.coins[j];
                let removed = false;
                for (const spentUtxo of spentUtxos) {
                    if (examinedCoin.txid === spentUtxo.txid && examinedCoin.vout === spentUtxo.vout) {
                        this.coins.splice(j, 1);
                        removed = true;
                    }
                }
                // If we remove a coin from the index, the list becomes 1 length shorter.
                // We can't increment j.
                if (!removed) ++j;
            }

            if (utxos.length === 0) {
                continue;
            }
                
            for (let j = 0; j < utxos.length; ++j) {
                const utxo = utxos[j];
                // Check if we already know the utxo.
                const known = knownUtxosForAddressIndex.map(
                    coin => coin.txid === utxo.txid
                         && coin.vout === utxo.vout
                ).indexOf(true);
                if (known != -1) {
                    // Check if we need to clear spent flag.
                    if (this.coins[j].spentAt < now() - this.CLEAR_SPENT_COIN_FLAG_AFTER) {
                        this.coins[j].spentAt = 0;
                    }
                    continue;
                }
                this.coins.push({...utxo, spentAt: 0, pathIndex: i});
            }
        }
    }

    /**
     * Make a tranaction.
     */
    makeTransaction(to: string, outputValue: bigint, returnData: string, computeSize: boolean = true, spendInputs = true): bitcoin.Transaction {

        const psbt = new bitcoin.Psbt({
            network: this.getBitcoinJSNetwork()
        });

        let size = 144; // vB
        if (computeSize) size = this.makeTransaction(to, outputValue, returnData, false, false).virtualSize();
        const fee = BigInt(size) * this.satsPerVirtualBytes;

        const inputs = this.getInputs(outputValue + fee);
        if (spendInputs) {
            for (const input of inputs.inputs) {
                const indexOfCoin = this.coins.map(
                    coin => coin.txid === input.txid
                         && coin.vout === input.vout
                ).indexOf(true);
                this.coins[indexOfCoin].spentAt = now();
            }
        }

        psbt.addInputs(
            inputs.inputs.map((input) => {
                return {
                    hash: input.txid,
                    index: input.vout,
                    witnessUtxo: {
                        script: this.getAddressAtIndex(input.pathIndex).script,
                        value: BigInt(input.value)
                    }
                }
            })
        );
        // Add the solving output.
        psbt.addOutput({ address: to, value: outputValue });

        const opReturnData = returnData.replace("0x", "");
        if (opReturnData.length > 0) {
            const data_embed = bitcoin.payments.embed({
                data: [hexStringToUint8Array(opReturnData)],
            });
            psbt.addOutput({
                script: data_embed.output!,
                value: 0n,
            });
        }

        // Add change output
        const changeAmount = inputs.value - outputValue - fee;
        if (changeAmount > this.BITCOIN_DUST_LIMIT)
            psbt.addOutput({ address: this.getAddressAtIndex(0).address, value: changeAmount });
        
        // Sign all inputs.
        for (let i = 0; i < inputs.inputs.length; ++i) {
            const input = inputs.inputs[i];
            const wallet = this.getAddressAtIndex(input.pathIndex).bitcoinWallet;
            psbt.signInput(i, wallet);
        }
        psbt.finalizeAllInputs();

        return psbt.extractTransaction();
    }
}