// src/sharepoint/sharepoint.module.ts

import { Module } from '@nestjs/common';
import { CorreosModule } from '../correos/correos.module';
import { SharepointController } from './sharepoint.controller';
import { SharepointService } from './sharepoint.service';

/**
 * Módulo de solo lectura sobre SharePoint (sitio de Soporte).
 *
 * Importa `CorreosModule` únicamente por `MicrosoftGraphMailService`: es el
 * único cliente de Graph del proyecto con token de aplicación cacheado,
 * reintentos y traducción de errores; no se crea un segundo cliente.
 * ConfigModule es global, así que ConfigService llega sin importarlo.
 */
@Module({
  imports: [CorreosModule],
  controllers: [SharepointController],
  providers: [SharepointService],
  exports: [SharepointService],
})
export class SharepointModule {}
