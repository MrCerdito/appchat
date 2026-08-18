import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { warmupEncryptedCache } from './common/security/encrypted-text.transformer';
import { join } from 'path';
import { cp, mkdir, rm } from 'fs/promises';
import helmet from 'helmet';
import compression from 'compression';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // ── Warmup: pre-compute all encrypted column decryptions ───────────────
  // Fires immediately in background; completes ~1-2s before the 10s interval
  const dataSource = app.get(DataSource);
  warmupEncryptedCache(dataSource).catch(() => {});

  // ── Validate encryption key can decrypt existing data ──────────────────
  try {
    const rows: any[] = await dataSource.query(
      `SELECT content FROM messages WHERE content LIKE 'enc:v2:%' LIMIT 1`,
    );
    if (rows.length > 0) {
      const { encryptedTextTransformer } = await import(
        './common/security/encrypted-text.transformer'
      );
      const result = encryptedTextTransformer.from(rows[0].content);
      if (result === '[Mensaje no disponible]') {
        logger.warn(
          '═══════════════════════════════════════════════════════════\n' +
            '  CHAT_ENCRYPTION_KEY no coincide con mensajes existentes.\n' +
            '  Los mensajes se mostrarán como "[Mensaje no disponible]".\n' +
            '  Si cambiaste la key, configura CHAT_ENCRYPTION_KEY_FALLBACK\n' +
            '  con la key anterior o usa el endpoint de re-encrypt.\n' +
            '═══════════════════════════════════════════════════════════',
        );
      }
    }
  } catch {
    // tabla vacía o no existe — ignorar
  }

  app.disable('x-powered-by');

  // =========================
  // HELMET (HEADERS DE SEGURIDAD)
  // =========================
  const NODE_ENV = process.env.NODE_ENV ?? 'development';
  const APP_URL = process.env.APP_URL || 'http://localhost:3001';

  app.use(
    compression({
      threshold: 1024,
      level: 6,
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      strictTransportSecurity:
        NODE_ENV === 'production'
          ? { maxAge: 31536000, includeSubDomains: true }
          : false,
      referrerPolicy: { policy: 'no-referrer' },
      xContentTypeOptions: true,
    }),
  );

  app.use((req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(self), microphone=(self), geolocation=()',
    );
    next();
  });

  // =========================
  // CORS
  // =========================
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    : ['http://localhost:4200', 'http://localhost:3001'];

  app.enableCors({
    origin: (origin, cb) => {
      if (!origin || corsOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(null, true);
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // =========================
  // VALIDATION PIPE
  // =========================
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // =========================
  // SESSION DE WHATSAPP — FUERA DEL ÁREA PÚBLICA
  // =========================
  // La sesión de Baileys (creds.json, pre-keys, sender-keys) vive ahora en un
  // directorio privado. Si quedó en la ubicación antigua bajo /uploads, se
  // migra a la nueva y se elimina del área que sirve el servidor estático.
  const oldAuthDir = join(process.cwd(), 'uploads', 'baileys-auth');
  const newAuthDir =
    process.env.WHATSAPP_SESSION_DIR ||
    join(process.cwd(), '.session', 'baileys-auth');
  try {
    await mkdir(newAuthDir, { recursive: true });
    await cp(oldAuthDir, newAuthDir, { recursive: true, force: true }).catch(
      (err: any) => {
        if (err?.code !== 'ENOENT') throw err;
      },
    );
    await rm(oldAuthDir, { recursive: true, force: true });
  } catch {
    // Sin sesión previa o ya migrada — se ignora
  }

  // =========================
  // STATIC FILES (UPLOADS)
  // =========================
  // Middleware de bloqueo defensivo: nunca servir credenciales ni archivos de
  // sesión aunque existan bajo /uploads.
  app.use((req, res, next) => {
    const p = (req.path || '/').toLowerCase();
    if (
      p.startsWith('/uploads/baileys-auth') ||
      (p.startsWith('/uploads/') && p.endsWith('.json'))
    ) {
      return res.status(404).json({ statusCode: 404, message: 'Not Found' });
    }
    next();
  });

  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.heic': 'image/heic',
    '.heif': 'image/heif',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.3gp': 'video/3gpp',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.amr': 'audio/amr',
    '.webm': 'audio/webm',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx':
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.mp2t': 'video/mp2t',
  };

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
    setHeaders: (res, path) => {
      const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
      const mime = mimeMap[ext];
      if (mime) res.setHeader('Content-Type', mime);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=86400');
    },
  });

  // =========================
  // START SERVER
  // =========================
  const port = process.env.PORT ?? 3001;
  const server = await app.listen(port, '0.0.0.0');

  if (NODE_ENV === 'production') {
    server.keepAliveTimeout = 65_000;
    server.headersTimeout = 70_000;
  }

  logger.log(`Backend corriendo en puerto ${port} (${NODE_ENV})`);

  // ── Graceful Shutdown (supports PM2 cluster) ──────────────────────
  const gracefulShutdown = async (signal: string) => {
    logger.log(`Señal ${signal} recibida — cerrando servidor (PID: ${process.pid})...`);
    try {
      await app.close();
      logger.log(`Servidor cerrado correctamente (PID: ${process.pid})`);
    } catch (err) {
      logger.error(`Error cerrando servidor: ${(err as Error).message}`);
    }
    process.exit(0);
  };

  const signals = ['SIGTERM', 'SIGINT'];
  signals.forEach((signal) => {
    process.on(signal, () => gracefulShutdown(signal));
  });

  // PM2 graceful shutdown
  if (process.env.pm_id !== undefined) {
    process.on('message', (msg) => {
      if (msg === 'shutdown') {
        gracefulShutdown('PM2 shutdown');
      }
    });
  }
}

bootstrap();
