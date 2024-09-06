import { BridgeOracle__factory } from 'lib/contracts';
import { OrderKey } from 'src/types/order-key.types';
import { decodeBitcoinAddress } from './bitcoin/bitcoin.address';
import { BITCOIN_IDENTIFIER } from './order.initiate';
import * as bitcoin from 'bitcoinjs-lib';

// TODO: Fix
const bitcoinWallet: any = '';

async function getInput(amount: bigint): Promise<any> {
  return;
}

async function fillBTC(order: OrderKey) {
  // We only support single BTC fills:
  if (order.outputs.length != 1)
    throw Error(
      `Multiple outputs found in Bitcoin fill. Found: ${order.outputs.length}`,
    );

  const output = order.outputs[0];

  const recipientHash = output.recipient;
  const version = Number('0x' + output.token.slice(output.token.length - 2));

  const bitcoinRecipientAddress = decodeBitcoinAddress(version, recipientHash);
  const satoshis = output.amount;
  console.log({
    bitcoinRecipientAddress,
    satoshis,
  });
  return;
  // TODO: make tx to bitcoinRecipientAddress
  const psbt = new bitcoin.Psbt();

  const input = await getInput(satoshis);
  // TODO: set changeAddress as not bitcoinRecipientAddress.
  const changeAddress = bitcoinRecipientAddress;
  const fee = 0;
  const changeAmount = input.value - Number(satoshis) - fee;
  psbt.addInput(input);
  psbt.addOutput({ address: bitcoinRecipientAddress, value: Number(satoshis) });
  psbt.addOutput({ address: changeAddress, value: changeAmount });
  psbt.signInput(0, bitcoinWallet);
  psbt.finalizeAllInputs();
  // psbt.validateSignaturesOfInput
  // Broadcast
  // await psbt.extractTransaction();
}

async function fillEVM(order: OrderKey) {
  let recordedChain: number;
  let remoteOracle: string;
  const outputs = order.outputs;
  for (const output of order.outputs) {
    if (recordedChain === undefined) recordedChain = output.chainId;
    if (remoteOracle === undefined) remoteOracle = output.remoteOracle;
    if (recordedChain !== output.chainId)
      throw Error(
        `Mixed ChainIds, seen ${recordedChain} and ${output.chainId}`,
      );
    if (remoteOracle !== output.remoteOracle)
      throw Error(
        `Mixed Oracles, seen ${remoteOracle} and ${output.remoteOracle}`,
      );
  }
  const oracle = BridgeOracle__factory.connect(remoteOracle);

  // TODO: Set approvals for the oracleAddress for the value of the output.

  // We need to provide fill times. These have to be set to proofTime.
  // These are used to ensure you can't reuse fills.
  const fillTimes = order.outputs.map(() => order.reactorContext.proofDeadline);

  // Call the reactor to initiate the order.
  return oracle.fill(outputs, fillTimes);
}

export async function fillOutputs(order: OrderKey) {
  // Define the reactor we will call. You can get the reactor address from the order
  // Check if order outputs are Bitcoin // TODO:
  if (
    order.outputs[0].token.replace('0x', '').slice(0, 64 - 4) ==
    BITCOIN_IDENTIFIER
  ) {
    fillBTC(order);
  } else {
    fillEVM(order);
  }
}
