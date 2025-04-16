export enum CommonWsEvent {
  // Common hearbeat events
  PING = "ping",
  PONG = "pong",
  TCP_PONG = "tcp-pong",
}

export enum CatalystWsEvent {
  APP_ORDER_STATUS_CHANGED = "app:order-status-change",

  USER_ORDER_VM = "user:vm-order-submit",
  USER_ORDER_NON_VM = "user:non-vm-order-submit",
}
