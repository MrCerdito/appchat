"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const path_1 = require("path");
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const logger = new common_1.Logger('Bootstrap');
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.disable('x-powered-by');
    const NODE_ENV = process.env.NODE_ENV ?? 'development';
    const APP_URL = process.env.APP_URL || 'http://localhost:3001';
    const CSP_DIRECTIVES = process.env.CSP_DIRECTIVES ||
        [
            "default-src 'self'",
            "img-src 'self' data: blob: https:",
            "media-src 'self' blob:",
            "connect-src 'self' " + APP_URL + ' ws:',
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ].join('; ');
    app.use((0, compression_1.default)({
        threshold: 1024,
        level: 6,
    }));
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                'default-src': ["'self'"],
                'script-src': ["'self'", "'unsafe-inline'"],
                'style-src': ["'self'", "'unsafe-inline'"],
                'img-src': ["'self'", 'data:', 'blob:', 'https:'],
                'media-src': ["'self'", 'blob:'],
                'connect-src': ["'self'", APP_URL, 'ws:', 'wss:'],
                'frame-ancestors': ["'none'"],
                'base-uri': ["'self'"],
                'form-action': ["'self'"],
            },
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        strictTransportSecurity: NODE_ENV === 'production'
            ? { maxAge: 31536000, includeSubDomains: true }
            : false,
        referrerPolicy: { policy: 'no-referrer' },
        xFrameOptions: { action: 'deny' },
        xContentTypeOptions: true,
    }));
    app.use((req, res, next) => {
        res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
        next();
    });
    const corsOrigins = process.env.CORS_ORIGINS
        ? process.env.CORS_ORIGINS.split(',')
        : ['http://localhost:4200', 'http://192.168.10.26:4200'];
    app.enableCors({
        origin: corsOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        transform: true,
    }));
    const mimeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',
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
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        '.mp2t': 'video/mp2t',
    };
    app.useStaticAssets((0, path_1.join)(process.cwd(), 'uploads'), {
        prefix: '/uploads',
        setHeaders: (res, path) => {
            const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
            const mime = mimeMap[ext];
            if (mime)
                res.setHeader('Content-Type', mime);
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Cache-Control', 'private, max-age=86400');
        },
    });
    const port = process.env.PORT ?? 3001;
    const server = await app.listen(port, '0.0.0.0');
    if (NODE_ENV === 'production') {
        server.keepAliveTimeout = 65_000;
        server.headersTimeout = 70_000;
    }
    logger.log(`Backend corriendo en puerto ${port} (${NODE_ENV})`);
    const signals = ['SIGTERM', 'SIGINT'];
    signals.forEach((signal) => {
        process.on(signal, async () => {
            logger.log(`Señal ${signal} recibida — cerrando servidor...`);
            await app.close();
            logger.log('Servidor cerrado correctamente');
            process.exit(0);
        });
    });
}
bootstrap();
//# sourceMappingURL=main.js.map