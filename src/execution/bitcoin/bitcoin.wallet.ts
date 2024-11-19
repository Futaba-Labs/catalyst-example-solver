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

const SECONDS = 1000;
const MINUTES = 60 * SECONDS;

export interface AddressTxsUtxo {
    txid: string;
    vout: number;
    value: number;
    spentAt: number;
    pathIndex: number;
}

const now = () => Date.parse(new Date().toISOString()) / 1000

export class BitcoinWallet {
    mempoolProvider: MempoolProvider;

    // Continous services:
    private GET_COINS_EVERY = 5 * MINUTES; // TODO_QOL: Move into config
    private UPDATE_BITCOIN_FEE_EVERY = 2 * MINUTES; // TODO_QOL: Move into config
    private CLEAR_SPENT_COIN_FLAG_AFTER = 10 * MINUTES;
    private BIP32_XPRIV = "xprvA8YrhEjRG1XDnVEdwh4sfCtddnD9cNhTd46rSWSGk3SNm6Bhe79N3GsgvKoLe3M2JAvWve8FhpN1cLvA1oSxVhBVK6cSKaEo9s6DSigg5XR"

    private MEMPOOL_WAIT_TIME = 500; // TODO_QOL: move into config
    private MAX_TRIES_FOR_SAFE_ADDRESS = 30000; // TODO_QOL: Move into config.
    // TODO_QOL: Compute based on fee such that no unspendable outputs are created.
    BITCOIN_DUST_LIMIT = 1000n; // sats.
    private hdkey: HDKey;

    mainnet: boolean;

    private satsPerVirtualBytes = 60n;
    private findCoins;

    private unusedAddressIndex = 0;
    private emptyAddressIndex = new Map<number, boolean>;
    coins: AddressTxsUtxo[] = [];

    /** 
     * Maps addresses to spent amount. Only needs to be valid for the head since we
     * will rotate non-head addresses forward.
     */
    private spendAddress: Map<string, Map<string, boolean>>;
    private lastHead: string | undefined;

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
      
    /** If you want to make sure the wallet is ready, await this */
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

    /** Sets unusedAddressIndex to the head of the address list. */
    private async initialize() {
        console.log(`Initializing Bitcoin wallet with pubKey: ${this.hdkey.publicExtendedKey}`);
        this.updateLatestFee();
        await this.getNextSafeBitcoinAddress(0n);
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

    /** 
     * Gets the next address that is safe for a Bitcoin swap and marks the new address unsafe.
     * @dev Returns undefined if no address was found. Make sure to catch in a safe way. 
     */
    async getNextSafeBitcoinAddress(amount: bigint): Promise<string | undefined> {
        let foundDirty = false;
        let mempoolWait = wait (0);
        for (let i = 0; i < this.MAX_TRIES_FOR_SAFE_ADDRESS; ++i) {
            // Get an unchecked clean address.
            const tryNextAddress = this.getNextBitcoinAddress(foundDirty ? 1 : 0);
            // Don't spam mempool.
            await mempoolWait;
            if(await this.mempoolProvider.isAddressDirty(tryNextAddress)) {
                mempoolWait = wait(this.MEMPOOL_WAIT_TIME);
                foundDirty = true;
                continue;
            };
            // Check if we have attempted to get this address before.
            const tried = this.spendAddress.get(tryNextAddress)?.get(amount.toString());
            if (tried === undefined || tried === false) {
                // Check if this address is fresh.
                const addressMap = this.spendAddress.get(tryNextAddress);
                if (addressMap === undefined) this.spendAddress.set(tryNextAddress, new Map<string, boolean>);
                this.spendAddress.get(tryNextAddress)!.set(amount.toString(), true);
                return tryNextAddress
            };
        }
        return undefined;
    }

    /** Gets the last spend address. An offset can be added if it intersects with a known spend. */
    getNextBitcoinAddress(offset: number): string {
        this.unusedAddressIndex += offset;
        const pathHdKey = this.hdkey.derive(`m/${this.unusedAddressIndex}`);
        const publicKey = pathHdKey.publicKey!;

        const bitcoinWallet = ECPair.fromPublicKey(
            publicKey,
            {
                network: 
                this.getECPairNetwork(),
            }
        );

        const { address: derivedWalletAddress } = bitcoin.payments.p2wpkh({
            pubkey: bitcoinWallet.publicKey,
            network: this.getBitcoinJSNetwork(),
        });

        if (derivedWalletAddress === undefined) throw new Error("Could not derive address");

        // If we got to the next address index, we need to cleanup
        // our spend map.
        if (offset === 0 && derivedWalletAddress !== this.lastHead) {
            this.lastHead = derivedWalletAddress;
            this.cleanSpentBitcoinAddress(derivedWalletAddress);
        }

        return derivedWalletAddress;
    }

    cleanSpentBitcoinAddress(keepAddress: string) {
        const spendMapOfHead = this.spendAddress.get(keepAddress);
        this.spendAddress = new Map<string, Map<string, boolean>>;
        // Keep the old map of head (or create if no new on head).
        this.spendAddress.set(keepAddress, spendMapOfHead ?? new Map<string, boolean>);
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
        for (let i = from; i < this.unusedAddressIndex; ++i) {
            // Check if we expect the index to be empty.
            // Index 0 address is used for change.
            if (i != 0 && this.emptyAddressIndex.get(i)) continue;

            const pathHdKey = this.hdkey.derive(`m/${i}`);
            const bitcoinWallet = ECPair.fromPublicKey(
                pathHdKey.publicKey!,
                {
                    network: 
                    this.getECPairNetwork(),
                }
            );

            const { address } = bitcoin.payments.p2wpkh({
                pubkey: bitcoinWallet.publicKey,
                network: this.getBitcoinJSNetwork(),
            });

            if (address === undefined) throw new Error("Could not derive address");

            await w;
            const utxos = await this.mempoolProvider.getAddressUtxo(address);
            w = wait(this.MEMPOOL_WAIT_TIME);

            if (utxos.length === 0) {
                this.emptyAddressIndex.set(i, true);
                continue;
            }

            for (let j = 0; j < utxos.length; ++j) {
                const utxo = utxos[j];
                // Check if we already know utxo.
                const known = this.coins.map(
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
        // If we resetSpentMarkers, then any UTXO with spent == true is not an unspent anymore.
        for (let i = 0; i < this.coins.length;) {
            if (this.coins[i].spentAt != 0 && this.coins[i].spentAt < now() - this.CLEAR_SPENT_COIN_FLAG_AFTER) {
                this.coins.splice(i, 1)
            } else {
                ++i;
            };
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