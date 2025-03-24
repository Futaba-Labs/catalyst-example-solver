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

interface Input {
  token: string;
  amount: bigint;
}

interface OutputDescription {
  remoteOracle: string;
  token: string;
  amount: bigint;
  recipient: string;
  chainId: number;
  remoteCall: string;
}

export interface LimitOrderData {
  type: "LimitOrder";
  proofDeadline: number;
  challengeDeadline: number;
  collateralToken: string;
  fillerCollateralAmount: bigint;
  challengerCollateralAmount: bigint;
  localOracle: string;
  inputs: Input[];
  outputs: OutputDescription[];
}

export interface DutchAuctionOrderData {
  type: "DutchAuction";
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

// order data is encoded as bytes, we will prob not use but it's here in case
export interface CrossChainOrderEncoded {
  settlementContract: string;
  swapper: string;
  nonce: bigint;
  originChainId: number;
  initiateDeadline: number;
  fillDeadline: number;
  orderData: string;
}

export interface CrossChainOrder {
  settlementContract: string;
  swapper: string;
  nonce: bigint;
  originChainId: number;
  initiateDeadline: number;
  fillDeadline: number;
  orderData: DutchAuctionOrderData | LimitOrderData;
}

export interface CrossChainOrderV3 {
  user: string;
  nonce: number;
  originChainId: number;
  fillDeadline: number;
  localOracle: string;
  inputs: [number, number][];
  outputs: OutputDescription_v3[];
}
export interface OutputDescription_v3 {
  remoteOracle: string;
  remoteFiller: string;
  token: string;
  amount: number;
  recipient: string;
  chainId: number;
  remoteCall: string;
  fulfillmentContext: string;
}

export interface QuoteContext {
  toAsset: string;
  toPrice: string;
  discount: string;
  fromAsset: string;
  fromPrice: string;
  intermediary: string;
}

export interface CatalystOrderMeta {
  submitTime: number;
  orderIdentifier?: string;
  orderStatus: string;
  destinationAddress?: string;
}

export interface CatalystOrderData {
  order: CrossChainOrder;
  quote: QuoteContext;
  signature: string;
  meta: CatalystOrderMeta;
}

export interface CatalystOrderDataV3 {
  order: CrossChainOrderV3;
  quote: QuoteContext;
  meta: CatalystOrderMeta;
  sponsorSignature: string;
  allocatorSignature: string;
}

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface GetOrdersResponse {
  data: CatalystOrderData[];
  pagination: PaginationMeta;
}
