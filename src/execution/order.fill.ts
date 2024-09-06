import { BridgeOracle__factory } from 'lib/contracts';
import { OrderKey } from 'src/types/order-key.types';

async function fill_bitcoin(order: OrderKey) {}

async function fill_evm(order: OrderKey) {
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
  const oracle = BridgeOracle__factory.connect(remoteOracle);

  // TODO: Set approvals for the oracleAddress for the value of the output.

  // We need to provide fill times. These have to be set to proofTime.
  // These are used to ensure you can't reuse fills.
  const fillTimes = order.outputs.map(() => order.reactorContext.proofDeadline);

  // Call the reactor to initiate the order.
  return oracle.fill(outputs, fillTimes);
}

export async function fill_order_outputs(order: OrderKey) {
  // Define the reactor we will call. You can get the reactor address from the order
  // Check if order outputs are Bitcoin // TODO:
  if (order.outputs[0].token == '0x0000BC') {
    fill_bitcoin(order);
  } else {
    fill_evm(order);
  }
}
