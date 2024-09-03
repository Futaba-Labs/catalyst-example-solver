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
  orderId: string;
  quoteRequestId: string;
  fromChain: string;
  toChain: string;
  fromAsset: string;
  toAsset: string;
  expirationTime: string;
  amount: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}
