export interface Input {
  token: string;
  amount: bigint;
}
export interface OutputDescription {
  remoteOracle: string;
  token: string;
  amount: bigint;
  recipient: string;
  chainId: number;
  remoteCall: string;
}

export interface DutchAuctionOrderData {
  type: 'DutchAuction'; // Not to be submitted
  verificationContext: string;
  verificationContract: string;
  proofDeadline: number;
  challengeDeadline: number;
  collateralToken: string;
  fillerCollateralAmount: bigint;
  challengerCollateralAmount: bigint;
  localOracle: string;
  slopeStartingTime: number;
  inputSlopes: string[];
  outputSlopes: string[];
  inputs: Input[];
  outputs: OutputDescription[];
}

export interface LimitOrderData {
  type: 'LimitOrder'; // Not to be submitted
  proofDeadline: number;
  challengeDeadline: number;
  collateralToken: string;
  fillerCollateralAmount: bigint;
  challengerCollateralAmount: bigint;
  localOracle: string;
  inputs: Input[];
  outputs: OutputDescription[];
}

// With the CrossChainOrder defined as such:
export interface CrossChainOrder {
  settlementContract: string;
  swapper: string;
  nonce: bigint;
  originChainId: number;
  initiateDeadline: number;
  fillDeadline: number;
  orderData: DutchAuctionOrderData | LimitOrderData;
}
