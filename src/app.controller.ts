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
    const apiKey = this.config.getOrThrow('ORDER_SERVER_API_KEY');
    // TODO: Add authentication
    this.ws = new WebSocket(wsUri, {
      headers: {
        'x-api-key': apiKey,
      },
    });

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
          case 'signQuote':
            this.handleSignQuote();
            break;
          case 'order':
            this.handleReceiveOrder(
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

  async handleReceiveQuoteRequest() {}

  async handleSignQuote() {}

  async handleReceiveOrder(
    parsedData: CatalystEvent<CatalystOrderData>,
    ws: WebSocket,
  ) {
    // TODO: some kind of evaluation of if the price is right.
    const signature = parsedData.data.signature;
    // TODO: Correct type casting.
    const transactionResponse = await initiateOrder(
      parsedData.data as unknown as CrossChainOrder,
      signature,
    );

    const transactionReceipt = await transactionResponse.wait(2);

    // Probably the better way to do this is to look for the initiate events
    // Check if it was us and then fill. It is simpler to just check if the transaction went through.
    if (transactionReceipt.status === 0) return;

    // We need the actual orderKey. (The one provided in the call is just an estimate.)
    const logs = transactionReceipt.logs;
    // Get the orderInitiated event.
    let orderKey: OrderKey;
    for (const log of logs) {
      if (log.address !== parsedData.data.settlementContractAddress) continue;
      if (log.topics[0] !== '') continue;
      orderKey = log.data as any; // TODO: Parse log.data.
    }
    if (orderKey === undefined)
      throw Error(
        `Tx ${transactionResponse.hash} was initiated and status !== 0, but couldn't find OrderInitiated event in logs`,
      );

    fillOutputs(orderKey);

  async handleReceiveOrder(
    orderRequest: CatalystEvent<CatalystOrderData>,
    ws: WebSocket,
  ) {
    return handleReceiveOrder(orderRequest.data, ws);
  }
}
