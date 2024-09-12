import { ethers } from 'ethers';
import { BaseReactor__factory, ERC20__factory } from 'lib/contracts';
import { CrossChainOrder } from 'src/types/cross-chain-order.types';
import { createFillerData } from './order.fillerdata';
import { encodeOrderData } from './order.helpers';

export const SOLVER_ADDRESS = '0x1234';
export const DEFAULT_UW_INCENTIVE = 0.01; // 1%
export const BITCOIN_IDENTIFIER =
  '000000000000000000000000BC0000000000000000000000000000000000'.toLowerCase();

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(SOLVER_PK).connect(provider);

enum OracleType {
  EVM = 'EVM',
  Bitcoin = 'Bitcoin',
}

// TODO: move this into a config.
// Chain for address for type
export const approvedOracles = new Map<
  number,
  Map<string, OracleType | undefined>
>();
approvedOracles.set(84532, new Map<string, OracleType | undefined>());
approvedOracles
  .get(84532)!
  .set(
    '0x4A698444A0982d8C954C94eC18C00c8c1Ce10939'.toLowerCase(),
    OracleType.Bitcoin,
  );
approvedOracles
  .get(84532)!
  .set(
    '0x4A698444A0982d8C954C94eC18C00c8c1Ce10939'.toLowerCase().padEnd(66, '0'),
    OracleType.Bitcoin,
  );
approvedOracles
  .get(84532)!
  .set(
    '0x3cA2BC13f63759D627449C5FfB0713125c24b019'.toLowerCase(),
    OracleType.Bitcoin,
  );
approvedOracles
  .get(84532)!
  .set(
    '0x3cA2BC13f63759D627449C5FfB0713125c24b019'.toLowerCase().padEnd(66, '0'),
    OracleType.Bitcoin,
  );

const supportedCollateralTokens = new Map<number, Map<string, boolean>>();
supportedCollateralTokens.set(84532, new Map<string, boolean>());
supportedCollateralTokens
  .get(84532)!
  .set('0x036CbD53842c5426634e7929541eC2318f3dCF7e'.toLowerCase(), true);

