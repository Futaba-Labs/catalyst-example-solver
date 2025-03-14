import { Controller, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RawData, WebSocket } from "ws";
import { handleQuoteRequest } from "./handlers/quote-request.handler";
import {
  CatalystEvent,
  CatalystOrderData,
  CatalystQuoteRequestData,
} from "./types";
import { CatalystWsEventType } from "./types/events";
import { handleVmOrder } from "./handlers/vm-order.handler";
import { handleNonVmOrder } from "./handlers/non-vm-order.handler";

@Controller()
export class AppController implements OnModuleInit {
  constructor(private config: ConfigService) {}
  private ws: WebSocket;
  private reconnectInterval = 5000; // Reconnect interval in milliseconds

  async onModuleInit() {
    await this.listenToOrderServer();
  }

  async listenToOrderServer() {
    const wsUri = this.config.getOrThrow("ORDER_SERVER_WS_URI");
    const apiKey = this.config.getOrThrow("ORDER_SERVER_API_KEY");

    this.ws = new WebSocket(wsUri, {
      headers: {
        "x-api-key": apiKey,
      },
    });

    this.ws.on("open", () => {
      console.log("Connected to WebSocket server");
    });

    this.ws.on("message", (data: RawData) => {
      try {
        const parsedData: CatalystEvent<unknown> = JSON.parse(data.toString());
        switch (parsedData.event) {
          case CatalystWsEventType.PING:
            this.handleReceivePing();
            break;
          case CatalystWsEventType.QUOTE_REQUEST_BINDING:
            console.log(
              `[${CatalystWsEventType.QUOTE_REQUEST_BINDING}]`,
              parsedData,
            );
            // replace by a function that generates binding quotes
            handleQuoteRequest(
              parsedData as CatalystEvent<CatalystQuoteRequestData>,
              this.ws,
            );
            break;
          case CatalystWsEventType.QUOTE_REQUEST:
            console.log(`[${CatalystWsEventType.QUOTE_REQUEST}]`, parsedData);
            handleQuoteRequest(
              parsedData as CatalystEvent<CatalystQuoteRequestData>,
              this.ws,
            );
            break;
          case CatalystWsEventType.VM_ORDER:
            console.log(`[${CatalystWsEventType.VM_ORDER}]`, parsedData);
            handleVmOrder(
              parsedData as CatalystEvent<CatalystOrderData>,
              this.ws,
            );
            break;
          case CatalystWsEventType.NON_VM_ORDER:
            console.log(`[${CatalystWsEventType.NON_VM_ORDER}]`, parsedData);
            handleNonVmOrder(
              parsedData as CatalystEvent<CatalystOrderData>,
              this.ws,
            );
            break;
          case CatalystWsEventType.ORDER_STATUS_CHANGE:
            break;
          default:
            console.log("Unknown message type:", parsedData);
        }
      } catch (error) {
        console.error("Error parsing JSON:", error);
      }
    });

    this.ws.on("error", (error: Error) => {
      console.error("WebSocket error:", error);
    });

    this.ws.on("close", async () => {
      console.error("Disconnected from WebSocket");
      await this.reconnect();
    });
  }

  async reconnect() {
    console.log("Attempting to reconnect...");
    setTimeout(async () => {
      this.ws.close();
      await this.listenToOrderServer();
    }, this.reconnectInterval);
  }

  async handleReceivePing() {
    this.ws.send(
      JSON.stringify({
        event: CatalystWsEventType.PONG,
      }),
    );
  }
}
