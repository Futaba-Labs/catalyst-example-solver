import 'dotenv/config';

import { ethers } from 'ethers';
import { BaseReactor__factory, ERC20__factory } from 'lib/contracts';
import { createFillerData } from './order.fillerdata';
import { encodeOrderData } from './order.helpers';
import { CrossChainOrder } from 'src/types/cross-chain-order.types';
import { formatRemoteOracleAddress } from 'src/utils';

export const RPC_URL = process.env.RPC_URL;
export const SOLVER_PK = process.env.SOLVER_PK;
export const SOLVER_ADDRESS = process.env.SOLVER_ADDRESS;
export const DEFAULT_UW_INCENTIVE = 0.01; // 1%
export const BITCOIN_IDENTIFIER =
  '000000000000000000000000BC0000000000000000000000000000000000'.toLowerCase();

export const provider = new ethers.JsonRpcProvider(RPC_URL);
export const signer = new ethers.Wallet(SOLVER_PK).connect(provider);

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
    formatRemoteOracleAddress('0x4A698444A0982d8C954C94eC18C00c8c1Ce10939'),
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
    formatRemoteOracleAddress('0x3cA2BC13f63759D627449C5FfB0713125c24b019'),
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
  const { originChainId, orderData, settlementContract } = order;
  const { localOracle, outputs, collateralToken, fillerCollateralAmount } =
    orderData;

  const localOracleType = approvedOracles
    .get(originChainId)
    ?.get(localOracle.toLowerCase());
  if (!localOracleType) {
    console.log(`Order Eval: Local Oracle ${originChainId}:${localOracle}`);
    return false;
  }

  // Check each remote oracle
  let isBitcoin: boolean | undefined;
  for (const output of outputs) {
    const { chainId, remoteOracle, token, amount, remoteCall } = output;
    const remoteOracleType = approvedOracles
      .get(chainId)
      ?.get(remoteOracle.toLowerCase());
    if (!remoteOracleType) {
      console.log(`Order Eval: Remote Oracle ${chainId}:${remoteOracle}`);
      return false;
    }

    // TODO: Check chain ids:
    // TODO: Check VM connections
    // TODO: Check timings.
    // If one output is Bitcoin then all outputs must be Bitcoin.
    isBitcoin = remoteOracleType === OracleType.Bitcoin;
    if (isBitcoin !== (localOracleType === OracleType.Bitcoin)) {
      console.log(`Order Eval: Not Bitcoin Oracle ${chainId}:${remoteOracle}`);
      return false;
    }

    if (isBitcoin) {
      if (!validateBitcoinOutput(token, remoteCall)) {
        return false;
      }
    } else {
      const outputToken = ERC20__factory.connect(token, provider);
      const balance = await outputToken.balanceOf(SOLVER_ADDRESS);
      if (balance < amount) {
        console.log(`Order Eval: Low ERC20 balance ${token}, ${balance}`);
        return false;
      }
    }
  }

  // Only allow 1 Bitcoin output.
  if (isBitcoin && outputs.length > 1) {
    return false;
  }

  // Check if we have balance.
  const collateralTkn = ERC20__factory.connect(collateralToken, provider);
  // TODO: fixFor collateral.
  // Check if we support the collateral.
  if (fillerCollateralAmount > 0n) {
    if (
      !supportedCollateralTokens
        .get(originChainId)
        ?.get(collateralToken.toLowerCase())
    ) {
      // TODO: logging
      console.log(
        `Order Eval: Unsupported Collateral Token ${originChainId}:${collateralToken}`,
      );
      return false;
    }

    if (
      (await collateralTkn.balanceOf(SOLVER_ADDRESS)) < fillerCollateralAmount
    ) {
      return false;
    }

    // Check if we have set an approval. Set if not.
    if (
      (await collateralTkn.allowance(SOLVER_ADDRESS, settlementContract)) === 0n
    ) {
      collateralTkn.approve(settlementContract, ethers.MaxUint256);
    }
  }

  return true;
}

function validateBitcoinOutput(token: string, remoteCall: string): boolean {
  // Check that the output has been formatted correctly.
  // Sanity check since we use the slice a lot. Should never trigger.
  if (token.replace('0x', '').length !== 64) {
    throw Error(`Unexpected token length ${token.length} for ${token}`);
  }

  if (
    token
      .replace('0x', '')
      .slice(0, 64 - 4)
      .toLowerCase() !== BITCOIN_IDENTIFIER
  ) {
    console.log(`Order Eval: Not Bitcoin Token ${token}`);
    return false;
  }

  const numConfirmations = Number(
    '0x' + token.replace('0x', '').slice(64 - 4, 64 - 2),
  );
  if (numConfirmations > 3) {
    console.log(
      `Order Eval: Too many confirmations required ${token}, ${numConfirmations}`,
    );
    return false;
  }

  // TODO: Check if this number of confirmations fits into a 99% proof interval.
  const addressVersion = Number(
    '0x' + token.replace('0x', '').slice(64 - 2, 64),
  );
  if (addressVersion === 0 || addressVersion > 5) {
    console.log(
      `Order Eval: Unsupported Bitcoin Address Version ${token}, ${addressVersion}`,
    );
    return false;
  }

  if (remoteCall.replace('0x', '') !== '') {
    console.log(
      `Order Eval: Bitcoin Remote call not empty ${token}, ${remoteCall}`,
    );
    return false;
  }
  return true;
}

export async function initiateOrder(order: CrossChainOrder, signature: string) {
  // TODO: some kind of order validation, maybe shared with other endpoints? (broadcast order
  const isValid = await evaluateOrder(order);
  if (!isValid) {
    return;
  }

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
