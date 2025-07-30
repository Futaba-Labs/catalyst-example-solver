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

// New Catalyst v1 Order Types
export type Quote = {
  fromAsset: string;
  toAsset: string;
  fromPrice: string;
  toPrice: string;
  intermediary: string;
  discount?: string;
};

export type MandateOutput = {
  oracle: `0x${string}`;
  settler: `0x${string}`;
  chainId: bigint;
  token: `0x${string}`;
  amount: bigint;
  recipient: `0x${string}`;
  call: `0x${string}`;
  context: `0x${string}`;
};

export type StandardOrder = {
  user: `0x${string}`;
  nonce: bigint;
  originChainId: bigint;
  expires: number;
  fillDeadline: number;
  localOracle: `0x${string}`;
  inputs: [bigint, bigint][];
  outputs: MandateOutput[];
};

export type CompactMandate = {
  fillDeadline: number;
  localOracle: `0x${string}`;
  outputs: MandateOutput[];
};

export type Lock = {
  lockTag: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
};

export type BatchCompact = {
  type: "BatchCompact";
  arbiter: `0x${string}`; // The account tasked with verifying and submitting the claim.
  sponsor: `0x${string}`; // The account to source the tokens from.
  nonce: bigint; // A parameter to enforce replay protection, scoped to allocator.
  expires: number; // The time at which the cluster expires.
  commitments: Lock[]; // The allocated token IDs and amounts.
  mandate: CompactMandate;
};

// Legacy interfaces for backward compatibility
export interface TokenInput {
  token: string;
  amount: bigint;
  chainId: number;
}

export interface TokenOutput {
  token: string;
  amount: bigint;
  chainId: number;
  recipient: string;
  remoteOracle: string;
  remoteFiller: string;
  remoteCall?: string;
  fulfillmentContext?: string;
}

// Order server types
export type OrderStatus = "Signed" | "Delivered" | "Settled";

export interface CatalystCompactOrder {
  user: string;
  nonce: string;
  originChainId: number;
  fillDeadline: number;
  localOracle: string;
  inputs: {
    token: string;
    amount: string;
    chainId: number;
  }[];
  outputs: {
    token: string;
    amount: string;
    chainId: number;
    recipient: string;
    remoteOracle: string;
    remoteFiller: string;
    remoteCall?: string;
    fulfillmentContext?: string;
  }[];
}

export interface SubmitOrderDto {
  order: CatalystCompactOrder;
  signature: string;
  orderType: "CatalystCompactOrder";
}

export interface OrderServerResponse {
  success: boolean;
  orderId?: string;
  error?: string;
}

// WebSocket message types
export interface WebSocketOrder {
  id: string;
  order: StandardOrder;
  sponsorSignature: string;
  allocatorSignature: string;
}

// Updated Catalyst Order interface to support both old and new formats
export interface CatalystOrder {
  order: StandardOrder;
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

// Legacy CompactOrder (kept for backward compatibility)
export interface CompactOrder {
  type: "CompactOrder";
  user: string;
  nonce: number;
  originChainId: number;
  fillDeadline: number;
  localOracle: string;
  inputs: [bigint, number][];
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

// Intent filling types
export interface FillIntent {
  orderId: string;
  solver: string;
  proof: string;
  fulfillmentData: string;
}

export interface ClaimData {
  orderId: string;
  proof: string;
  validationData: string;
}

// Oracle validation types
export interface OracleValidation {
  oracleType: "wormhole" | "polymer";
  validationData: string;
  timestamp: number;
}

// Type guards
export const isStandardOrder = (order: any): order is StandardOrder => {
  return order.type === "StandardOrder";
};

export const isBatchCompact = (order: any): order is BatchCompact => {
  return order.type === "BatchCompact";
};

export const isCompactOrder = (order: any): order is CompactOrder => {
  return order.type === "CompactOrder";
};

// Helper type for all order types
export type AnyOrder = CompactOrder | StandardOrder | BatchCompact;
