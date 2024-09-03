import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { ConfigModule } from '@app/config';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ConfigModule, HealthModule],
  controllers: [AppController],
})
export class AppModule {}
