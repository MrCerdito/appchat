import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ServiceUnavailableException } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { Ticket } from './ticket.entity';
import { User } from '../auth/entities/user.entity';
import { TicketMailService } from './ticket-mail.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

jest.mock('sanitize-html', () => (value: string) => value);

interface EnviarTicketResult {
  enviado: boolean;
  requerido: boolean;
}

describe('TicketsService (creacion y envio de correo)', () => {
  let service: TicketsService;
  let repo: {
    save: jest.Mock<Promise<Ticket>, [Ticket]>;
    delete: jest.Mock<Promise<{ affected: number }>, [string]>;
    findOne: jest.Mock<Promise<Ticket | null>, [unknown]>;
  };
  let userRepo: { findOneBy: jest.Mock<Promise<User | null>, [unknown]> };
  let ticketMail: {
    enviarTicket: jest.Mock<Promise<EnviarTicketResult>, [Ticket, string]>;
  };
  const savedTickets: Ticket[] = [];

  function dto(email?: string): CreateTicketDto {
    return {
      titulo: 'Solicitud de prueba',
      sourceType: 'web',
      sourceId: 'ses-1',
      clientName: 'Laura Gomez',
      ...(email ? { email } : {}),
    };
  }

  beforeEach(async () => {
    savedTickets.length = 0;
    repo = {
      save: jest.fn<Promise<Ticket>, [Ticket]>(),
      delete: jest.fn<Promise<{ affected: number }>, [string]>(),
      findOne: jest.fn<Promise<Ticket | null>, [unknown]>(),
    };
    repo.save.mockImplementation((t: Ticket) => {
      savedTickets.push(t);
      return Promise.resolve(t);
    });
    repo.delete.mockResolvedValue({ affected: 1 });
    repo.findOne.mockResolvedValue(null);
    userRepo = {
      findOneBy: jest.fn<Promise<User | null>, [unknown]>(),
    };
    ticketMail = {
      enviarTicket: jest.fn<Promise<EnviarTicketResult>, [Ticket, string]>(),
    };

    const module = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: repo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: TicketMailService, useValue: ticketMail },
      ],
    }).compile();

    service = module.get(TicketsService);
  });

  it('correo enviado OK => crea el ticket con emailEnviado true', async () => {
    ticketMail.enviarTicket.mockResolvedValue({
      enviado: true,
      requerido: true,
    });
    const res = await service.create(dto('cliente@correo.com'));
    expect(res.emailEnviado).toBe(true);
    expect(repo.delete).not.toHaveBeenCalled();
    expect(ticketMail.enviarTicket).toHaveBeenCalledTimes(1);
  });

  it('correo requerido que falla => NO genera el ticket y borra la fila', async () => {
    ticketMail.enviarTicket.mockResolvedValue({
      enviado: false,
      requerido: true,
    });
    await expect(
      service.create(dto('cliente@correo.com')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repo.delete).toHaveBeenCalledTimes(1);
    expect(repo.delete.mock.calls[0][0]).toBe(savedTickets[0].id);
  });

  it('correo omitido por diseno (requerido false) => crea el ticket con emailEnviado false', async () => {
    ticketMail.enviarTicket.mockResolvedValue({
      enviado: false,
      requerido: false,
    });
    const res = await service.create(dto('cliente@correo.com'));
    expect(res.emailEnviado).toBe(false);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('sin email del cliente => crea el ticket sin intentar enviar', async () => {
    const res = await service.create(dto());
    expect(res.emailEnviado).toBe(false);
    expect(ticketMail.enviarTicket).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
