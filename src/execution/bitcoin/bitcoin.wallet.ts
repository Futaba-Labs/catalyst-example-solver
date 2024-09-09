import { OrderKey } from 'src/types/order-key.types';
import { decodeBitcoinAddress } from '../bitcoin/bitcoin.address';
import * as bitcoin from 'bitcoinjs-lib';
import mempoolJS from '@mempool/mempool.js';
import ECPairFactory, { networks } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);

const TESTNET = true;
// TODO: Fix
const {
  bitcoin: { transactions, addresses },
} = mempoolJS({
  hostname: 'mempool.space',
  network: TESTNET ? 'testnet' : undefined,
});
const DUST = 500;
const bitcoinWallet = ECPair.fromWIF(
  '',
  TESTNET ? networks.testnet : networks.bitcoin,
);
let { address: bitcoinAddress } = bitcoin.payments.p2wpkh({
  pubkey: Buffer.from(bitcoinWallet.publicKey),
  network: TESTNET ? bitcoin.networks.testnet : bitcoin.networks.bitcoin,
});
bitcoinAddress = 'tb1q7v9egtaktp0eqn0ymxhrjl30yefjy3aqn6s6u2';
console.log({ bitcoinAddress });

type AddressTxsUtxo = Awaited<
  ReturnType<typeof addresses.getAddressTxsUtxo>
>[0];

function utxoSum(utxos: AddressTxsUtxo[]) {
  let sum = 0;
  for (const utxo of utxos) {
    sum += utxo.value;
  }
  return sum;
}

async function getInput(
  amount: number,
  selectedUxtos: AddressTxsUtxo[] = [],
): Promise<{ inputs: AddressTxsUtxo[]; value: number }> {
  const candidateUxtos = await addresses.getAddressTxsUtxo({
    address: bitcoinAddress,
  });
  // Filer inputs based on observed.
  candidateUxtos.filter((utxo) => {
    for (const sUtxo of selectedUxtos) {
      if (!(utxo.vout === sUtxo.vout && utxo.txid === sUtxo.txid)) return false;
    }
    return true;
  });
  if (candidateUxtos.length === 0)
    return { inputs: selectedUxtos, value: utxoSum(selectedUxtos) };
  // Search inputs for the smallest amount above inputs.
  candidateUxtos.sort((a, b) => a.value - b.value);
  let selectedInput: (typeof candidateUxtos)[0];
  for (selectedInput of candidateUxtos) {
    if (selectedInput.value > amount) break;
  }
  const selectedInputs = [...selectedUxtos, selectedInput];
  const valueSum = utxoSum(selectedInputs);
  if (valueSum < amount) return getInput(amount - valueSum, selectedInputs);
  return { inputs: selectedInputs, value: valueSum };
}

export async function fillBTC(order: OrderKey) {
  // We only support single BTC fills:
  if (order.outputs.length != 1)
    throw Error(
      `Multiple outputs found in Bitcoin fill. Found: ${order.outputs.length}`,
    );

  const output = order.outputs[0];

  const recipientHash = output.recipient;
  const version = Number('0x' + output.token.slice(output.token.length - 2));

  const bitcoinRecipientAddress = decodeBitcoinAddress(
    version,
    recipientHash,
    TESTNET,
  );
  const satoshis = output.amount;
  console.log({
    bitcoinRecipientAddress,
    satoshis,
  });
  // TODO: make tx to bitcoinRecipientAddress
  const psbt = new bitcoin.Psbt({
    network: TESTNET ? bitcoin.networks.testnet : bitcoin.networks.bitcoin,
  });

  const fee = 20 * DUST;
  const inputs = await getInput(Number(satoshis) + fee);
  if (inputs.value < Number(satoshis))
    throw Error(`Could only find ${inputs.value} sats but needs ${satoshis}`);
  // TODO: set changeAddress as not bitcoinRecipientAddress.
  const changeAmount = inputs.value - Number(satoshis) - fee;
  psbt.addInputs(
    inputs.inputs.map((input) => {
      return {
        hash: input.txid,
        index: input.vout,
        witnessUtxo: {
          script: Buffer.from(bitcoinWallet.publicKey),
          value: input.value,
        },
      };
    }),
  );
  psbt.addOutput({ address: bitcoinRecipientAddress, value: Number(satoshis) });
  if (changeAmount > DUST)
    psbt.addOutput({ address: bitcoinAddress, value: changeAmount });
  psbt.signInput(0, bitcoinWallet as any);
  psbt.finalizeAllInputs();
  // Broadcast
  console.log({ psbt });
  const txId = await transactions.postTx({
    txhex: psbt.extractTransaction().toHex(),
  });
  console.log({ txId });
  return txId;
}
