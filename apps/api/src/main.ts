import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

  // OpenAPI / Swagger UI (bundled assets — works fully offline).
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CineSeat API')
    .setDescription(
      'Offline-first movie ticket booking platform. NestJS + Prisma + SQLite monorepo API. ' +
        'Auth uses JWT in an httpOnly cookie; endpoints are added phase by phase.',
    )
    .setVersion('0.1.0')
    .addTag('system', 'Health and platform endpoints')
    .addServer(`http://localhost:${config.get('port') ?? 4000}`)
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
    swaggerOptions: { persistAuthorization: true },
  });

  const port = config.getOrThrow<number>('port');
  await app.listen(port);
  logger.log(`CineSeat API ready on http://localhost:${port} — docs at /docs`);
}

void bootstrap();
