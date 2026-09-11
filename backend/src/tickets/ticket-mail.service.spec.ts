jest.mock('sanitize-html', () => (value: string) => value);

const mockResendSend = jest.fn();

jest.mock('resend', () => ({
  Resend: class {
    emails = { send: mockResendSend };
  },
}));

jest.mock('../common/mail/mailsender.helper', () => ({
  ...jest.requireActual('../common/mail/mailsender.helper'),
  enviarCorreoMailsender: jest.fn(),
  archivoAUri: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  access: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('contenido')),
}));

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TicketMailService } from './ticket-mail.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import {
  enviarCorreoMailsender,
  archivoAUri,
} from '../common/mail/mailsender.helper';
import { Configuracion } from '../configuracion/entities/configuracion.entity';
import { Ticket } from './ticket.entity';

const mockedEnviarCorreoMailsender = enviarCorreoMailsender as jest.Mock;
const mockedArchivoAUri = archivoAUri as jest.Mock;

const credencialBasica = {
  email: 'info1@innovacloud.co',
  usuario: 'info1@innovacloud.co',
  password: '1',
  nombre: 'Soporte',
  port: 587,
  servidorsmtp: 'vacio',
  seguridadssl: true,
  protocolo_Tls12: true,
  azure_TenantId: '',
  azure_ClientId: '',
  azure_ClientSecret: '',
};

function baseCfg(overrides: Record<string, unknown> = {}): Configuracion {
  return {
    ticketEmailActivo: true,
    ticketEmailSendCopy: false,
    ticketEmailIncludeInfo: true,
    ticketEmailSenderName: 'Soporte',
    mailFrom: '',
    metodoEnvioCorreo: 'mailsender',
    mailsenderCredencial: null,
    mailsenderUrl: '',
    ...overrides,
  } as unknown as Configuracion;
}

function makeTicket(sourceType = 'web'): Ticket {
  return {
    codigo: 'TKT-2026-0001',
    titulo: 'Solicitud de prueba',
    descripcion: null,
    priority: 'medium',
    clientName: 'Laura Gomez',
    clientInfo: null,
    conversation: [],
    createdAt: new Date('2026-08-14T09:35:00Z'),
    sourceType,
  } as unknown as Ticket;
}

function makeTicketConAdjuntos(sourceType = 'web'): Ticket {
  return {
    codigo: 'TKT-2026-0001',
    titulo: 'Solicitud de prueba',
    descripcion: null,
    priority: 'medium',
    clientName: 'Laura Gomez',
    clientInfo: null,
    conversation: [
      {
        role: 'client',
        name: 'Laura Gomez',
        content: 'Aqui va el documento',
        attachments: [
          {
            id: 'att-1',
            url: 'https://innoovacloud.com/uploads/chat-media/doc.pdf',
            fileName: 'doc.pdf',
            originalName: 'documento.pdf',
            mimeType: 'application/pdf',
            size: 2048,
          },
          {
            id: 'att-2',
            url: 'https://innoovacloud.com/uploads/chat-media/foto.png',
            fileName: 'foto.png',
            originalName: 'captura.png',
            mimeType: 'image/png',
            size: 2048,
          },
        ],
      },
    ],
    createdAt: new Date('2026-08-14T09:35:00Z'),
    sourceType,
  } as unknown as Ticket;
}

