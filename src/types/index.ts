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

// TODO: this should contain the orderId so solver's don't have to derive it.
export interface CatalystOrder {
  order: CompactOrder;
  quotes: QuoteContext;
  meta: CatalystOrderMeta;
  sponsorSignature: string;
  allocatorSignature: string;
}

export interface QuoteContext {
  toAsset: string;
  toPrice: string;
  discount: string;
  fromAsset: string;
  fromPrice: string;
  intermediary: string;
}

export interface CompactOrder {
  type: "CompactOrder"; // Used to identify this as a compact order
  user: string;
  nonce: number;
  originChainId: number;
  fillDeadline: number;
  localOracle: string;
  inputs: [number, number][];
  outputs: OutputDescription[];
}

export interface OutputDescription {
  remoteOracle: string;
  remoteFiller: string;
  token: string;
  amount: number;
  recipient: string;
  chainId: number;
  remoteCall: string;
  fulfillmentContext: string;
}

export interface CatalystOrderMeta {
  submitTime: number;
  orderIdentifier?: string;
  orderStatus?: string;
  connectedWalletId?: string;
  destinationAddress?: string;
  originId?: string;
  confirmationsCount?: number;
  requiredConfirmationsCount?: number;
  orderInitiatedTxHash?: string;
  orderPurchasedTxHash?: string;
  orderProvenTxHash?: string;
  nonVmTxHash?: string;

  signedAt?: Date;
  initiatedAt?: Date;
  pendingTransferAt?: Date;
  settledTransferAt?: Date;
  purchasedAt?: Date;
  provenAt?: Date;
  failedAt?: Date;
  expiredAt?: Date;
}