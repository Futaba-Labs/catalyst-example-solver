import { ethers } from 'ethers';
import { BaseReactor__factory, ERC20__factory } from 'lib/contracts';
import { CrossChainOrder } from 'src/types/cross-chain-order.types';
import { createFillerData } from './order.fillerdata';
import { encodeOrderData } from './order.helpers';

export const SOLVER_ADDRESS = '0x1234';
export const DEFAULT_UW_INCENTIVE = 0.01; // 1%
export const BITCOIN_IDENTIFIER =
  '000000000000000000000000BC0000000000000000000000000000000000';

enum OracleType {
  EVM = 'EVM',
  Bitcoin = 'Bitcoin',
}

// TODO: move this into a config.
// Chain for address for type
export const approvedOracles = Map<string, Map<string, OracleType | undefined>>;
// TODO: Not hardcode
approvedOracles['84532']['0x3cA2BC13f63759D627449C5FfB0713125c24b019'] =
  OracleType.Bitcoin;
const supportedCollateralTokens = Map<string, Map<string, boolean>>;
supportedCollateralTokens['84532'][
  '0x0000000000000000000000000000000000000000'
] = true;

async function evaluateOrder(order: CrossChainOrder): Promise<boolean> {
  // Check reactor address
  // Check if we support the collateral.
  if (!supportedCollateralTokens[order.orderData.collateralToken]) return false;
  // Check local oracle.
  const localChain = order.originChainId;
  const localOracle = order.orderData.localOracle;
  const localOracleType = approvedOracles[localOracle][localChain];
  if (localOracleType === undefined) return false;
  // Check each remote oracle
  let isBitcoin: undefined | true | false = undefined;
  for (const output of order.orderData.outputs) {
    const remoteOracle = output.remoteOracle;
    const remoteChain = output.chainId;
    if (remoteChain === localChain) {
      isBitcoin = true;
      if (localOracle !== remoteOracle) return false;
    }
    // Check remote oracles.
    const remoteOracleType = approvedOracles[remoteOracle][remoteChain];
    if (remoteOracleType === undefined) return false;
    // TODO: Check chain ids:
    // TODO: Check VM connections
    // TODO: Check timings.
    if (isBitcoin === undefined)
      isBitcoin = remoteOracleType === OracleType.Bitcoin;
    // If one output is Bitcoin then all outputs must be Bitcoin.
    if ((isBitcoin === true) !== (remoteOracleType === OracleType.Bitcoin))
      return false;
    if (localOracleType === OracleType.Bitcoin) {
      // Check that the output has been formatted correctly.
      // Sanity check since we use the slice a lot. Should never trigger.
      if (output.token.replace('0x', '').length != 64)
        throw Error(
          `Unexpected token length ${output.token.length} for ${output.token}`,
        );
      if (output.token.replace('0x', '').slice(0, 64 - 4) != BITCOIN_IDENTIFIER)
        return false;
      const numConfirmations = Number(
        '0x' + output.token.replace('0x', '').slice(64 - 4, 64 - 2),
      );
      if (numConfirmations > 3) return false;
      // TODO: Check if this number of confirmations fits into a 99% proof interval.
      const addressVersion = Number(
        '0x' + output.token.replace('0x', '').slice(64 - 2, 64),
      );
      if (addressVersion === 0 || addressVersion > 5) return false;
    } else {
      const outputToken = ERC20__factory.connect(output.token);
      if ((await outputToken.balanceOf(SOLVER_ADDRESS)) < output.amount)
        return false;
    }
  }
  // Only allow 1 Bitcoin output.
  if (isBitcoin && order.orderData.outputs.length > 1) return false;
  // Check if we have balance.
  const reactorAddress = order.settlementContract;

  const collateralTkn = ERC20__factory.connect(order.orderData.collateralToken);
  // For collateral.
  if (
    (await collateralTkn.balanceOf(SOLVER_ADDRESS)) <
    order.orderData.fillerCollateralAmount
  )
    return false;

  // Check if we have set an approval. Set if not.
  if ((await collateralTkn.allowance(SOLVER_ADDRESS, reactorAddress)) === 0n) {
    collateralTkn.approve(reactorAddress, ethers.MaxUint256);
  }
  return true;
}

export async function initiateOrder(order: CrossChainOrder, signature: string) {
  // TODO: some kind of order validation, maybe shared with other endpoints? (broadcast order
  if (!(await evaluateOrder(order))) return;

  const fillerData = createFillerData(SOLVER_ADDRESS, DEFAULT_UW_INCENTIVE);

  // Define the reactor we will call. You can get the reactor address from the order
  const reactorAddress = order.settlementContract;
  BaseReactor__factory;
  const reactor = BaseReactor__factory.connect(reactorAddress);

  // Encode the orderdata for delivery.
  const encodedOrderData = encodeOrderData(order.orderData);
  const preparedOrder = { ...order, orderData: encodedOrderData };

  // Call the reactor to initiate the order.
  return reactor.initiate(preparedOrder, signature, fillerData);
}
