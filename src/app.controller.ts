import { Controller, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RawData, WebSocket } from 'ws';
import { handleReceiveQuoteRequest } from './handlers/quote-request.handler';
import {
  CatalystEvent,
  CatalystOrderData,
  CatalystQuoteRequestData,
} from './types';
import { handleReceiveOrder } from './handlers/order.handler';

@Controller()
export class AppController implements OnModuleInit {
  constructor(private config: ConfigService) {}
  private ws: WebSocket;
  private reconnectInterval = 5000; // Reconnect interval in milliseconds

  async onModuleInit() {
    await this.listenToOrderServer();
  }

  async listenToOrderServer() {
    const wsUri = this.config.getOrThrow('ORDER_SERVER_WS_URI');
    // TODO: Add authentication
    this.ws = new WebSocket(wsUri);

    this.ws.on('open', () => {
      console.log('Connected to WebSocket server');
    });

    this.ws.on('message', (data: RawData) => {
      try {
        const parsedData: CatalystEvent<unknown> = JSON.parse(data.toString());
        console.log('Received message:', parsedData);
        switch (parsedData.event) {
          case 'ping':
            this.handleReceivePing();
            break;
          case 'quote-request':
            handleReceiveQuoteRequest(
              parsedData as CatalystEvent<CatalystQuoteRequestData>,
              this.ws,
            );
            break;
          case 'order':
            handleReceiveOrder(
              parsedData as CatalystEvent<CatalystOrderData>,
              this.ws,
            );
            break;
          default:
            console.log('Unknown message type:', parsedData);
        }
      } catch (error) {
        console.error('Error parsing JSON:', error);
      }
    });
    this.ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
    });

    this.ws.on('close', () => {
      console.log('Disconnected from WebSocket');
      this.reconnect();
    });
  }

  async reconnect() {
    console.log('Attempting to reconnect...');
    setTimeout(async () => {
      this.ws.close();
      await this.listenToOrderServer();
    }, this.reconnectInterval);
  }

  async handleReceivePing() {
    this.ws.send(
      JSON.stringify({
        event: 'pong',
      }),
    );
  }
}
