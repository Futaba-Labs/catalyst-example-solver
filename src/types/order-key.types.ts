import type { Input, OutputDescription } from "./cross-chain-order.types";}

export type ReactorInfo = {
    reactor: string;
    fillDeadline: bigint;
    challengeDeadline: bigint;
    proofDeadline: bigint;
}

export type Collateral = {
    collateralToken: string;
    fillerCollateralAmount: bigint;
    challengerCollateralAmount: bigint;
}

export type OrderKey = {
     reactorContext: ReactorInfo;
    swapper: string;
    nonce: bigint;
    collateral: Collateral;
    originChainId: bigint;
    localOracle: string;
    inputs: Input[];
    outputs: OutputDescription[];
}
