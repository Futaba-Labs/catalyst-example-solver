import {
  EvmSDK,
  PermitBatchTransferFrom,
  Witness,
} from '@catalabs/catalyst-sdk';
import { WebSocket } from 'ws';
import { AddressType } from 'bitcoin-address-validation';
import { BTC_TOKEN_ADDRESS_PREFIX } from 'src/common/constants';
import { bitcoinAddress } from 'src/execution/bitcoin/bitcoin.wallet';
import {
  getOrderTypeFromOracle,
  OracleType,
  provider,
  signer,
} from 'src/execution/order.initiate';
import { CatalystEvent, CatalystOrderData } from 'src/types';
import { CatalystWsEventType } from 'src/types/events';
import {
  getBitcoinAddressVersion,
  getSwapRecipientFromAddress,
  wait,
} from 'src/utils';

const sdk = new EvmSDK({
  provider: provider,
});
sdk.connectSigner(signer).catch((e) => console.error(e));

export async function handleNonVmOrder(
  orderRequest: CatalystEvent<CatalystOrderData>,
  ws: WebSocket,
) {
  const { data } = orderRequest;
  if (!data) {
    console.error(`No data in ${orderRequest.event}`);
    return;
  }
  const { order } = data;

  if (!order) {
    console.error(`No order or signature in ${orderRequest.event}`);
    return;
  }

  await wait(Number(process.env.SLOWDOWN ?? 0));

  // TODO: check allowance (optional)
  // const allowance = await sdk.checkAllowance(
  //   USDC_ADDRESS,
  //   address,
  //   PERMIT2_ADDRESS,
  // );

  // TODO 2: if allowance too small bump allowance
  // but prob should not even be there but in a dedicated service that will monitor the allowances
  // await sdk.increaseAllowance(USDC_ADDRESS, PERMIT2_ADDRESS, ethers.MaxUint256);

  // TODO: Limir order only support for now (same for frontend)
  // TODO: store and map allowances. It is cheaper to use nonces that are right after each other
  const nonce = BigInt(Math.floor(Math.random() * 10 ** 18));
  const swapper = signer.address;

  // assign solver's fields for permit2
  order.nonce = nonce;
  order.swapper = swapper;

  // In production this should be configured based on the tx size.
  // 1 is not secure.
  // 2 is secure for anything below 1-2 block rewards as I am writing, that is ~$3k-$6k.
  // 3 is very secure for small transaction (around 3-4 block rewards).
  // 4 is secure for large transactions 5-6 block rewards.
  // 5 is secure for all but the largest swaps.
  // 6 is generally regarded as final.
  const numConfirmationsRequired = 3;

  const addressType = AddressType.p2wpkh;
  const addressTypeIndex = getBitcoinAddressVersion(addressType);

  const token =
    BTC_TOKEN_ADDRESS_PREFIX +
    numConfirmationsRequired.toString(16).padStart(2, '0') +
    addressTypeIndex.toString(16).padStart(2, '0');
  // TODO: validate that the below address is indeed the right decoded recipient.
  const recipient = getSwapRecipientFromAddress(bitcoinAddress, addressType);

  // Fill in the recipient fields in the output.
  // First, lets ensure that that there is either 0 or 1 output.
  const outputs = order.orderData.outputs;
  if (outputs.length != 1) {
    throw Error(`Multiple outputs found: ${outputs.length}`);
  }
  // Select the provided output
  const output = outputs[0];
  // Set us as the recipient.
  outputs[0] = { ...output, recipient, token, remoteCall: '0x' };

  // Run checks on the order fields
  const oracleType = getOrderTypeFromOracle(order);
  if (oracleType !== OracleType.Bitcoin) {
    // TODO: if checks not satisifed send a ws error message back to order server to reject the order
    throw Error(`Order Falied Validation`);
  }

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

  // this is necessary
  ws.send(
    JSON.stringify(
      {
        event: CatalystWsEventType.SOLVER_ORDER_SIGNED,
        data: {
          order,
          signature,
          orderIdentifier: orderRequest.data.meta.orderIdentifier,
        },
      },
      (key, value) => (typeof value === 'bigint' ? value.toString() : value), // return everything else unchanged
    ),
  );
}
