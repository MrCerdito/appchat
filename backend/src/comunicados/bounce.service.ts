import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { Comunicado, Destinatario } from './entities/comunicado.entity';
import { revisarBandejaImap, RebotadoInfo, obtenerTokenOAuth2Imap } from '../common/mail/imap.helper';
import { normalizarCredencialMailsender } from '../common/mail/mailsender.helper';

const INTERVALO_REBOTES_MS = 10 * 60 * 1000;

@Injectable()
export class BounceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BounceService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private enProceso = false;

  constructor(
    @InjectRepository(Comunicado)
    private readonly comunicadoRepo: Repository<Comunicado>,
    private readonly configuracion: ConfiguracionService,
  ) {}

  onModuleInit(): void {
    this.intervalHandle = setInterval(() => {
      void this.revisarRebotesAhora().catch((err: any) =>
        this.logger.error(
          `Fallo la revision automatica de rebotes: ${String(err?.message ?? err)}`,
        ),
      );
    }, INTERVALO_REBOTES_MS);
    this.logger.log(
      'Revision de rebotes (NDR) de correo iniciada (intervalo 10 min)',
    );
  }

  onModuleDestroy(): void {
    if (this.intervalHandle) clearInterval(this.intervalHandle);
  }

  /**
   * Lee la bandeja del correo SMTP vía IMAP, detecta avisos de no entrega
   * (NDR) y marca como `bounced` a los destinatarios correspondientes.
   */
  async revisarRebotesAhora(): Promise<{
    ok: boolean;
    procesados: number;
    rebotados: number;
    actualizados: number;
    error?: string;
  }> {
    if (this.enProceso) {
      return {
        ok: true,
        procesados: 0,
        rebotados: 0,
        actualizados: 0,
        error: 'Ya hay una revisión de rebotes en curso.',
      };
    }
    this.enProceso = true;
    try {
      const cfg = await this.configuracion.getGlobal();
      const credencial = normalizarCredencialMailsender(
        cfg.mailsenderCredencial as Record<string, unknown> | null | undefined,
      );
      const smtpHost = cfg.smtpHost?.trim() || '';
      const smtpUser = cfg.smtpUser?.trim() || '';
      const smtpPass = cfg.smtpPass?.trim() || '';

      const metodo = cfg.metodoEnvioCorreo === 'smtp' ? 'smtp' : 'mailsender';

      const mailsenderListo = Boolean(credencial);
      const smtpListo = Boolean(smtpHost && smtpUser && smtpPass);
      if (
        (metodo === 'smtp' && !smtpListo) ||
        (metodo === 'mailsender' && !mailsenderListo)
      ) {
        return {
          ok: false,
          procesados: 0,
          rebotados: 0,
          actualizados: 0,
          error:
            'Configura la cuenta de correo activa (email, usuario y password) para revisar rebotes.',
        };
      }
      if (cfg.revisarRebotes === false) {
        return {
          ok: false,
          procesados: 0,
          rebotados: 0,
          actualizados: 0,
          error: 'La revisión de rebotes está desactivada en Configuración.',
        };
      }

      // Host base para derivar el IMAP segun el metodo activo: en modo SMTP se
      // usa el host SMTP; en modo Mailsender el dominio del email de la
      // credencial (imap.{dominio}) o el servidor destino si no es el valor
      // sentinela "vacio".
      let hostBase: string;
      let user: string;
      let pass: string;
      if (metodo === 'smtp') {
        hostBase = smtpHost;
        user = smtpUser;
        pass = smtpPass;
      } else {
        const dominioEmail = credencial?.email?.includes('@')
          ? String(credencial.email).split('@')[1] || ''
          : '';
        const servidorCredencial = credencial?.servidorsmtp || '';
        const esM365 = Boolean(credencial?.azure_ClientId);
        hostBase =
          (servidorCredencial && servidorCredencial !== 'vacio'
            ? servidorCredencial
            : esM365
              ? 'outlook.office365.com'
              : dominioEmail) || '';
        user = credencial?.usuario || '';
        pass = credencial?.password || '';
      }

      if (!hostBase || !user || !pass) {
        return {
          ok: false,
          procesados: 0,
          rebotados: 0,
          actualizados: 0,
          error:
            'No se pudo deducir el servidor IMAP de la cuenta activa. Configura el Host IMAP manualmente.',
        };
      }

      // Cuentas Microsoft 365 (con azure_*): autenticacion OAuth2 (XOAUTH2),
      // ya que Microsoft bloquea la autenticacion basica IMAP.
      let accessToken: string | undefined;
      if (metodo === 'mailsender' && credencial?.azure_ClientId) {
        accessToken =
          (await obtenerTokenOAuth2Imap(
            credencial.azure_TenantId || '',
            credencial.azure_ClientId || '',
            credencial.azure_ClientSecret || '',
          )) || undefined;
        if (!accessToken) {
          return {
            ok: false,
            procesados: 0,
            rebotados: 0,
            actualizados: 0,
            error:
              'No se pudo obtener el token OAuth2 para leer la bandeja de correo (IMAP). Verifica que la App Registration de Azure tenga el permiso IMAP.AccessAsApp con consentimiento de administrador.',
          };
        }
      }

      const resultado = await revisarBandejaImap({
        host: hostBase,
        port: Number(cfg.smtpPort) || 465,
        user,
        pass,
        imapHost: cfg.smtpImapHost,
        imapPort: cfg.smtpImapPort,
        accessToken,
      });

      if (resultado.error) {
        this.logger.warn(`IMAP: ${resultado.error}`);
        return {
          ok: false,
          procesados: resultado.procesados,
          rebotados: 0,
          actualizados: 0,
          error: `No se pudo leer la bandeja de correo (${resultado.error}). Verificá que IMAP esté habilitado en la cuenta.`,
        };
      }

      const actualizados = await this.aplicarRebotes(resultado.rebotados);

      if (actualizados > 0) {
        this.logger.log(
          `Rebotes aplicados: ${actualizados} destinatario(s) marcado(s) del lote de ${resultado.rebotados.length} NDR.`,
        );
      }
      return {
        ok: true,
        procesados: resultado.procesados,
        rebotados: resultado.rebotados.length,
        actualizados,
      };
    } finally {
      this.enProceso = false;
    }
  }

  private async aplicarRebotes(rebotes: RebotadoInfo[]): Promise<number> {
    if (!rebotes.length) return 0;

    let total = 0;
    const vistos = new Set<string>();

    for (const rebote of rebotes) {
      const clave = `${rebote.comunicadoId ?? ''}|${rebote.email}`;
      if (vistos.has(clave)) continue;
      vistos.add(clave);

      const qb = this.comunicadoRepo
        .createQueryBuilder('c')
        .where(`c.destinatarios @> :filtro`, {
          filtro: JSON.stringify([{ email: rebote.email, sendStatus: 'ok' }]),
        });
      if (rebote.comunicadoId) {
        qb.andWhere('c.id = :cid', { cid: rebote.comunicadoId });
      }

      const comunicados = await qb.getMany();
      for (const c of comunicados) {
        let tocado = false;
        c.destinatarios = c.destinatarios.map((d: Destinatario) => {
          if (
            d.email.toLowerCase() === rebote.email.toLowerCase() &&
            d.sendStatus === 'ok'
          ) {
            tocado = true;
            return {
              ...d,
              sendStatus: 'bounced',
              sendError: rebote.motivo,
              bouncedAt: new Date().toISOString(),
            };
          }
          return d;
        });
        if (tocado) {
          await this.comunicadoRepo.save({
            id: c.id,
            destinatarios: c.destinatarios,
          });
          total += 1;
        }
      }
    }

    return total;
  }
}
