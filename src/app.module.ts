import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { ConfigModule } from "@app/config";
import { HealthModule } from "./health/health.module";
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [ConfigModule, HealthModule, InventoryModule],
  controllers: [AppController],
})
export class AppModule {}
