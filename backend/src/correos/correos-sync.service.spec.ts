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
 * que la importacion inicial no llene la campana, y que cada correo nuevo del
 * delta genere su propio aviso persistente.
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
  const outbox = new Map<string, any>();
  const query = jest.fn(async (sql: string, params: any[] = []) => {
    if (sql.includes('INSERT INTO correo_notification_outbox')) {
      const [
        recipientId,
        messageId,
        correoIds,
        cantidad,
        carpeta,
        asunto,
        remitenteNombre,
        remitenteEmail,
        vistaPrevia,
        hayNoLeidos,
      ] = params;
      if (!outbox.has(messageId)) {
        outbox.set(messageId, {
          id: `outbox-${messageId}`,
          correo_mensaje_id: messageId,
          correo_mensaje_ids: correoIds,
          recipient_id: recipientId,
          cantidad,
          carpeta,
          asunto,
          remitente_nombre: remitenteNombre,
          remitente_email: remitenteEmail,
          vista_previa: vistaPrevia,
          hay_no_leidos: hayNoLeidos,
          entregado_at: null,
        });
      }
      return [];
    }
    if (sql.includes('SELECT id, correo_mensaje_id, correo_mensaje_ids')) {
      return [...outbox.values()].filter((row) => row.recipient_id === params[0] && !row.entregado_at);
    }
    if (sql.includes('UPDATE correo_notification_outbox')) {
      const row = [...outbox.values()].find((x) => x.id === params[0]);
      if (row) row.entregado_at = new Date();
      return [];
    }
    return [];
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    outbox.clear();
    save.mockImplementation(async (x: any) => ({
      ...x,
      id: x.id ?? `uuid-${x.graphMessageId ?? 'local-1'}`,
    }));
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
          useValue: { query },
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
    bodyPreview: `Vista previa ${id}`,
    from: { emailAddress: { name: 'Ana Pérez', address: 'ana@x.com' } },
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

  it('crea un aviso separado por cada correo nuevo del delta', async () => {
    carpetaYaImportada();
    mensajeFindOne.mockResolvedValue(null);
    get.mockResolvedValueOnce({
      value: [mensaje('g1', '2026-10-05T10:00:00Z'), mensaje('g2', '2026-10-05T11:00:00Z')],
      '@odata.deltaLink': 'dl-1',
    });

    const r = await service.sincronizarAsesor('asesor-1', 'Jean', true);

    expect(r.nuevos).toBe(2);
    expect(r.huboImportacionInicial).toBe(false);
    expect(crearNotificacion).toHaveBeenCalledTimes(2);

    const avisos = crearNotificacion.mock.calls.map(([dto]) => dto);
    expect(avisos.map((dto) => dto.entityId)).toEqual(['uuid-g1', 'uuid-g2']);
    for (const dto of avisos) {
      expect(dto.type).toBe('correo_nuevo');
      expect(dto.recipientId).toBe('asesor-1');
      expect(dto.entityType).toBe('correo');
      expect(dto.title).toBe(`Asunto ${dto.entityId.slice('uuid-'.length)}`);
      expect(dto.message).toBe('De: Ana Pérez <ana@x.com>');
      expect(dto.meta.nuevos).toBe(1);
      expect(dto.meta.correoIds).toEqual([dto.entityId]);
      expect(dto.meta.remitenteNombre).toBe('Ana Pérez');
      expect(dto.meta.remitenteEmail).toBe('ana@x.com');
      expect(dto.meta.vistaPrevia).toContain('Vista previa');
    }
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

  it('el boton de buscar nuevos también deja un aviso persistente', async () => {
    carpetaYaImportada();
    mensajeFindOne.mockResolvedValue(null);
    get.mockResolvedValueOnce({
      value: [mensaje('g1', '2026-10-05T10:00:00Z')],
      '@odata.deltaLink': 'dl-1',
    });

    const r = await service.sincronizarAsesor('asesor-1', 'Jean', false);

    expect(r.nuevos).toBe(1);
    expect(crearNotificacion).toHaveBeenCalledTimes(1);
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

  it('un tick que se une a una búsqueda manual en curso conserva el aviso nuevo', async () => {
    carpetaYaImportada();
    mensajeFindOne.mockResolvedValue(null);
    let liberar: (v: any) => void = () => undefined;
    get.mockReturnValueOnce(new Promise((res) => { liberar = res; }));

    const manual = service.sincronizarAsesor('asesor-1', 'Jean', false);
    const tick = service.sincronizarAsesor('asesor-1', 'Jean', true);
    liberar({ value: [mensaje('g1', '2026-10-05T10:00:00Z')], '@odata.deltaLink': 'dl-1' });
    const [manualResult, tickResult] = await Promise.all([manual, tick]);

    expect(manualResult.nuevos).toBe(1);
    expect(tickResult.nuevos).toBe(1);
    expect(crearNotificacion).toHaveBeenCalledTimes(1);
    expect([...outbox.values()].filter((x) => !x.entregado_at)).toHaveLength(0);
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
    expect([...outbox.values()].some((x) => !x.entregado_at)).toBe(true);
  });

  it('reintenta el aviso pendiente en la siguiente pasada sin duplicar el correo', async () => {
    carpetaYaImportada();
    mensajeFindOne.mockResolvedValue(null);
    get.mockResolvedValueOnce({
      value: [mensaje('g1', '2026-10-05T10:00:00Z')],
      '@odata.deltaLink': 'dl-1',
    });
    crearNotificacion.mockRejectedValueOnce(new Error('fallo temporal'));

    await service.sincronizarAsesor('asesor-1', 'Jean', true);
    expect([...outbox.values()].filter((x) => !x.entregado_at)).toHaveLength(1);

    await (service as any).entregarAvisosPendientes('asesor-1');
    expect(crearNotificacion).toHaveBeenCalledTimes(2);
    expect([...outbox.values()].filter((x) => !x.entregado_at)).toHaveLength(0);
  });

  it('desglosa una fila antigua del outbox en avisos individuales', async () => {
    outbox.set('legacy-batch', {
      id: 'legacy-batch',
      recipient_id: 'asesor-1',
      correo_mensaje_id: 'mail-2',
      correo_mensaje_ids: ['mail-1', 'mail-2'],
      cantidad: 2,
      carpeta: '10.Jean M.',
      asunto: 'Asunto de mail-2',
      remitente_nombre: 'Ana Pérez',
      remitente_email: 'ana@x.com',
      vista_previa: 'Contenido de prueba',
      hay_no_leidos: true,
      entregado_at: null,
    });

    await (service as any).entregarAvisosPendientes('asesor-1');

    expect(crearNotificacion).toHaveBeenCalledTimes(2);
    expect(crearNotificacion.mock.calls.map(([dto]) => dto.entityId)).toEqual(['mail-1', 'mail-2']);
    expect(crearNotificacion.mock.calls.map(([dto]) => dto.meta.correoIds)).toEqual([
      ['mail-1'],
      ['mail-2'],
    ]);
    expect(crearNotificacion.mock.calls[1][0]).toMatchObject({
      title: 'Asunto de mail-2',
      message: 'De: Ana Pérez <ana@x.com>',
      meta: { vistaPrevia: 'Contenido de prueba' },
    });
    expect([...outbox.values()][0].entregado_at).toBeTruthy();
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
