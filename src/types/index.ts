export interface CatalystEvent<T> {
  event: string;
  data: T;
}

export interface CatalystQuoteRequestData {
  quoteRequestId: string;
  fromChain: string;
  toChain: string;
  fromAsset: string;
  toAsset: string;
  expirationTime: string;
  amount: string;
}

export interface CatalystOrderData {
  orderKeyHash: string | null;
  orderType: 'LimitOrder' | 'DutchAuction';
  orderData: {
    type: string;
    inputs: any[];
    outputs: any[];
    inputSlopes: any[];
    localOracle: string;
    outputSlopes: any[];
    proofDeadline: number;
    collateralToken: string;
    challengeDeadline: number;
    slopeStartingTime: number;
    verificationContext: string;
    verificationContract: string;
    fillerCollateralAmount: number;
    challengerCollateralAmount: number;
  };
  quoteContext: {
    // TODO: should we add a solver identifier here?
    toAsset: string;
    toPrice: string;
    discount: string;
    fromAsset: string;
    fromPrice: string;
    intermediary: string;
  };
  settlementContractAddress: string;
  swapperAddress: string;
  nonce: number;
  originChainId: number;
  initiatedDeadline: number;
  fillDeadline: number;
  signature: string;
}
