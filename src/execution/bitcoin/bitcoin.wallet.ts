import { OrderKey } from 'src/types/order-key.types';
import { decodeBitcoinAddress } from './bitcoin.address';
import * as bitcoin from 'bitcoinjs-lib';
import mempoolJS from '@catalabs/mempool.js';
import ECPairFactory, { networks } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);

const TESTNET = true;
const network = TESTNET ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;
// TODO: Fix
const {
  bitcoin: { transactions, addresses },
} = mempoolJS({
  hostname: 'mempool.space',
  network: TESTNET ? 'testnet4' : undefined,
});
const DUST = 1000n;
const bitcoinWallet = ECPair.fromWIF(
  'cNg39XLiH1UhoAx6xsSrZ7Q1PtEx1kjjRzGfCCEUApUPhfDYoZMp',
  TESTNET ? networks.testnet : networks.bitcoin,
);
const { address: bitcoinAddress, output: P2WPKHInputScript } =
  bitcoin.payments.p2wpkh({
    pubkey: Buffer.from(bitcoinWallet.publicKey),
    network,
  });
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
  amount: bigint,
  selectedUxtos: AddressTxsUtxo[] = [],
): Promise<{ inputs: AddressTxsUtxo[]; value: bigint }> {
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
    return { inputs: selectedUxtos, value: BigInt(utxoSum(selectedUxtos)) };
  // Search inputs for the smallest amount above inputs.
  candidateUxtos.sort((a, b) => a.value - b.value);
  let selectedInput: (typeof candidateUxtos)[0];
  for (selectedInput of candidateUxtos) {
    if (BigInt(selectedInput.value) > amount) break;
  }
  const selectedInputs = [...selectedUxtos, selectedInput];
  const valueSum = BigInt(utxoSum(selectedInputs));
  if (valueSum < amount) return getInput(amount - valueSum, selectedInputs);
  return { inputs: selectedInputs, value: valueSum };
}

export async function fillBTC(order: OrderKey) {
  console.log({ order });
  // We only support single BTC fills:
  if (order.outputs.length != 1)
    throw Error(
      `Multiple outputs found in Bitcoin fill. Found: ${order.outputs.length}`,
    );

  const output = order.outputs[0];
  if (output.amount <= DUST)
    throw Error(
      `Unlikely to broadcast transaction because of dust limit: ${DUST} sats`,
    );

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
    network,
  });

  const fee = 10n * DUST;
  const inputs = await getInput(satoshis + fee);
  if (inputs.value < satoshis)
    throw Error(`Could only find ${inputs.value} sats but needs ${satoshis}`);
  // TODO: set changeAddress as not bitcoinRecipientAddress.
  const changeAmount = BigInt(inputs.value) - satoshis - fee;
  psbt.addInputs(
    inputs.inputs.map((input) => {
      return {
        hash: input.txid,
        index: input.vout,
        witnessUtxo: {
          script: P2WPKHInputScript,
          value: Number(input.value),
        },
      };
    }),
  );
  psbt.addOutput({ address: bitcoinRecipientAddress, value: Number(satoshis) });
  const op_return_data = output.remoteCall.replace('0x', '');
  if (op_return_data.length > 0) {
    const data_embed = bitcoin.payments.embed({
      data: [Buffer.from(op_return_data, 'hex')],
    });
    psbt.addOutput({
      script: data_embed.output!,
      value: 0,
    });
  }
  if (changeAmount > DUST)
    psbt.addOutput({ address: bitcoinAddress, value: Number(changeAmount) });
  psbt.signInput(0, bitcoinWallet);
  psbt.finalizeAllInputs();
  // Broadcast
  console.log({ psbt, tx: psbt.extractTransaction().toHex() });
  const txId = await transactions.postTx({
    txhex: psbt.extractTransaction().toHex(),
  });
  console.log({ txId });
  return txId;
}
