export type Input = {
  token: string;
  amount: bigint;
};
export type OutputDescription = {
  remoteOracle: string;
  token: string;
  amount: bigint;
  recipient: string;
  chainId: number;
  remoteCall: string;
};

export type DutchAuctionData = {
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
};

export type LimitOrderData = {
  type: 'LimitOrder'; // Not to be submitted
  proofDeadline: number;
  challengeDeadline: number;
  collateralToken: string;
  fillerCollateralAmount: bigint;
  challengerCollateralAmount: bigint;
  localOracle: string;
  inputs: Input[];
  outputs: OutputDescription[];
};

// With the CrossChainOrder defined as such:
export type CrossChainOrder = {
  settlementContract: string;
  swapper: string;
  nonce: number;
  originChainId: number;
  initiateDeadline: number;
  fillDeadline: number;
  orderData: DutchAuctionData | LimitOrderData;
};
