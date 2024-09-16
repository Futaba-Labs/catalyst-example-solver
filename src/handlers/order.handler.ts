import { initiateOrder } from 'src/execution/order.initiate';
import { CatalystEvent, CatalystOrderData } from '../types';
import { WebSocket } from 'ws';
import { BaseReactor__factory } from 'lib/contracts';
import { ethers } from 'ethers';
import { OrderKey } from 'src/types/order-key.types';
import { fillOutputs } from 'src/execution/order.fill';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function handleReceiveOrder(
  orderRequest: CatalystEvent<CatalystOrderData>,
  ws: WebSocket,
) {
  const data = orderRequest.data;
  console.log('Received order:', data);
  // TODO: some kind of evaluation of if the price is right.
  const signature = data.signature;
  const order = data.order;

  // Slow down the solver
  await wait(Number(process.env.SLOWDOWN ?? 0));

  // TODO: Correct type casting.
  const transactionResponse = await initiateOrder(order, signature);
  console.log({ hash: transactionResponse?.hash });

  const transactionReceipt = await transactionResponse.wait(2);

  // Probably the better way to do this is to look for the initiate events
  // Check if it was us and then fill. It is simpler to just check if the transaction went through.
  if (transactionReceipt.status === 0) return;

  // We need the actual orderKey. (The one provided in the call is just an estimate.)
  const logs = transactionReceipt.logs;
  // Get the orderInitiated event.
  let orderKeyLog: ethers.Log;
  for (const log of logs) {
    if (log.address !== order.settlementContract) continue;
    if (
      log.topics[0] !==
      '0x068f390a186ab224f3ad01f21c41b507b6c4e715dcfd2e640ce83b784071eb3f'
    )
      continue;
    orderKeyLog = log; // TODO: Parse log.data.
  }
  if (orderKeyLog === undefined)
    throw Error(
      `Tx ${transactionResponse.hash} was initiated and status !== 0, but couldn't find OrderInitiated event in logs`,
    );
  const reactorInterface = BaseReactor__factory.createInterface();
  const parsedLog = reactorInterface.decodeEventLog(
    'OrderInitiated',
    orderKeyLog.data,
  );
  const orderKey = parsedLog.orderKey as OrderKey;

  await fillOutputs(orderKey);

  ws.send(
    JSON.stringify({
      event: 'solver-order-initiated',
      data: {
        origin: 'catalyst-solver',
        nonce: order.nonce.toString(),
        swapper: order.swapper.toString(),
      },
    }),
  );
}
