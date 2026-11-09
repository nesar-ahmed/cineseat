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

  // OpenAPI / Swagger UI (assets bundled and served by the API itself).
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CineSeat API')
    .setDescription(
      'Production-grade movie ticket booking platform. Layered NestJS API with Prisma, ' +
        'transactional seat holds, and real-time updates. Auth uses JWT in an httpOnly cookie; ' +
        'endpoints are documented phase by phase.',
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
