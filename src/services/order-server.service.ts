import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import * as WebSocket from "ws";
import { ORDER_SERVER_CONFIG, SUPPORTED_CHAINS } from "../common/constants";
import {
  SubmitOrderDto,
  OrderServerResponse,
  WebSocketOrder,
  StandardOrder,
  OrderStatus,
  CatalystOrder,
} from "../types";
import { handleVmOrder } from "../handlers/vm-order.handler";

@Injectable()
export class OrderServerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderServerService.name);
  private httpClient: AxiosInstance;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000; // 5 seconds
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly pingIntervalTime = 30000; // 30 seconds

  constructor(private config: ConfigService) {
    this.httpClient = axios.create({
      baseURL: ORDER_SERVER_CONFIG.BASE_URL,
    });
  }

  async onModuleInit() {
    this.logger.log("Initializing Order Server Service...");

    // Start WebSocket connection and initial order fetching in parallel
    await Promise.allSettled([
      this.connectWebSocket(),
      this.fetchInitialOrders(),
    ]);
  }

  async onModuleDestroy() {
    this.stopPingInterval();
    if (this.ws) {
      this.ws.close();
    }
  }

  private async connectWebSocket() {
    try {
      this.logger.log(`Connecting to WebSocket: ${ORDER_SERVER_CONFIG.WS_URL}`);

      // Add connection options for better compatibility
      const wsOptions = {
        headers: {
          "User-Agent": "catalyst-solver/1.0",
          Origin: ORDER_SERVER_CONFIG.BASE_URL,
        },
        handshakeTimeout: 10000,
        perMessageDeflate: false,
      };

      this.ws = new WebSocket(ORDER_SERVER_CONFIG.WS_URL, wsOptions);

      this.ws.on("open", () => {
        this.logger.log("WebSocket connection established");
        this.reconnectAttempts = 0;

        // Send initial authentication/identification if needed
        this.sendIdentification();

        // Subscribe to order events
        this.subscribeToOrders();

        // Start ping interval to keep connection alive
        this.startPingInterval();
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const rawMessage = data.toString();
          this.logger.debug("Raw WebSocket message:", rawMessage);

          const message = JSON.parse(rawMessage);
          this.handleWebSocketMessage(message);
        } catch (error) {
          this.logger.error("Error parsing WebSocket message:", error);
          this.logger.debug("Raw message was:", data.toString());
        }
      });

      // Handle ping frames - respond with pong
      this.ws.on("ping", (data: Buffer) => {
        this.logger.debug("Received ping from server");
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.pong(data);
          this.logger.debug("Sent pong response to server");
        }
      });

      // Handle pong frames - log for debugging
      this.ws.on("pong", () => {
        this.logger.debug("Received pong from server");
      });

      this.ws.on("close", (code: number, reason: string) => {
        this.logger.warn(`WebSocket connection closed: ${code} - ${reason}`);
        this.stopPingInterval();

        // Only attempt reconnection for certain close codes
        if (code !== 1000 && code !== 1001) {
          // Normal closure or going away
          this.handleReconnection();
        }
      });

      this.ws.on("error", (error: Error) => {
        this.logger.error("WebSocket error:", error);
        this.stopPingInterval();
      });

      // Add connection timeout
      const connectionTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          this.logger.error("WebSocket connection timeout");
          this.ws.terminate();
        }
      }, 15000); // 15 second timeout

      this.ws.on("open", () => {
        clearTimeout(connectionTimeout);
      });
    } catch (error) {
      this.logger.error("Error establishing WebSocket connection:", error);
      this.handleReconnection();
    }
  }

  private subscribeToOrders() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn("Cannot subscribe - WebSocket not connected");
      return;
    }

    // Subscribe to orders for supported chains
    const subscriptionMessage = {
      type: "subscribe",
      data: {
        eventTypes: ["new_order", "order_updated"],
        chainIds: SUPPORTED_CHAINS,
      },
    };

    this.ws.send(JSON.stringify(subscriptionMessage));
    this.logger.log("Subscribed to order events");
  }

  private async handleWebSocketMessage(message: any) {
    try {
      this.logger.debug("Received WebSocket message:", message);

      switch (message.type) {
        case "new_order":
          if (message.data) {
            await this.handleNewOrder(message.data);
          } else {
            this.logger.warn("Received new_order message without data");
          }
          break;

        case "order_updated":
          if (message.data) {
            await this.handleOrderUpdate(message.data);
          } else {
            this.logger.warn("Received order_updated message without data");
          }
          break;

        case "subscription_confirmed":
          this.logger.log("Subscription confirmed");
          break;

        case "identification_confirmed":
          this.logger.log("Client identification confirmed");
          break;

        case "error":
          this.logger.error("Server error:", message.data || message.message);
          break;

        case "ping":
          // Respond to server ping
          this.sendPong();
          break;

        case "pong":
          this.logger.debug("Received pong from server");
          break;

        case "orders_snapshot":
          // Handle initial orders snapshot if server provides it
          if (message.data && Array.isArray(message.data)) {
            this.logger.log(
              `Received orders snapshot with ${message.data.length} orders`,
            );
            for (const orderData of message.data) {
              try {
                await this.handleNewOrder(orderData);
              } catch (error) {
                this.logger.error(
                  `Error processing snapshot order ${orderData.id}:`,
                  error,
                );
              }
            }
          }
          break;

        default:
          this.logger.debug("Unhandled message type:", message.type);
          break;
      }
    } catch (error) {
      this.logger.error("Error handling WebSocket message:", error);
    }
  }

  private async handleNewOrder(orderData: WebSocketOrder) {
    try {
      this.logger.log(`Processing new order: ${orderData.id}`);

      // Convert WebSocket order to StandardOrder format
      const standardOrder = this.convertToStandardOrder(orderData);

      // Create CatalystOrder with signatures
      const catalystOrder: CatalystOrder = {
        order: standardOrder,
        sponsorSignature: orderData.sponsorSignature || "0x",
        allocatorSignature: orderData.allocatorSignature || "0x",
      };

      // Process the order through the existing handler
      await handleVmOrder(catalystOrder);

      this.logger.log(`Successfully processed order: ${orderData.id}`);
    } catch (error) {
      this.logger.error(`Error processing new order ${orderData.id}:`, error);
    }
  }

  private async handleOrderUpdate(orderData: WebSocketOrder) {
    this.logger.debug(`Order update received for: ${orderData.id}`, orderData);
    // Handle order status updates if needed
  }

  private convertToStandardOrder(orderData: WebSocketOrder): StandardOrder {
    // Validate required fields
    if (!orderData || !orderData.order) {
      throw new Error("Invalid order data: missing order object");
    }

    this.logger.log("Order data:", orderData);

    // Since WebSocketOrder.order is now already StandardOrder type, we can return it directly
    return orderData.order;
  }

  private handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error("Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    this.logger.log(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${this.reconnectDelay}ms`,
    );

    setTimeout(() => {
      this.connectWebSocket();
    }, this.reconnectDelay);
  }

  // API methods for interacting with the order server
  async submitOrder(order: SubmitOrderDto): Promise<OrderServerResponse> {
    try {
      this.logger.log("Submitting order to server");

      const response = await this.httpClient.post("/orders", order);

      this.logger.log("Order submitted successfully:", response.data);
      return response.data;
    } catch (error) {
      this.logger.error("Error submitting order:", error);
      throw error;
    }
  }

  async getOrder(orderId: string): Promise<WebSocketOrder | null> {
    try {
      const response = await this.httpClient.get(`/orders/${orderId}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Error fetching order ${orderId}:`, error);
      return null;
    }
  }

  async getOrders(options?: {
    user?: `0x${string}`;
    status?: OrderStatus;
    limit?: number;
    offset?: number;
  }): Promise<{
    data: WebSocketOrder[];
    meta: {
      limit: number;
      offset: number;
      total: number;
    };
  }> {
    try {
      this.logger.debug("Fetching orders with options:", options);

      // Set default values like lintent implementation
      const params = {
        limit: 50,
        offset: 0,
        user: "0x382c45ddbb74c19b8bd3e87441986c30f0b73936",
        ...options,
      };

      // Clean up params to only include defined values
      const cleanParams = Object.fromEntries(
        Object.entries(params).filter(([, value]) => value !== undefined),
      );

      const response = await this.httpClient.get("/orders", {
        params: cleanParams,
        validateStatus: (status) => status < 500, // Accept 4xx but not 5xx
      });

      if (response.status === 404) {
        this.logger.warn("Orders endpoint not found (404)");
        return {
          data: [],
          meta: { limit: params.limit, offset: params.offset, total: 0 },
        };
      }

      if (response.status >= 400) {
        this.logger.error(`HTTP error ${response.status}:`, response.data);
        return {
          data: [],
          meta: { limit: params.limit, offset: params.offset, total: 0 },
        };
      }

      // Handle lintent-style response structure
      if (response.data?.data && Array.isArray(response.data.data)) {
        // Expected lintent response format: { data: [], meta: { limit, offset, total } }
        this.logger.debug(
          `Retrieved ${response.data.data.length} of ${response.data.meta?.total || 0} total orders`,
        );
        return {
          data: response.data.data,
          meta: response.data.meta || {
            limit: params.limit,
            offset: params.offset,
            total: response.data.data.length,
          },
        };
      } else if (Array.isArray(response.data)) {
        // Fallback: direct array response
        this.logger.debug(
          `Retrieved ${response.data.length} orders (direct array)`,
        );
        return {
          data: response.data,
          meta: {
            limit: params.limit,
            offset: params.offset,
            total: response.data.length,
          },
        };
      } else {
        this.logger.warn("Unexpected response structure:", response.data);
        return {
          data: [],
          meta: { limit: params.limit, offset: params.offset, total: 0 },
        };
      }
    } catch (error) {
      if (error.response) {
        this.logger.error(
          `HTTP error ${error.response.status}: ${error.response.statusText}`,
        );
        this.logger.debug("Response data:", error.response.data);
      } else if (error.request) {
        this.logger.error("Network error - no response received");
      } else {
        this.logger.error("Request setup error:", error.message);
      }
      return {
        data: [],
        meta: { limit: 50, offset: 0, total: 0 },
      };
    }
  }

  async updateOrderStatus(orderId: string, status: string): Promise<boolean> {
    try {
      await this.httpClient.patch(`/orders/${orderId}`, { status });
      this.logger.log(`Updated order ${orderId} status to ${status}`);
      return true;
    } catch (error) {
      this.logger.error(`Error updating order ${orderId} status:`, error);
      return false;
    }
  }

  // Get order statistics
  async getOrderStats(): Promise<{
    total: number;
    pending: number;
    open: number;
    completed: number;
    failed: number;
  } | null> {
    try {
      const response = await this.httpClient.get("/orders/stats");
      return response.data;
    } catch (error) {
      this.logger.debug("Order stats endpoint not available:", error.message);
      return null;
    }
  }

  // Get server info/status
  async getServerInfo(): Promise<any> {
    try {
      const response = await this.httpClient.get("/info");
      return response.data;
    } catch (error) {
      this.logger.debug("Server info endpoint not available:", error.message);
      return null;
    }
  }

  // Get order by user address
  async getOrdersByUser(
    userAddress: string,
    params?: {
      status?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<WebSocketOrder[]> {
    try {
      const response = await this.httpClient.get(
        `/orders/user/${userAddress}`,
        {
          params,
          validateStatus: (status) => status < 500,
        },
      );

      if (response.status >= 400) {
        this.logger.error(`HTTP error ${response.status}:`, response.data);
        return [];
      }

      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      this.logger.error(
        `Error fetching orders for user ${userAddress}:`,
        error,
      );
      return [];
    }
  }

  private startPingInterval() {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, this.pingIntervalTime);
  }

  private stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
  }

  // Manual ping method for testing connection
  sendPing(): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.ping();
      this.logger.debug("Manual ping sent to server");
      return true;
    }
    this.logger.warn("Cannot send ping - WebSocket not connected");
    return false;
  }

  // Send pong response to server
  private sendPong(): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn("Cannot send pong - WebSocket not connected");
      return false;
    }

    // Send pong message to server
    const pongMessage = {
      type: "pong",
      timestamp: Date.now(),
    };

    this.ws.send(JSON.stringify(pongMessage));
    this.logger.debug("Sent pong to server");
    return true;
  }

  // Get WebSocket connection status
  getConnectionStatus(): string {
    if (!this.ws) return "disconnected";

    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return "connecting";
      case WebSocket.OPEN:
        return "connected";
      case WebSocket.CLOSING:
        return "closing";
      case WebSocket.CLOSED:
        return "closed";
      default:
        return "unknown";
    }
  }

  // Fetch existing orders at startup
  private async fetchInitialOrders() {
    try {
      this.logger.log("Fetching initial orders from server...");

      // First, try to get signed orders (equivalent to pending)
      const signedOrdersResponse = await this.getOrders({
        status: "Signed",
        limit: 50,
      });

      // Also get delivered orders if available (equivalent to open)
      const deliveredOrdersResponse = await this.getOrders({
        status: "Delivered",
        limit: 50,
      });

      // Extract data arrays from responses
      const signedOrders = signedOrdersResponse.data;
      const deliveredOrders = deliveredOrdersResponse.data;

      // Combine and deduplicate orders
      const allOrders = [...signedOrders, ...deliveredOrders];
      const uniqueOrders = allOrders.filter(
        (order, index, array) =>
          array.findIndex((o) => o.id === order.id) === index,
      );

      if (uniqueOrders.length > 0) {
        this.logger.log(
          `Found ${uniqueOrders.length} existing orders (${signedOrders.length} signed, ${deliveredOrders.length} delivered)`,
        );

        // Process each existing order
        for (const orderData of uniqueOrders) {
          try {
            await this.handleNewOrder(orderData);
          } catch (error) {
            this.logger.error(
              `Error processing existing order ${orderData.id}:`,
              error,
            );
          }
        }
      } else {
        this.logger.log("No existing orders found");
      }
    } catch (error) {
      this.logger.error("Failed to fetch initial orders:", error);
    }
  }

  private sendIdentification() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Send solver identification to the server
    const identificationMessage = {
      type: "identify",
      data: {
        clientType: "catalyst-solver",
        version: "1.0",
        supportedChains: SUPPORTED_CHAINS,
        timestamp: Date.now(),
      },
    };

    this.ws.send(JSON.stringify(identificationMessage));
    this.logger.log("Sent identification to server");
  }
}
