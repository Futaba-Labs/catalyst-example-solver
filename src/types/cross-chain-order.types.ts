export type Input = {
  token: string;
  amount: bigint;
};
export type OutputDescription = {
  remoteOracle: string;
  token: string;
  amount: bigint;
  recipient: string;
  chainId: bigint;
  remoteCall: string;
};

export type DutchAuctionData = {
  type: 'DutchAuction'; // Not to be submitted
  verificationContext: string;
  verificationContract: string;
  proofDeadline: bigint;
  challengeDeadline: bigint;
  collateralToken: string;
  fillerCollateralAmount: bigint;
  challengerCollateralAmount: bigint;
  localOracle: string;
  slopeStartingTime: bigint;
  inputSlopes: string[];
  outputSlopes: string[];
  inputs: Input[];
  outputs: OutputDescription[];
};

export type LimitOrderData = {
  type: 'LimitOrder'; // Not to be submitted
  proofDeadline: bigint;
  challengeDeadline: bigint;
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
  nonce: string;
  originChainId: bigint;
  initiateDeadline: bigint;
  fillDeadline: bigint;
  orderData: DutchAuctionData | LimitOrderData;
};
