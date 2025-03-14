import { Log } from "ethers";
import { WebSocket } from "ws";
import { BaseReactor__factory } from "lib/contracts";
import { fillOutputs } from "src/execution/order.fill";
import { initiateOrder } from "src/execution/order.initiate";
import { CatalystEvent, CatalystOrderData } from "src/types";
import { CatalystWsEventType } from "src/types/events";
import { OrderKey } from "src/types/order-key.types";
import { wait } from "src/utils";
import { provider } from "src/common/signer";

export async function handleVmOrder(
  orderRequest: CatalystEvent<CatalystOrderData>,
  ws: WebSocket,
) {
  console.dir(orderRequest, {
    depth: 10,
  });
  return;
  const { data } = orderRequest;
  if (!data) {
    console.error(`No data in ${orderRequest.event}`);
    return;
  }
  const { order, signature } = data;

  if (!order || !signature) {
    console.error(`No order or signature in ${orderRequest.event}`);
    return;
  }

  await wait(Number(process.env.SLOWDOWN ?? 0));

  // TODO: some kind of evaluation of if the price is right.

  const transactionResponse = await initiateOrder(order, signature);
  console.log({ hash: transactionResponse?.hash });

  // const transactionReceipt = await transactionResponse.wait(2);
  // FIXME: hash can be null
  const transactionReceipt = await provider.waitForTransaction(
    transactionResponse.hash,
    2,
  );

  // Probably the better way to do this is to look for the initiate events
  // Check if it was us and then fill. It is simpler to just check if the transaction went through.
  if (transactionReceipt.status === 0) return;

  // We need the actual orderKey. (The one provided in the call is just an estimate.)
  const logs = transactionReceipt.logs;
  // Get the orderInitiated event.
  let orderKeyLog: Log;
  for (const log of logs) {
    if (log.address !== order.settlementContract) continue;
    if (
      log.topics[0] !==
      "0x068f390a186ab224f3ad01f21c41b507b6c4e715dcfd2e640ce83b784071eb3f"
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
    "OrderInitiated",
    orderKeyLog.data,
  );
  const orderKey = parsedLog.orderKey as OrderKey;

  await fillOutputs(orderKey);

  // this is not necessary but recommended
  ws.send(
    JSON.stringify({
      event: CatalystWsEventType.SOLVER_ORDER_INITIATED,
      data: {
        nonce: order.nonce.toString(),
        swapper: order.swapper.toString(),
      },
    }),
  );
}
