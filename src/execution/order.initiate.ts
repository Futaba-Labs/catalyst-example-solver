import { ethers } from 'ethers';
import { createFillerData } from './order.fillerdata';
import { BaseReactor__factory, ERC20__factory } from 'lib/contracts';

type CrossChainOrder = any;

export const SOLVER_ADDRESS = '0x1234';
export const DEFAULT_UW_INCENTIVE = 0.01; // 1%

enum OracleType {
  EVM = 'EVM',
  Bitcoin = 'Bitcoin',
}
export const approvedOracles = Map<string, Map<string, OracleType | undefined>>;

const supportedCollateralTokens = Map<string, boolean>;

async function evaluateOrder(order: CrossChainOrder): Promise<boolean> {
  // Check reactor address
  // Check if we support the collateral.
  if (!supportedCollateralTokens[order.orderData.collateral]) return false;
  // Check local oracle.
  const localChain = order.originChainId;
  const localOracle = order.orderData.localOracle;
  const localOracleType = approvedOracles[localOracle][localChain];
  if (localOracleType === undefined) return false;
  // Check each remote oracle
  let isBitcoin: undefined | true | false = undefined;
  for (const output of order.orderData.outputs) {
    const remoteOracle = output.remoteOracle;
    const remoteChain = output.chainid;
    if (remoteChain === localChain) {
      isBitcoin = true;
      if (localOracle !== remoteOracle) return false;
    }
    // Check remote oracles.
    const remoteOracleType = approvedOracles[remoteOracle][remoteChain];
    if (remoteOracleType === undefined) return false;
    // Check chain ids:
    // TODO:
    // Check VM connections
    // TODO:
    if (isBitcoin === undefined)
      isBitcoin = remoteOracleType === OracleType.Bitcoin;
    // If one output is Bitcoin then all outputs must be Bitcoin.
    if ((isBitcoin === true) !== (remoteOracleType === OracleType.Bitcoin))
      return false;
    if (localOracleType === OracleType.Bitcoin) {
      // Check that the output has been formatted correctly.
      // TODO:
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

  const collateralTkn = ERC20__factory.connect(order.orderData.colalteral);
  // For collateral.
  if (
    (await collateralTkn.balanceOf(SOLVER_ADDRESS)) <
    order.orderData.collateralAmount
  )
    return false;

  // Check if we have set an approval. Set if not.
  if ((await collateralTkn.allowance(SOLVER_ADDRESS, reactorAddress)) === 0n) {
    collateralTkn.approve(reactorAddress, ethers.MaxUint256);
  }
  return true;
}

export async function submit_order(order: CrossChainOrder, signature: string) {
  // TODO: some kind of order validation, maybe shared with other endpoints? (broadcast order
  if (!(await evaluateOrder(order))) return;

  const fillerData = createFillerData(SOLVER_ADDRESS, DEFAULT_UW_INCENTIVE);

  // Define the reactor we will call. You can get the reactor address from the order
  const reactorAddress = order.settlementContract;
  BaseReactor__factory;
  const reactor = BaseReactor__factory.connect(reactorAddress);

  // Call the reactor to initiate the order.
  return reactor.initiate(order, signature, fillerData);
}
