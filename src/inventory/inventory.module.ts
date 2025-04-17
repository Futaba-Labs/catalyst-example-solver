import { Module } from "@nestjs/common";
import { IntentoryDispatcher } from "./intentory-dispatcher";

@Module({
  controllers: [IntentoryDispatcher],
})
export class InventoryModule {}
