import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Strict CORS: only the web origin, with credentials for the JWT cookie.
  app.enableCors({
    origin: config.getOrThrow<string>('webOrigin'),
    credentials: true,
  });

  const port = config.getOrThrow<number>('port');
  await app.listen(port);
  logger.log(`CineSeat API ready on http://localhost:${port}`);
}

void bootstrap();
