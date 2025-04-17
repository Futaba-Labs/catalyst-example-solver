import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import helmet from "helmet";
import { ConfigService } from "@nestjs/config";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.use(helmet());

  const config = app.get<ConfigService>(ConfigService);

  const port = config.get("PORT");

  await app.listen(port ?? 3333);
}
bootstrap();
