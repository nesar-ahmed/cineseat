import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { AUTH_COOKIE_NAME, AUTH_COOKIE_SCHEME } from './common/constants/session';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { UPLOAD_URL_PREFIX } from './users/avatar.storage';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  // rawBody: the payment webhook verifies its signature over the exact bytes received.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  // Strict CORS: only the web origin, with credentials for the JWT cookie.
  // Array form matters: with a bare string, `cors` echoes the configured origin
  // even for a foreign request, while an array only emits the header on a match.
  app.enableCors({
    origin: [config.getOrThrow<string>('webOrigin')],
    credentials: true,
  });

  // Makes req.cookies exist, which is how JwtAuthGuard finds the session token.
  app.use(cookieParser());

  // Uploaded files (avatars now, posters later) are served from disk, outside the source tree.
  app.useStaticAssets(resolve(config.getOrThrow<string>('uploadDir')), {
    prefix: `${UPLOAD_URL_PREFIX}/`,
  });

  // One error shape for every failure, and no stack traces in responses.
  app.useGlobalFilters(new AllExceptionsFilter());

  // OpenAPI / Swagger UI (assets bundled and served by the API itself).
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CineSeat API')
    .setDescription(
      'Production-grade movie ticket booking platform. Layered NestJS API with TypeORM + SQLite, ' +
        'transactional seat holds, and real-time updates. Auth uses JWT in an httpOnly cookie; ' +
        'endpoints are documented phase by phase.',
    )
    .setVersion('0.2.0')
    .addTag('system', 'Health and platform endpoints')
    .addTag('auth', 'Signup, login, session')
    .addTag('users', 'Profiles, avatars, admin user list')
    .addTag('movies', 'Browse, search and (ADMIN) manage movies')
    .addTag('catalog', 'Filter vocabulary and facet counts for the movies catalog')
    .addTag('theaters', 'Cinemas, screens and seat layouts')
    .addTag('shows', 'Showtimes, seat maps and (ADMIN) scheduling')
    .addTag('holds', 'Reserve seats for a few minutes while checking out')
    .addTag('checkout', 'Price a hold, apply offer codes and start paying (mock provider only)')
    .addTag('bookings', 'Your bookings and their payment status')
    .addTag('invoices', 'Invoices for the bookings you paid for')
    .addTag('admin', 'Read models for the admin panel (ADMIN only)')
    .addTag('notifications', 'Your in-app notifications, and (ADMIN) announcements')
    .addTag('payments', 'Payment results reported by the provider (webhook)')
    .addTag('mock-gateway', 'TEST MODE payment gateway: test cards only, no real money')
    .addCookieAuth(AUTH_COOKIE_NAME, { type: 'apiKey' }, AUTH_COOKIE_SCHEME)
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