async function evaluateOrder(order: CrossChainOrder): Promise<boolean> {
  // TODO: Check reactor address
  // Check local oracle.
  const localChain = order.originChainId;
  const localOracle = order.orderData.localOracle;
  const localOracleType = approvedOracles
    .get(localChain)
    ?.get(localOracle.toLowerCase());
  if (localOracleType === undefined) {
    console.log(`Order Eval: Local Oracle ${localChain}:${localOracle}`);
    return false;
  }
  // Check each remote oracle
  let isBitcoin: undefined | true | false = undefined;
  for (const output of order.orderData.outputs) {
    const remoteOracle = output.remoteOracle;
    const remoteChain = output.chainId;
    if (remoteChain === localChain) {
      isBitcoin = true;
      if (
        localOracle !== remoteOracle.slice(0, 42) &&
        remoteOracle.slice(42).replace('0', '').length === 0
      ) {
        console.log(
          `Order Eval: Same chain but different local & remote oracle ${localChain}:${localOracle} != ${remoteOracle}`,
        );
        return false;
      }
    }
    // Check remote oracles.
    const remoteOracleType = approvedOracles
      .get(remoteChain)
      ?.get(remoteOracle.toLowerCase());
    if (remoteOracleType === undefined) {
      console.log(`Order Eval: Remote Oracle ${remoteChain}:${remoteOracle}`);
      return false;
    }
    // TODO: Check chain ids:
    // TODO: Check VM connections
    // TODO: Check timings.
    if (isBitcoin === undefined)
      isBitcoin = remoteOracleType === OracleType.Bitcoin;
    // If one output is Bitcoin then all outputs must be Bitcoin.
    if ((isBitcoin === true) !== (remoteOracleType === OracleType.Bitcoin)) {
      console.log(
        `Order Eval: Not Bitcoin Oracle ${remoteChain}:${remoteOracle}`,
      );
      return false;
    }
    if (localOracleType === OracleType.Bitcoin) {
      // Check that the output has been formatted correctly.
      // Sanity check since we use the slice a lot. Should never trigger.
      if (output.token.replace('0x', '').length != 64)
        throw Error(
          `Unexpected token length ${output.token.length} for ${output.token}`,
        );
      if (
        output.token
          .replace('0x', '')
          .slice(0, 64 - 4)
          .toLowerCase() != BITCOIN_IDENTIFIER
      ) {
        console.log(`Order Eval: Not Bitcoin Token ${output.token}`);
        return false;
      }
      const numConfirmations = Number(
        '0x' + output.token.replace('0x', '').slice(64 - 4, 64 - 2),
      );
      if (numConfirmations > 3) {
        console.log(
          `Order Eval: Not many confirmations required ${output.token}, ${numConfirmations}`,
        );
        return false;
      }
      // TODO: Check if this number of confirmations fits into a 99% proof interval.
      const addressVersion = Number(
        '0x' + output.token.replace('0x', '').slice(64 - 2, 64),
      );
      if (addressVersion === 0 || addressVersion > 5) {
        console.log(
          `Order Eval: Unsupported Bitcoin Address Version ${output.token}, ${addressVersion}`,
        );
        return false;
      }
      if (output.remoteCall.replace('0x', '') != '') {
        console.log(
          `Order Eval: Bitcoin Remote call not empty ${output.token}, ${output.remoteCall}`,
        );
        return false;
      }
    } else {
      const outputToken = ERC20__factory.connect(output.token, provider);
      const balance = await outputToken.balanceOf(SOLVER_ADDRESS);
      if (balance < output.amount) {
        console.log(
          `Order Eval: Low ERC20 balance ${output.token}, ${balance}`,
        );
        return false;
      }
    }
  }
  // Only allow 1 Bitcoin output.
  if (isBitcoin && order.orderData.outputs.length > 1) return false;
  // Check if we have balance.
  const reactorAddress = order.settlementContract;

  const collateralTkn = ERC20__factory.connect(
    order.orderData.collateralToken,
    provider,
  );
  // TODO: fixFor collateral.
  if (order.orderData.fillerCollateralAmount > 0n) {
    // Check if we support the collateral.
    if (
      !supportedCollateralTokens
        .get(order.originChainId)
        ?.get(order.orderData.collateralToken.toLowerCase())
    ) {
      // TODO: logging
      console.log(
        `Order Eval: Unsupported Collateral Token ${order.originChainId}:${order.orderData.collateralToken}`,
      );
      return false;
    }
    if (
      (await collateralTkn.balanceOf(SOLVER_ADDRESS)) <
      order.orderData.fillerCollateralAmount
    )
      return false;

    // Check if we have set an approval. Set if not.
    if (
      (await collateralTkn.allowance(SOLVER_ADDRESS, reactorAddress)) === 0n
    ) {
      collateralTkn.approve(reactorAddress, ethers.MaxUint256);
    }
    return true;
  }
  return true;
}

export async function initiateOrder(order: CrossChainOrder, signature: string) {
  // TODO: some kind of order validation, maybe shared with other endpoints? (broadcast order
  const evaluation = await evaluateOrder(order);
  if (!evaluation) return;

  const fillerData = createFillerData(SOLVER_ADDRESS, DEFAULT_UW_INCENTIVE);

  // Define the reactor we will call. You can get the reactor address from the order
  const reactorAddress = order.settlementContract;

  const reactor = BaseReactor__factory.connect(reactorAddress, signer);

  // Encode the orderdata for delivery.
  const encodedOrderData = encodeOrderData(order.orderData);
  const preparedOrder = { ...order, orderData: encodedOrderData };

  // Call the reactor to initiate the order.
  return reactor.initiate(preparedOrder, signature, fillerData);
}
