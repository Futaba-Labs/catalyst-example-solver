export enum CatalystWsEventType {
  PING = 'ping',
  PONG = 'pong',
  TCP_PONG = 'tcp-pong',
  QUOTE_REQUEST = 'quote-request',
  // evm - evm/btc orders
  VM_ORDER = 'vm-order',
  // non evm - evm/btc orders
  NON_VM_ORDER = 'non-vm-order',
  SOLVER_QUOTE = 'solver-quote',
  SOLVER_ORDER_SIGNED = 'solver-order-signed',
  SOLVER_ORDER_INITIATED = 'solver-order-initiated',
}
