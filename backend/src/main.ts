import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.disable('x-powered-by');

  // =========================
  // CORS (DEBE IR PRIMERO)
  // =========================
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:4200', 'http://192.168.10.26:4200'];

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // =========================
  // HEADERS DE SEGURIDAD
  // =========================
  const NODE_ENV  = process.env.NODE_ENV ?? 'development';
  const APP_URL = process.env.APP_URL || 'http://localhost:3000';
  const CSP_VALUE = process.env.CSP_DIRECTIVES || [
    "default-src 'self'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "connect-src 'self' " + APP_URL + " ws:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
      return next();
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()'
    );

    if (NODE_ENV === 'production') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains'
      );
    }

    res.setHeader('Content-Security-Policy', CSP_VALUE);

    next();
  });

  // =========================
  // VALIDATION PIPE
  // =========================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // =========================
  // STATIC FILES (UPLOADS)
  // =========================
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=86400');
    },
  });

  // =========================
  // START SERVER
  // =========================
  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`Backend corriendo en puerto ${port}`);
}

bootstrap();