export enum CatalystWsEventType {
  // Common hearbeat events
  PING = "ping",
  PONG = "pong",
  TCP_PONG = "tcp-pong",

  // evm -> evm/non-evm quote request
  QUOTE_REQUEST = "quote-request",

  // non-evm -> evm/non-evm quote request
  QUOTE_REQUEST_BINDING = "quote-request-binding",

  // evm -> evm/non-evm orders
  VM_ORDER = "vm-order",
  // non-evm -> evm/non-evm orders
  NON_VM_ORDER = "non-vm-order",

  // Events starting by "solver" are the ones that originate from the solver
  SOLVER_QUOTE = "solver-quote",
  SOLVER_ORDER_SIGNED = "solver-order-signed",
  SOLVER_ORDER_INITIATED = "solver-order-initiated",

  // Discard
  ORDER_STATUS_CHANGE = "app:order-status-change",
}
