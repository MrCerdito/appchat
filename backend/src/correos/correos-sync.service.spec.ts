import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { CorreosSyncService } from './correos-sync.service';
import { MicrosoftGraphMailService } from './microsoft-graph-mail.service';
import { CorreosCarpetaService } from './correos-carpeta.service';
import { CorreosGateway } from './correos.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { CorreoMensaje } from './entities/correo-mensaje.entity';
import { CorreoCarpetaSync } from './entities/correo-carpeta-sync.entity';
import { User } from '../auth/entities/user.entity';

/**
 * Estos tests cubren la parte del sincronizador que decide si hay que avisar:
 * que la importacion inicial no llene la campana, que el delta si avise, y que
 * el aviso salga una vez por tanda y no uno por correo.
 */
describe('CorreosSyncService (avisos de correo nuevo)', () => {
  let service: CorreosSyncService;

  const enviarCambio = jest.fn();
  const crearNotificacion = jest.fn();
  const get = jest.fn();

  /**
   * `carpetaFindOne` y `mensajeFindOne` estan separados a proposito: son dos
   * repos distintos. Compartir un unico mock hacia que el estado del delta se
   * confundiera con la fila del mensaje ya sincronizado.
   */
  const carpetaFindOne = jest.fn();
  const mensajeFindOne = jest.fn();
  const save = jest.fn();
  const update = jest.fn();
  const deleteMensaje = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    save.mockImplementation(async (x: any) => ({ ...x, id: x.id ?? 'uuid-local-1' }));
    update.mockResolvedValue({ affected: 1 });
    crearNotificacion.mockResolvedValue({ id: 'n1' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CorreosSyncService,
        {
          provide: getRepositoryToken(CorreoMensaje),
          useValue: {
            findOne: mensajeFindOne,
            create: (d: any) => ({ ...d }),
            save,
            update,
            delete: deleteMensaje,
          },
        },
        {
          provide: getRepositoryToken(CorreoCarpetaSync),
          useValue: {
            findOne: carpetaFindOne,
            create: (d: any) => ({ ...d }),
            save,
          },
        },
        { provide: getRepositoryToken(User), useValue: { find: jest.fn() } },
        { provide: MicrosoftGraphMailService, useValue: { get } },
        {
          provide: CorreosCarpetaService,
          useValue: {
            carpetaDelAsesor: async () => ({
              folderId: 'f1',
              parentFolderId: 'p1',
              displayName: '10.Jean M.',
            }),
            buzonId: async () => 'buzon@x',
            invalidar: jest.fn(),
            upnBuzon: () => 'buzon@x',
          },
        },
        { provide: CorreosGateway, useValue: { enviarCambio } },
        { provide: NotificationsService, useValue: { create: crearNotificacion } },
        { provide: ConfigService, useValue: { get: () => undefined } },
        {
          provide: DataSource,
          useValue: { query: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(CorreosSyncService);
  });

  const mensaje = (id: string, recibido: string, isRead = false) => ({
    id,
    subject: `Asunto ${id}`,
    isRead,
    receivedDateTime: recibido,
    from: { emailAddress: { name: 'Ana', address: 'ana@x.com' } },
    categories: [],
  });

  /** Carpeta ya importada antes: el delta solo trae cambios. */
  const carpetaYaImportada = (): void => {
    carpetaFindOne.mockResolvedValue({ deltaLink: 'dl-0', importadoCompleto: true });
    mensajeFindOne.mockResolvedValue({ id: 'uuid-local-1', asesorId: 'asesor-1', folderId: 'f1' });
  };

  it('no avisa durante la importacion inicial de la carpeta', async () => {
    // La carpeta nunca se importo. Todos los correos que trae el delta cuentan
    // como nuevos en el espejo, pero para el asesor ya estaban en Outlook.
    carpetaFindOne.mockResolvedValue(null);
    get.mockResolvedValueOnce({ value: [] }); // listado de la importacion completa
    get.mockResolvedValueOnce({
      value: [mensaje('g1', '2026-10-05T10:00:00Z')],
      '@odata.deltaLink': 'dl-1',
    });

    const r = await service.sincronizarAsesor('asesor-1', 'Jean', true);

    expect(r.nuevos).toBe(1);
    expect(r.huboImportacionInicial).toBe(true);
    expect(crearNotificacion).not.toHaveBeenCalled();
  });

  it('avisa una sola vez cuando el delta trae correo nuevo', async () => {
    carpetaYaImportada();
    mensajeFindOne.mockResolvedValue(null);
    get.mockResolvedValueOnce({
      value: [mensaje('g1', '2026-10-05T10:00:00Z'), mensaje('g2', '2026-10-05T11:00:00Z')],
      '@odata.deltaLink': 'dl-1',
    });

    const r = await service.sincronizarAsesor('asesor-1', 'Jean', true);

    expect(r.nuevos).toBe(2);
    expect(r.huboImportacionInicial).toBe(false);
    expect(crearNotificacion).toHaveBeenCalledTimes(1);

    const dto = crearNotificacion.mock.calls[0][0];
    expect(dto.type).toBe('correo_nuevo');
    expect(dto.recipientId).toBe('asesor-1');
    expect(dto.entityType).toBe('correo');
    // El aviso lleva el id local, no el de Graph: el de Graph es base64 y no
    // cabe en la columna varchar(36) de la notificacion.
    expect(dto.entityId).toBe('uuid-local-1');
    expect(dto.meta.nuevos).toBe(2);
    expect(dto.title).toContain('2 correos nuevos');
  });

  it('el aviso engrana el correo mas reciente y detecta si hay no leidos', async () => {
    carpetaYaImportada();
    mensajeFindOne.mockResolvedValue(null);
    get.mockResolvedValueOnce({
      value: [
        mensaje('g1', '2026-10-05T11:00:00Z', true), // mas reciente, ya leido
        mensaje('g2', '2026-10-05T10:00:00Z', false), // mas viejo, sin leer
      ],
      '@odata.deltaLink': 'dl-1',
    });

    const r = await service.sincronizarAsesor('asesor-1', 'Jean', true);

    expect(r.asuntoUltimoNuevo).toBe('Asunto g1');
    // `hayNoLeidos` mira TODOS los nuevos, no solo el mas reciente: si no, el
    // aviso diria "todo leido" habiendo uno sin leer en la misma tanda.
    expect(r.hayNoLeidos).toBe(true);
  });

  it('el boton de buscar nuevos sincroniza pero no genera aviso', async () => {
    carpetaYaImportada();
    mensajeFindOne.mockResolvedValue(null);
    get.mockResolvedValueOnce({
      value: [mensaje('g1', '2026-10-05T10:00:00Z')],
      '@odata.deltaLink': 'dl-1',
    });

    const r = await service.sincronizarAsesor('asesor-1', 'Jean', false);

    expect(r.nuevos).toBe(1);
    expect(crearNotificacion).not.toHaveBeenCalled();
  });

  it('avisa por socket tambien cuando solo cambia el estado de lectura', async () => {
    // Esto es lo que arregla el atraso que motiva el cambio: no hay correo
    // nuevo, solo se marco como leido en Outlook.
    carpetaYaImportada();
    get.mockResolvedValueOnce({
      value: [mensaje('g1', '2026-10-05T10:00:00Z', true)],
      '@odata.deltaLink': 'dl-1',
    });

    const r = await service.sincronizarAsesor('asesor-1', 'Jean', true);

    expect(r.nuevos).toBe(0);
    expect(r.actualizados).toBe(1);
    expect(crearNotificacion).not.toHaveBeenCalled();
    expect(enviarCambio).toHaveBeenCalledWith('asesor-1', {
      nuevos: 0,
      actualizados: 1,
      eliminados: 0,
      carpeta: '10.Jean M.',
      hayNoLeidos: false,
    });
  });

  it('reutiliza la sincronizacion en curso en vez de relanzar el delta', async () => {
    carpetaYaImportada();
    mensajeFindOne.mockResolvedValue(null);
    // Se resuelve a mano para lanzar dos llamadas antes de que la primera
    // termine: esa es la carrera del tic contra el sync al abrir el modulo.
    let liberar: (v: any) => void = () => undefined;
    get.mockReturnValueOnce(
      new Promise((res) => {
        liberar = res;
      }),
    );

    const primera = service.sincronizarAsesor('asesor-1', 'Jean', true);
    const segunda = service.sincronizarAsesor('asesor-1', 'Jean', true);

    liberar({ value: [mensaje('g1', '2026-10-05T10:00:00Z')], '@odata.deltaLink': 'dl-1' });
    const [r1, r2] = await Promise.all([primera, segunda]);

    expect(r1).toBe(r2);
    // Una sola peticion a Graph: la segunda no pelego por el mismo deltaLink.
    expect(get).toHaveBeenCalledTimes(1);
    expect(crearNotificacion).toHaveBeenCalledTimes(1);
  });

  it('un aviso fallido no tumba la sincronizacion', async () => {
    carpetaYaImportada();
    mensajeFindOne.mockResolvedValue(null);
    get.mockResolvedValueOnce({
      value: [mensaje('g1', '2026-10-05T10:00:00Z')],
      '@odata.deltaLink': 'dl-1',
    });
    crearNotificacion.mockRejectedValueOnce(new Error('tabla notifications caida'));

    const r = await service.sincronizarAsesor('asesor-1', 'Jean', true);

    expect(r.nuevos).toBe(1);
    expect(enviarCambio).toHaveBeenCalled();
  });

  it('mientras dura el cooldown por permisos no vuelve a preguntar a Graph', async () => {
    // El frontend sincroniza cada 60 s. Sin este corte, un 403 por falta del
    // permiso Mail.Read se convertiria en 60 peticiones por minuto a una API
    // que ya esta respondiendo con error.
    (service as any).deshabilitadoHasta = Date.now() + 15 * 60 * 1000;

    const r = await service.sincronizarAsesor('asesor-1', 'Jean', true);

    expect(get).not.toHaveBeenCalled();
    expect(r.nuevos).toBe(0);
    expect(crearNotificacion).not.toHaveBeenCalled();
  });

  it('el boton manual si reintenta durante el cooldown', async () => {
    // El controller reinicia el cooldown antes de llamar, asi que este test
    // reproduce lo que hace `POST /correos/sincronizar?manual=true`.
    (service as any).deshabilitadoHasta = Date.now() + 15 * 60 * 1000;
    service.reiniciarPermisos();
    carpetaYaImportada();
    mensajeFindOne.mockResolvedValue(null);
    get.mockResolvedValueOnce({
      value: [mensaje('g1', '2026-10-05T10:00:00Z')],
      '@odata.deltaLink': 'dl-1',
    });

    const r = await service.sincronizarAsesor('asesor-1', 'Jean', true);

    expect(r.nuevos).toBe(1);
    expect(service.deshabilitado).toBe(false);
  });
});