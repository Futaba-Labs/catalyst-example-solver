import { BridgeOracle__factory } from 'lib/contracts';
import { OrderKey } from 'src/types/order-key.types';
import { BITCOIN_IDENTIFIER, signer } from './order.initiate';
import { fillBTC } from './bitcoin/bitcoin.wallet';

async function fillEVM(order: OrderKey) {
  let recordedChain: bigint;
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
  const oracle = BridgeOracle__factory.connect(remoteOracle, signer);

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
