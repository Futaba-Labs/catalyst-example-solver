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

export type ReactorInfo = {
  reactor: string;
  fillDeadline: bigint;
  challengeDeadline: bigint;
  proofDeadline: bigint;
};

export type Collateral = {
  collateralToken: string;
  fillerCollateralAmount: bigint;
  challengerCollateralAmount: bigint;
};

export type OrderKey = {
  reactorContext: ReactorInfo;
  swapper: string;
  nonce: bigint;
  collateral: Collateral;
  originChainId: bigint;
  localOracle: string;
  inputs: Input[];
  outputs: OutputDescription[];
};
