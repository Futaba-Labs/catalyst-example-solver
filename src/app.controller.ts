import { Controller, OnModuleInit, Logger, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OnchainOrderService } from "./services/onchain-order.service";
import { OrderServerService } from "./services/order-server.service";

@Controller()
export class AppController implements OnModuleInit {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private config: ConfigService,
    private onchainOrderService: OnchainOrderService,
    private orderServerService: OrderServerService,
  ) {}

  async onModuleInit() {
    this.logger.log("Starting Catalyst v1 Solver...");
    this.logger.log("✅ Order server API integration initialized");
    this.logger.log("✅ Multi-chain support enabled for new testnets");
    this.logger.log(
      "ℹ️  On-chain order polling is DISABLED (manual start required)",
    );
  }

  @Get("/status")
  async getStatus() {
    const wsConnectionStatus = this.orderServerService.getConnectionStatus();

    // Get order statistics if available
    const orderStats = await this.orderServerService.getOrderStats();
    const serverInfo = await this.orderServerService.getServerInfo();

    return {
      status: "running",
      version: "catalyst-v1",
      services: {
        onchainPolling: false,
        websocketConnection: wsConnectionStatus,
      },
      features: {
        multiChain: true,
        standardOrders: true,
        batchCompact: true,
        legacySupport: true,
        pingPongSupport: true,
      },
      supportedChains: [11155111, 84532, 11155420, 421614],
      orderServer: {
        websocketStatus: wsConnectionStatus,
        statistics: orderStats,
        serverInfo: serverInfo,
      },
      notes: {
        onchainPolling: "Disabled - use GET /start-onchain-polling to enable",
        websocket: `Connection status: ${wsConnectionStatus}`,
        orderStats: orderStats
          ? `Total: ${orderStats.total}, Pending: ${orderStats.pending}, Open: ${orderStats.open}`
          : "Statistics not available",
      },
    };
  }

  @Get("/start-onchain-polling")
  async startOnchainPolling() {
    try {
      await this.onchainOrderService.startPolling();
      return {
        success: true,
        message: "On-chain order polling started",
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to start on-chain polling",
        error: error.message,
      };
    }
  }

  @Get("/stop-onchain-polling")
  async stopOnchainPolling() {
    try {
      this.onchainOrderService.stopPolling();
      return {
        success: true,
        message: "On-chain order polling stopped",
      };
    } catch (error) {
      return {
        success: false,
        message: "Failed to stop on-chain polling",
        error: error.message,
      };
    }
  }

  // WebSocket ping test endpoint
  @Get("/ping-websocket")
  async pingWebSocket() {
    const success = this.orderServerService.sendPing();
    const status = this.orderServerService.getConnectionStatus();

    return {
      success,
      connectionStatus: status,
      message: success
        ? "Ping sent successfully"
        : "Failed to send ping - WebSocket not connected",
      timestamp: new Date().toISOString(),
    };
  }
}