describe('TicketMailService.enviarTicket', () => {
  let service: TicketMailService;
  let getGlobal: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    getGlobal = jest.fn();
    mockResendSend.mockResolvedValue({ data: { id: 'resend-1' }, error: null });
    mockedEnviarCorreoMailsender.mockResolvedValue({ ok: true, message: 'ok' });
    mockedArchivoAUri.mockResolvedValue({
      FileName: 'archivo',
      ContentBase64: 'data:application/octet-stream;base64,Y29udGVuaWRv',
    });

    const module = await Test.createTestingModule({
      providers: [
        TicketMailService,
        {
          provide: ConfiguracionService,
          useValue: { getGlobal },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(TicketMailService);
  });

  it('email invalido => omite el envio sin bloquear (requerido false)', async () => {
    getGlobal.mockResolvedValue(baseCfg());
    const res = await service.enviarTicket(makeTicket(), '  no-valido  ');
    expect(res).toEqual({ enviado: false, requerido: false });
    expect(mockResendSend).not.toHaveBeenCalled();
    expect(mockedEnviarCorreoMailsender).not.toHaveBeenCalled();
  });

  it('correo de tickets desactivado => omite sin bloquear', async () => {
    getGlobal.mockResolvedValue(baseCfg({ ticketEmailActivo: false }));
    const res = await service.enviarTicket(makeTicket(), 'cliente@correo.com');
    expect(res).toEqual({ enviado: false, requerido: false });
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('ticket whatsapp sin "enviar copia" => omite sin bloquear', async () => {
    getGlobal.mockResolvedValue(baseCfg());
    const res = await service.enviarTicket(
      makeTicket('whatsapp'),
      'cliente@correo.com',
    );
    expect(res).toEqual({ enviado: false, requerido: false });
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('sin credencial ni remitente => falla de forma requerida', async () => {
    getGlobal.mockResolvedValue(baseCfg());
    const res = await service.enviarTicket(makeTicket(), 'cliente@correo.com');
    expect(res).toEqual({ enviado: false, requerido: true });
    expect(mockResendSend).not.toHaveBeenCalled();
    expect(mockedEnviarCorreoMailsender).not.toHaveBeenCalled();
  });

  it('con credencial Mailsender => envia por Mailsender y reporta enviado', async () => {
    getGlobal.mockResolvedValue(
      baseCfg({
        mailsenderCredencial: credencialBasica,
        mailsenderUrl: 'https://mailsender.innovacloud.co',
      }),
    );
    const res = await service.enviarTicket(makeTicket(), 'cliente@correo.com');
    expect(res).toEqual({ enviado: true, requerido: true });
    expect(mockedEnviarCorreoMailsender).toHaveBeenCalledWith(
      expect.objectContaining({
        correosNormales: 'cliente@correo.com',
        asunto: expect.any(String),
      }),
    );
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('sin credencial pero con MAIL_FROM (modo smtp) => envia por Resend y reporta enviado', async () => {
    getGlobal.mockResolvedValue(
      baseCfg({ metodoEnvioCorreo: 'smtp', mailFrom: 'no-reply@dominio.com' }),
    );
    const res = await service.enviarTicket(makeTicket(), 'cliente@correo.com');
    expect(res).toEqual({ enviado: true, requerido: true });
    expect(mockResendSend).toHaveBeenCalledTimes(1);
    expect(mockedEnviarCorreoMailsender).not.toHaveBeenCalled();
  });

  it('error del proveedor (Resend) => falla de forma requerida', async () => {
    getGlobal.mockResolvedValue(
      baseCfg({ metodoEnvioCorreo: 'smtp', mailFrom: 'no-reply@dominio.com' }),
    );
    mockResendSend.mockResolvedValue({
      data: null,
      error: { message: 'invalid api key' },
    });
    const res = await service.enviarTicket(makeTicket(), 'cliente@correo.com');
    expect(res).toEqual({ enviado: false, requerido: true });
  });

  it('error del gateway Mailsender => falla de forma requerida', async () => {
    getGlobal.mockResolvedValue(
      baseCfg({
        mailsenderCredencial: credencialBasica,
        mailsenderUrl: 'https://mailsender.innovacloud.co',
      }),
    );
    mockedEnviarCorreoMailsender.mockResolvedValue({
      ok: false,
      message: 'El servicio de correo rechazo el envio.',
    });
    const res = await service.enviarTicket(makeTicket(), 'cliente@correo.com');
    expect(res).toEqual({ enviado: false, requerido: true });
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('adjuntos activos por Mailsender => adjunta los archivos del ticket', async () => {
    mockedArchivoAUri
      .mockResolvedValueOnce({
        FileName: 'documento.pdf',
        ContentBase64: 'data:application/octet-stream;base64,ZG9j',
      })
      .mockResolvedValueOnce({
        FileName: 'captura.png',
        ContentBase64: 'data:image/png;base64,Wkg=',
      });
    getGlobal.mockResolvedValue(
      baseCfg({
        ticketEmailAttachments: true,
        ticketEmailCuerpo: '{{conversacion}}',
        mailsenderCredencial: credencialBasica,
        mailsenderUrl: 'https://mailsender.innovacloud.co',
      }),
    );
    const res = await service.enviarTicket(
      makeTicketConAdjuntos(),
      'cliente@correo.com',
    );
    expect(res).toEqual({ enviado: true, requerido: true });
    const args = mockedEnviarCorreoMailsender.mock.calls[0][0];
    expect(args.archivos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ FileName: 'documento.pdf' }),
        expect.objectContaining({ FileName: 'captura.png' }),
      ]),
    );
    const html: string = args.html;
    expect(html).toContain('documento.pdf');
    expect(html).toContain('captura.png');
  });

  it('adjuntos activos por Resend => adjunta archivos en base64', async () => {
    getGlobal.mockResolvedValue(
      baseCfg({
        metodoEnvioCorreo: 'smtp',
        ticketEmailAttachments: true,
        ticketEmailCuerpo: '{{conversacion}}',
        mailFrom: 'no-reply@dominio.com',
      }),
    );
    const res = await service.enviarTicket(
      makeTicketConAdjuntos(),
      'cliente@correo.com',
    );
    expect(res).toEqual({ enviado: true, requerido: true });
    expect(mockResendSend).toHaveBeenCalledTimes(1);
    const sendArgs = mockResendSend.mock.calls[0][0];
    expect(sendArgs.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'documento.pdf' }),
        expect.objectContaining({ filename: 'captura.png' }),
      ]),
    );
    expect(sendArgs.html).toContain('documento.pdf');
  });

  it('adjuntos desactivados => no adjunta archivos ni los muestra', async () => {
    getGlobal.mockResolvedValue(
      baseCfg({
        ticketEmailCuerpo: '{{conversacion}}',
        mailsenderCredencial: credencialBasica,
        mailsenderUrl: 'https://mailsender.innovacloud.co',
      }),
    );
    const res = await service.enviarTicket(
      makeTicketConAdjuntos(),
      'cliente@correo.com',
    );
    expect(res).toEqual({ enviado: true, requerido: true });
    const args = mockedEnviarCorreoMailsender.mock.calls[0][0];
    expect(args.archivos).toBeUndefined();
    expect(args.html).not.toContain('documento.pdf');
    expect(args.html).not.toContain('captura.png');
  });

  it('adjuntos sin archivo en disco => se omiten sin fallar', async () => {
    const { access } = jest.requireMock('fs/promises');
    access.mockRejectedValueOnce(new Error('ENOENT'));
    mockedArchivoAUri.mockRejectedValue(new Error('ENOENT'));
    getGlobal.mockResolvedValue(
      baseCfg({
        metodoEnvioCorreo: 'smtp',
        ticketEmailAttachments: true,
        mailFrom: 'no-reply@dominio.com',
      }),
    );
    const res = await service.enviarTicket(
      makeTicketConAdjuntos(),
      'cliente@correo.com',
    );
    expect(res).toEqual({ enviado: true, requerido: true });
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });
});
