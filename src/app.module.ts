import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { ConfigModule } from "@app/config";
import { HealthModule } from "./health/health.module";
import { InventoryModule } from "./inventory/inventory.module";
import { OnchainOrderService } from "./services/onchain-order.service";
import { OrderServerService } from "./services/order-server.service";

@Module({
  imports: [ConfigModule, HealthModule, InventoryModule],
  controllers: [AppController],
  providers: [OnchainOrderService, OrderServerService],
})
export class AppModule {}
