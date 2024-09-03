import { CatalystEvent, CatalystOrderData } from '../types';
import { WebSocket } from 'ws';

export function handleReceiveOrder(
  parsedData: CatalystEvent<CatalystOrderData>,
  ws: WebSocket,
) {
  console.log('Received order:', parsedData);
}
