jest.mock('sanitize-html', () => (value: string) => value);

const mockResendSend = jest.fn();

jest.mock('resend', () => ({
  Resend: class {
    emails = { send: mockResendSend };
  },
}));

jest.mock('../common/mail/smtp.helper', () => ({
  createSmtpTransport: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  access: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('contenido')),
}));

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TicketMailService } from './ticket-mail.service';
import { ConfiguracionService } from '../configuracion/configuracion.service';
import { createSmtpTransport } from '../common/mail/smtp.helper';
import type {
  SmtpConnectionOptions,
  SmtpTransportResult,
} from '../common/mail/smtp.helper';
import { Configuracion } from '../configuracion/entities/configuracion.entity';
import { Ticket } from './ticket.entity';

const mockedCreateSmtpTransport = createSmtpTransport as jest.Mock<
  Promise<SmtpTransportResult>,
  [SmtpConnectionOptions]
>;

const transporterMock = {
  sendMail: jest.fn(),
  close: jest.fn(),
};

function baseCfg(overrides: Record<string, unknown> = {}): Configuracion {
  return {
    ticketEmailActivo: true,
    ticketEmailSendCopy: false,
    ticketEmailIncludeInfo: true,
    ticketEmailSenderName: 'Soporte',
    smtpHost: '',
    smtpUser: '',
    smtpPass: '',
    mailFrom: '',
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
  let configGet: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    getGlobal = jest.fn();
    configGet = jest.fn().mockReturnValue(undefined);
    mockResendSend.mockResolvedValue({ data: { id: 'resend-1' }, error: null });
    transporterMock.sendMail.mockResolvedValue({ messageId: 'smtp-1' });

    const module = await Test.createTestingModule({
      providers: [
        TicketMailService,
        {
          provide: ConfiguracionService,
          useValue: { getGlobal },
        },
        {
          provide: ConfigService,
          useValue: { get: configGet },
        },
      ],
    }).compile();

    service = module.get(TicketMailService);

    mockedCreateSmtpTransport.mockResolvedValue({
      transporter: transporterMock as never,
      host: 'smtp.gmail.com',
      connectHost: 'smtp.gmail.com',
      resolved: false,
    });
  });

  it('email invalido => omite el envio sin bloquear (requerido false)', async () => {
    getGlobal.mockResolvedValue(baseCfg());
    const res = await service.enviarTicket(makeTicket(), '  no-valido  ');
    expect(res).toEqual({ enviado: false, requerido: false });
    expect(mockResendSend).not.toHaveBeenCalled();
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

  it('sin SMTP ni remitente => falla de forma requerida', async () => {
    getGlobal.mockResolvedValue(baseCfg());
    const res = await service.enviarTicket(makeTicket(), 'cliente@correo.com');
    expect(res).toEqual({ enviado: false, requerido: true });
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('con SMTP configurado => envia por SMTP y reporta enviado', async () => {
    getGlobal.mockResolvedValue(
      baseCfg({
        smtpHost: 'smtp.gmail.com',
        smtpUser: 'cuenta@gmail.com',
        smtpPass: 'app-password',
        mailFrom: 'cuenta@gmail.com',
      }),
    );
    const res = await service.enviarTicket(makeTicket(), 'cliente@correo.com');
    expect(res).toEqual({ enviado: true, requerido: true });
    expect(mockedCreateSmtpTransport).toHaveBeenCalled();
    expect(transporterMock.sendMail).toHaveBeenCalled();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('sin SMTP pero con MAIL_FROM => envia por Resend y reporta enviado', async () => {
    getGlobal.mockResolvedValue(baseCfg({ mailFrom: 'no-reply@dominio.com' }));
    const res = await service.enviarTicket(makeTicket(), 'cliente@correo.com');
    expect(res).toEqual({ enviado: true, requerido: true });
    expect(mockResendSend).toHaveBeenCalledTimes(1);
  });

  it('error del proveedor (Resend) => falla de forma requerida', async () => {
    getGlobal.mockResolvedValue(baseCfg({ mailFrom: 'no-reply@dominio.com' }));
    mockResendSend.mockResolvedValue({
      data: null,
      error: { message: 'invalid api key' },
    });
    const res = await service.enviarTicket(makeTicket(), 'cliente@correo.com');
    expect(res).toEqual({ enviado: false, requerido: true });
  });

  it('excepcion durante el envio SMTP => falla de forma requerida', async () => {
    getGlobal.mockResolvedValue(
      baseCfg({
        smtpHost: 'smtp.gmail.com',
        smtpUser: 'cuenta@gmail.com',
        smtpPass: 'app-password',
      }),
    );
    transporterMock.sendMail.mockRejectedValue(new Error('connection refused'));
    const res = await service.enviarTicket(makeTicket(), 'cliente@correo.com');
    expect(res).toEqual({ enviado: false, requerido: true });
  });

  it('adjuntos activos por SMTP => adjunta los archivos del ticket', async () => {
    getGlobal.mockResolvedValue(
      baseCfg({
        ticketEmailAttachments: true,
        ticketEmailCuerpo: '{{conversacion}}',
        smtpHost: 'smtp.gmail.com',
        smtpUser: 'cuenta@gmail.com',
        smtpPass: 'app-password',
        mailFrom: 'cuenta@gmail.com',
      }),
    );
    const res = await service.enviarTicket(
      makeTicketConAdjuntos(),
      'cliente@correo.com',
    );
    expect(res).toEqual({ enviado: true, requerido: true });
    expect(transporterMock.sendMail).toHaveBeenCalled();
    const args = transporterMock.sendMail.mock.calls[0][0];
    expect(args.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: 'documento.pdf',
          contentType: 'application/pdf',
        }),
        expect.objectContaining({
          filename: 'captura.png',
          contentType: 'image/png',
        }),
      ]),
    );
    const html: string = args.html;
    expect(html).toContain('documento.pdf');
    expect(html).toContain('captura.png');
  });

  it('adjuntos activos por Resend => adjunta archivos en base64', async () => {
    getGlobal.mockResolvedValue(
      baseCfg({
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
        smtpHost: 'smtp.gmail.com',
        smtpUser: 'cuenta@gmail.com',
        smtpPass: 'app-password',
        mailFrom: 'cuenta@gmail.com',
      }),
    );
    const res = await service.enviarTicket(
      makeTicketConAdjuntos(),
      'cliente@correo.com',
    );
    expect(res).toEqual({ enviado: true, requerido: true });
    const args = transporterMock.sendMail.mock.calls[0][0];
    expect(args.attachments).toEqual([]);
    expect(args.html).not.toContain('documento.pdf');
    expect(args.html).not.toContain('captura.png');
  });

  it('adjuntos sin archivo en disco => se omiten sin fallar', async () => {
    const { access } = jest.requireMock('fs/promises');
    access.mockRejectedValueOnce(new Error('ENOENT'));
    getGlobal.mockResolvedValue(
      baseCfg({
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
