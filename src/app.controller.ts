import { Controller, OnModuleInit } from '@nestjs/common';
import { RawData, WebSocket } from 'ws';

@Controller()
export class AppController implements OnModuleInit {
  private ws: WebSocket;

  async onModuleInit() {
    await this.listenToOrderServer();
  }

  async listenToOrderServer() {
    const wsUrl = 'ws://localhost:4444';
    // TODO: Add authentication
    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('Connected to WebSocket server');
    });

    this.ws.on('message', (data: RawData) => {
      try {
        const parsedData = JSON.parse(data.toString());
        console.log('Received message:', parsedData);
        switch (parsedData.event) {
          case 'ping':
            this.handleReceivePing();
            break;
          case 'quoteRequest':
            this.handleReceiveQuoteRequest();
            break;
          case 'order':
            this.handleReceiveOrder();
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
      // TODO: Implement reconnection logic if needed
    });
  }

  async handleReceivePing() {
    this.ws.send(
      JSON.stringify({
        event: 'pong',
      }),
    );
  }

  async handleReceiveQuoteRequest() {}

  async handleReceiveOrder() {}
}
