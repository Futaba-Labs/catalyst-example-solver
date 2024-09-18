import { initiateOrder, provider, signer } from 'src/execution/order.initiate';
import { CatalystEvent, CatalystOrderData, CrossChainOrder } from '../types';
import { WebSocket } from 'ws';
import { BaseReactor__factory } from 'lib/contracts';
import { ethers } from 'ethers';
import {
  EvmSDK,
  PermitBatchTransferFrom,
  Witness,
} from '@catalabs/catalyst-sdk';
import { OrderKey } from 'src/types/order-key.types';
import { fillOutputs } from 'src/execution/order.fill';

import { isFromBTCToEvm } from 'src/utils';

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

  if (isFromBTCToEvm(data.quote.fromAsset)) {
    await handleSignNonEVMToEVMOrder(order, data.meta.destinationAddress, ws);
  } else {
    await handleInitiateEVMToNonEVMOrder(order, signature, ws);
  }
}

export async function handleInitiateEVMToNonEVMOrder(
  order: CrossChainOrder,
  signature: string,
  ws: WebSocket,
) {
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

  // TODO: pass signer
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

export async function handleSignNonEVMToEVMOrder(
  order: CrossChainOrder,
  destinationAddress: string | undefined,
  ws: WebSocket,
) {
  if (!destinationAddress) {
    console.error('No destination address provided');
    return;
  }
  const sdk = new EvmSDK({
    provider: provider,
  });
  await sdk.connectSigner(signer);
  // TODO: check allowance (optional)
  // const allowance = await sdk.checkAllowance(
  //   USDC_ADDRESS,
  //   address,
  //   PERMIT2_ADDRESS,
  // );

  // TODO 2: if allowance too small bump allowance
  // but prob should not even be there but in a dedicated service that will monitor the allowances
  // await sdk.increaseAllowance(USDC_ADDRESS, PERMIT2_ADDRESS, ethers.MaxUint256);

  // TODO: run checks on the order fields

  // TODO: if checks not satisifed send a ws error message back to order server to reject the order

  // TODO: Limir order only support for now (same for frontend)
  const nonce = BigInt(Math.floor(Math.random() * 10 ** 18));
  const swapper = signer.address;

  // assign solver's fields for permit2
  order.nonce = nonce;
  order.swapper = swapper;

  // this is provided from the meta fields
  // TODO: do we need to verify this with the recipient? How can we derive the bitcoin destination address?
  // const toAddress = destinationAddress;

  const permit: PermitBatchTransferFrom = {
    permitted: [...order.orderData.inputs],
    spender: order.settlementContract,
    nonce,
    deadline: BigInt(order.initiateDeadline),
  };

  const witness: Witness = {
    witnessTypeName: 'CrossChainOrder',
    witnessType: {
      CrossChainOrder: [
        { name: 'settlementContract', type: 'address' },
        { name: 'swapper', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'originChainId', type: 'uint32' },
        { name: 'initiateDeadline', type: 'uint32' },
        { name: 'fillDeadline', type: 'uint32' },
        { name: 'orderData', type: 'CatalystLimitOrderData' },
      ],
      CatalystLimitOrderData: [
        { name: 'proofDeadline', type: 'uint32' },
        { name: 'challengeDeadline', type: 'uint32' },
        { name: 'collateralToken', type: 'address' },
        { name: 'fillerCollateralAmount', type: 'uint256' },
        { name: 'challengerCollateralAmount', type: 'uint256' },
        { name: 'localOracle', type: 'address' },
        { name: 'inputs', type: 'Input[]' },
        { name: 'outputs', type: 'OutputDescription[]' },
      ],
      Input: [
        { name: 'token', type: 'address' },
        { name: 'amount', type: 'uint256' },
      ],
      OutputDescription: [
        { name: 'remoteOracle', type: 'bytes32' },
        { name: 'token', type: 'bytes32' },
        { name: 'amount', type: 'uint256' },
        { name: 'recipient', type: 'bytes32' },
        { name: 'chainId', type: 'uint32' },
        { name: 'remoteCall', type: 'bytes' },
      ],
    },
    witness: order,
  };

  const signature = await sdk.signPermitBatchTransferFrom(permit, witness);

  ws.send(
    JSON.stringify({
      event: 'solver-order-signed',
      data: {
        origin: 'catalyst-solver',
        order,
        signature,
      },
    }),
  );
}
