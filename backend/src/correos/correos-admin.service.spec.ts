import { CorreosAdminService } from './correos-admin.service';
import { CorreosCarpetaService } from './correos-carpeta.service';

// `CorreosAdminService` usa `CorreosService` solo como tipo (la firma de
// `MensajeListado` y el tipo del parametro inyectado), pero importarlo arrastra
// `sanitize-html`, que a su vez tira de `htmlparser2` en ESM puro y Jest no lo
// puede cargar. El modulo real no se usa en ningun camino de este spec, asi que
// se sustituye.
jest.mock('./correos.service', () => ({
  CorreosService: class CorreosService {},
}));

/**
 * Fila del agregado que devuelve la consulta `GROUP BY asesor_id, categorias`.
 * `total` y `noLeidos` llegan como texto porque asi los devuelve Postgres.
 */
interface FilaAgregado {
  asesorId: string;
  categorias: string | null;
  total: string;
  noLeidos: string;
  ultimo: Date | null;
}

/** QueryBuilder falso: encadena cualquier llamada y devuelve lo que se le pida. */
function qbFalso(resultados: { rawMany?: unknown[]; rawOne?: unknown; many?: unknown[] }) {
  const qb: any = {};
  for (const m of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'groupBy',
    'addGroupBy',
    'limit',
    'offset',
    'leftJoinAndSelect',
  ]) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getRawMany = jest.fn(() => Promise.resolve(resultados.rawMany ?? []));
  qb.getRawOne = jest.fn(() => Promise.resolve(resultados.rawOne ?? null));
  qb.getMany = jest.fn(() => Promise.resolve(resultados.many ?? []));
  return qb;
}

describe('CorreosAdminService', () => {
  let servicio: CorreosAdminService;

  const advisers = [
    { id: 'a-jean', name: 'Jean Munoz' },
    { id: 'a-carlos', name: 'Carlos A' },
    { id: 'a-joel', name: 'Joel C' },
  ];

  let carpetaRepo: { find: jest.Mock };
  let userRepo: { find: jest.Mock; findOne: jest.Mock };
  let mensajeRepo: { createQueryBuilder: jest.Mock; count: jest.Mock };
  let adjuntoRepo: { createQueryBuilder: jest.Mock };
  let carpetas: any;
  let correos: any;
  /** Instancias de query builder creadas, para poder inspeccionar el SQL. */
  const qbs: any[] = [];

/** Crea el servicio con el agregado que se le pase. */
  function crear(
    filas: FilaAgregado[],
    carpetasAsignadas: any[] = [],
    foldersGraph: any[] = [],
  ) {
    qbs.length = 0;
    mensajeRepo = {
      createQueryBuilder: jest.fn(() => {
        const qb = qbFalso({ rawMany: filas });
        qbs.push(qb);
        return qb;
      }),
      count: jest.fn(() => Promise.resolve(0)),
    };
    adjuntoRepo = { createQueryBuilder: jest.fn(() => qbFalso({ rawMany: [] })) };
    carpetaRepo = { find: jest.fn(() => Promise.resolve(carpetasAsignadas)) };
    userRepo = {
      find: jest.fn(() => Promise.resolve(advisers)),
      findOne: jest.fn(),
    };
    carpetas = {
      upnBuzon: jest.fn(() => 'soporte@innovacloud.co'),
      nombreCarpetaPadre: jest.fn(() => 'ASIGNADOS'),
      listarCarpetasAsignadas: jest.fn(() => Promise.resolve(foldersGraph)),
    };
    correos = { cuerpo: jest.fn() };

    servicio = new CorreosAdminService(
      mensajeRepo as any,
      adjuntoRepo as any,
      carpetaRepo as any,
      userRepo as any,
      carpetas as any,
      correos as any,
    );
    return servicio;
  }

  const sync = (folderDisplayName: string, lastSyncAt: Date | null, extra: any = {}) => ({
    folderId: `id-${folderDisplayName}`,
    folderDisplayName,
    lastSyncAt,
    importadoCompleto: true,
    ...extra,
  });

  describe('resumen', () => {
    it('devuelve una fila por asesor activo, incluso sin correos', async () => {
      crear([], [sync('10.Jean M.', new Date('2026-09-23T07:33:00Z'))]);

      const r = await servicio.resumen();

      expect(r.asesores).toHaveLength(3);
      const jean = r.asesores.find((a) => a.asesorId === 'a-jean')!;
      expect(jean.total).toBe(0);
      expect(jean.abiertos).toBe(0);
      expect(jean.nivel).toBe('al_dia');
      expect(jean.carpeta).toBe('10.Jean M.');
      expect(jean.sincronizado).toBe(true);

      // Joel no tiene carpeta: la fila se queda igual, con el nombre del
      // usuario como etiqueta y marcada como no sincronizada.
      const joel = r.asesores.find((a) => a.asesorId === 'a-joel')!;
      expect(joel.carpeta).toBe('Joel C');
      expect(joel.sincronizado).toBe(false);
      expect(joel.carpetaId).toBeNull();
      expect(joel.ultimoSync).toBeNull();
      expect(joel.importadoCompleto).toBe(false);
    });

    it('empareja la carpeta por nombre aunque el apellido venga abreviado', async () => {
      crear([], [
        sync('10.Jean M.', new Date('2026-09-23T07:33:00Z')),
        sync('1.Carlos A.', new Date('2026-09-23T07:33:00Z')),
      ]);

      const r = await servicio.resumen();

      expect(r.asesores.find((a) => a.asesorId === 'a-jean')!.carpeta).toBe('10.Jean M.');
      expect(r.asesores.find((a) => a.asesorId === 'a-carlos')!.carpeta).toBe('1.Carlos A.');
      expect(r.asesores.find((a) => a.asesorId === 'a-joel')!.sincronizado).toBe(false);
    });

    it('expone FechaActualizacion desde last_sync_at', async () => {
      crear([], [sync('10.Jean M.', new Date('2026-09-23T07:33:00Z'))]);

      const r = await servicio.resumen();

      const jean = r.asesores.find((a) => a.asesorId === 'a-jean')!;
      expect(jean.ultimoSync).toBe('2026-09-23T07:33:00.000Z');
    });

    it('elige la carpeta mas reciente si un asesor tiene varias sincronizadas', async () => {
      crear([], [
        sync('10.Jean M.', new Date('2026-01-01T00:00:00Z')),
        sync('11.Jean Munoz', new Date('2026-09-23T07:33:00Z')),
      ]);

      const r = await servicio.resumen();

      const jean = r.asesores.find((a) => a.asesorId === 'a-jean')!;
      expect(jean.carpeta).toBe('11.Jean Munoz');
      expect(jean.ultimoSync).toBe('2026-09-23T07:33:00.000Z');
    });

    it('clasifica las categorias de Outlook con su simbolo al agregar', async () => {
      crear([
        { asesorId: 'a-jean', categorias: '["-EN PROCESO"]', total: '2', noLeidos: '1', ultimo: null },
        { asesorId: 'a-jean', categorias: '["✓ RESUELTO"]', total: '5', noLeidos: '0', ultimo: null },
        { asesorId: 'a-jean', categorias: null, total: '3', noLeidos: '3', ultimo: null },
        { asesorId: 'a-jean', categorias: 'null', total: '1', noLeidos: '0', ultimo: null },
      ], [sync('10.Jean M.', null)]);

      const r = await servicio.resumen();

      const jean = r.asesores.find((a) => a.asesorId === 'a-jean')!;
      expect(jean.enProceso).toBe(2);
      expect(jean.resuelto).toBe(5);
      // null y "null" son las dos formas de sin categoria: 3 + 1.
      expect(jean.pendiente).toBe(4);
      expect(jean.total).toBe(11);
      expect(jean.abiertos).toBe(6);
      expect(jean.nivel).toBe('critico');
      expect(jean.noLeidos).toBe(4);
    });

    it('un correo con RESUELTO y EN PROCESO no suma a abiertos', async () => {
      // La precedencia se aplica sobre el conteo que devuelve el GROUP BY, no
      // sobre un mensaje suelto: aqui se comprueba el camino completo.
      crear(
        [
          { asesorId: 'a-jean', categorias: '["✓ RESUELTO","-EN PROCESO"]', total: '6', noLeidos: '0', ultimo: null },
        ],
        [sync('10.Jean M.', null)],
      );

      const r = await servicio.resumen();

      const jean = r.asesores.find((a) => a.asesorId === 'a-jean')!;
      expect(jean.resuelto).toBe(6);
      expect(jean.enProceso).toBe(0);
      expect(jean.abiertos).toBe(0);
      expect(jean.nivel).toBe('al_dia');
      expect(jean.total).toBe(6);
    });

    it('una categoria desconocida suma al total sin generar alerta', async () => {
      crear([
        { asesorId: 'a-jean', categorias: '["CASO OMISO"]', total: '4', noLeidos: '0', ultimo: null },
      ], [sync('10.Jean M.', null)]);

      const r = await servicio.resumen();

      const jean = r.asesores.find((a) => a.asesorId === 'a-jean')!;
      expect(jean.otros).toBe(4);
      expect(jean.total).toBe(4);
      expect(jean.abiertos).toBe(0);
      expect(jean.nivel).toBe('al_dia');
    });

    it('ordena por correos abiertos de mayor a menor', async () => {
      crear([
        { asesorId: 'a-jean', categorias: null, total: '1', noLeidos: '0', ultimo: null },
        { asesorId: 'a-carlos', categorias: null, total: '6', noLeidos: '0', ultimo: null },
        { asesorId: 'a-joel', categorias: null, total: '3', noLeidos: '0', ultimo: null },
      ]);

      const r = await servicio.resumen();

      expect(r.asesores.map((a) => a.abiertos)).toEqual([6, 3, 1]);
      expect(r.asesores[0].asesorId).toBe('a-carlos');
    });

    it('a igualdad de abiertos ordena por total y luego por nombre', async () => {
      crear([
        { asesorId: 'a-jean', categorias: null, total: '2', noLeidos: '0', ultimo: null },
        { asesorId: 'a-carlos', categorias: null, total: '2', noLeidos: '0', ultimo: null },
      ]);

      const r = await servicio.resumen();

      // Los tres tienen 2 abiertos; Carlos y Jean empatan en total, y entonces
      // manda el nombre para que la tabla no se reordene entre recargas.
      expect(r.asesores[0].asesorId).toBe('a-carlos');
      expect(r.asesores[1].asesorId).toBe('a-jean');
    });

    it('cuenta los asesores por nivel de SLA', async () => {
      crear([
        { asesorId: 'a-jean', categorias: null, total: '4', noLeidos: '0', ultimo: null },
        { asesorId: 'a-carlos', categorias: null, total: '3', noLeidos: '0', ultimo: null },
        { asesorId: 'a-joel', categorias: null, total: '1', noLeidos: '0', ultimo: null },
      ]);

      const r = await servicio.resumen();

      expect(r.porNivel).toEqual({ critico: 1, en_riesgo: 1, estable: 1, al_dia: 0 });
      expect(r.conAiertos).toBe(3);
    });

    it('cuenta en conAiertos solo las carpetas con al menos un abierto', async () => {
      crear([
        { asesorId: 'a-jean', categorias: null, total: '4', noLeidos: '0', ultimo: null },
        { asesorId: 'a-carlos', categorias: '["✓ RESUELTO"]', total: '9', noLeidos: '0', ultimo: null },
        { asesorId: 'a-joel', categorias: '["CASO OMISO"]', total: '9', noLeidos: '0', ultimo: null },
      ]);

      const r = await servicio.resumen();

      expect(r.conAiertos).toBe(1);
      expect(r.porNivel.al_dia).toBe(2);
    });

    it('suma los totales de todos los asesores', async () => {
      crear([
        { asesorId: 'a-jean', categorias: '["-EN PROCESO"]', total: '2', noLeidos: '0', ultimo: null },
        { asesorId: 'a-carlos', categorias: '["-EN PROCESO"]', total: '3', noLeidos: '0', ultimo: null },
        { asesorId: 'a-joel', categorias: '["✓ RESUELTO"]', total: '7', noLeidos: '0', ultimo: null },
      ]);

      const r = await servicio.resumen();

      expect(r.totales.enProceso).toBe(5);
      expect(r.totales.resuelto).toBe(7);
      expect(r.totales.total).toBe(12);
      expect(r.totales.abiertos).toBe(5);
      expect(r.totales.nivel).toBe('critico');
    });

    it('el ultimo recibido es el maximo entre los grupos del asesor', async () => {
      crear([
        {
          asesorId: 'a-jean',
          categorias: '["-EN PROCESO"]',
          total: '1',
          noLeidos: '0',
          ultimo: new Date('2026-09-20T10:00:00Z'),
        },
        {
          asesorId: 'a-jean',
          categorias: '["✓ RESUELTO"]',
          total: '1',
          noLeidos: '0',
          ultimo: new Date('2026-09-23T08:00:00Z'),
        },
        {
          asesorId: 'a-jean',
          categorias: null,
          total: '1',
          noLeidos: '0',
          ultimo: new Date('2026-09-21T10:00:00Z'),
        },
      ]);

      const r = await servicio.resumen();

      expect(r.asesores.find((a) => a.asesorId === 'a-jean')!.ultimoRecibido).toBe(
        '2026-09-23T08:00:00.000Z',
      );
    });

    it('ignora los grupos cuya fecha maxima es nula', async () => {
      crear([
        { asesorId: 'a-jean', categorias: '["✓ RESUELTO"]', total: '1', noLeidos: '0', ultimo: null },
      ]);

      const r = await servicio.resumen();

      expect(r.asesores.find((a) => a.asesorId === 'a-jean')!.ultimoRecibido).toBeNull();
    });

    it('trae buzon y carpeta padre para el encabezado', async () => {
      crear([]);
      const r = await servicio.resumen();
      expect(r.buzon).toBe('soporte@innovacloud.co');
      expect(r.carpetaPadre).toBe('ASIGNADOS');
      expect(r.generadoEn).toBeTruthy();
    });

    describe('carpetas sin asesor', () => {
      // Las carpetas huerfanas se cargan en segundo plano: la primera respuesta
      // sale antes y las siguientes ya traen el dato. Este helper deja que la
      // promesa en vuelo resuelva y pide un resumen nuevo, que ya lo incluye.
      async function resumenConCarpetas() {
        const primero = await servicio.resumen();
        await new Promise((r) => setImmediate(r));
        const segundo = await servicio.resumen();
        return { primero, segundo };
      }

      it('la primera respuesta no espera a Graph y avisa que esta calculando', async () => {
        crear(
          [],
          [sync('10.Jean M.', new Date('2026-09-23T07:33:00Z'))],
          [{ id: 'id-99.Fantasma', displayName: '99.Fantasma', totalItemCount: 40, unreadItemCount: 7 }],
        );

        const r = await servicio.resumen();

        // Lo importante: la tabla de asesores ya esta completa y sin esperas.
        expect(r.asesores).toHaveLength(3);
        expect(r.sinAsesor).toEqual([]);
        expect(r.estadoCarpetas).toBe('calculando');
      });

      it('lista las carpetas de Graph que ningun asesor reclama', async () => {
        crear(
          [],
          [sync('10.Jean M.', new Date('2026-09-23T07:33:00Z'))],
          [
            { id: 'id-10.Jean M.', displayName: '10.Jean M.', totalItemCount: 12, unreadItemCount: 1 },
            { id: 'id-99.Fantasma', displayName: '99.Fantasma', totalItemCount: 40, unreadItemCount: 7 },
          ],
        );

        const { primero, segundo } = await resumenConCarpetas();

        expect(segundo.sinAsesor).toHaveLength(1);
        expect(segundo.sinAsesor[0].carpeta).toBe('99.Fantasma');
        expect(segundo.sinAsesor[0].totalEnGraph).toBe(40);
        expect(segundo.sinAsesor[0].noLeidosEnGraph).toBe(7);
        expect(segundo.sinAsesor[0].sincronizada).toBe(false);
        expect(segundo.estadoCarpetas).toBe('al_dia');
        expect(segundo.carpetasActualizadasEn).toBeTruthy();
        // La carpeta de Jean si estaba reclamada, asi que nunca sale como huerfana.
        expect(primero.asesores.map((a) => a.carpeta)).toContain('10.Jean M.');
      });

      it('marca como sincronizada la carpeta huerfana que ya se leyo antes', async () => {
        crear(
          [],
          [sync('99.Fantasma', new Date('2026-08-01T00:00:00Z'))],
          [{ id: 'id-99.Fantasma', displayName: '99.Fantasma', totalItemCount: 40, unreadItemCount: 0 }],
        );

        const { segundo } = await resumenConCarpetas();

        expect(segundo.sinAsesor[0].sincronizada).toBe(true);
      });

      it('si Graph falla, avisa y sigue pintando la tabla', async () => {
        crear([], [sync('10.Jean M.', null)]);
        carpetas.listarCarpetasAsignadas = jest
          .fn()
          .mockRejectedValue(new Error('Insufficient privileges to complete the operation'));

        const { primero, segundo } = await resumenConCarpetas();

        expect(segundo.sinAsesor).toEqual([]);
        expect(segundo.estadoCarpetas).toBe('sin_permiso');
        expect(segundo.avisos).toHaveLength(1);
        expect(segundo.avisos[0]).toContain('Mail.Read');
        // La primera respuesta, la rapida, no puede traer el aviso todavia:
        // el error se reporta en la siguiente.
        expect(primero.avisos).toHaveLength(0);
        // La tabla de asesores sigue intacta.
        expect(segundo.asesores).toHaveLength(3);
      });

      it('no inventa carpetas con nombre vacio', async () => {
        crear([], [], [{ id: 'x', displayName: undefined, totalItemCount: 0, unreadItemCount: 0 }]);
        const { segundo } = await resumenConCarpetas();
        expect(segundo.sinAsesor[0].carpeta).toBe('(sin nombre)');
      });

      it('no vuelve a llamar a Graph mientras la cache esta vigente', async () => {
        crear([], [], [{ id: 'x', displayName: '99.Fantasma', totalItemCount: 1, unreadItemCount: 0 }]);
        const listado = carpetas.listarCarpetasAsignadas as jest.Mock;

        await resumenConCarpetas();
        await servicio.resumen();
        await servicio.resumen();

        expect(listado).toHaveBeenCalledTimes(1);
      });

      it('absorbe una rafaga de recargas con el memo del resumen', async () => {
        crear([], [sync('10.Jean M.', null)], []);

        const [a, b] = await Promise.all([servicio.resumen(), servicio.resumen()]);

        // Mismo objeto devuelto: la segunda peticion no volvio a consultar.
        expect(b).toBe(a);
      });
    });

    it('no hace una consulta por asesor: agrega todo de una vez', async () => {
      crear([
        { asesorId: 'a-jean', categorias: null, total: '1', noLeidos: '0', ultimo: null },
        { asesorId: 'a-carlos', categorias: null, total: '1', noLeidos: '0', ultimo: null },
        { asesorId: 'a-joel', categorias: null, total: '1', noLeidos: '0', ultimo: null },
      ]);

      await servicio.resumen();

      // Un solo GROUP BY, no una consulta por carpeta.
      expect(mensajeRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });
  });

  describe('mensajesDeAsesor', () => {
    beforeEach(() => {
      crear([]);
      mensajeRepo.createQueryBuilder = jest.fn(() => qbFalso({ rawOne: { total: '0' }, many: [] }));
      userRepo.findOne = jest.fn(() =>
        Promise.resolve({ id: 'a-jean', name: 'Jean Munoz', role: 'advisor', active: true }),
      );
    });

    it('rechaza a un usuario que no es asesor activo', async () => {
      userRepo.findOne = jest.fn(() =>
        Promise.resolve({ id: 'x', name: 'Alguien', role: 'admin', active: true }),
      );
      await expect(servicio.mensajesDeAsesor('x')).rejects.toThrow('Asesor no encontrado');
    });

    it('rechaza a un asesor desactivado', async () => {
      userRepo.findOne = jest.fn(() =>
        Promise.resolve({ id: 'a-jean', name: 'Jean Munoz', role: 'advisor', active: false }),
      );
      await expect(servicio.mensajesDeAsesor('a-jean')).rejects.toThrow('Asesor no encontrado');
    });

    it('devuelve el total de la carpeta aunque haya filtro, para no confundir', async () => {
      mensajeRepo.count = jest.fn(() => Promise.resolve(37));
      const r = await servicio.mensajesDeAsesor('a-jean', { cubo: 'pendiente' });

      expect(r.totalEnCarpeta).toBe(37);
      expect(r.asesor).toEqual({ id: 'a-jean', nombre: 'Jean Munoz' });
    });

    it('acota el limite a 200 y sanea el offset', async () => {
      const r = await servicio.mensajesDeAsesor('a-jean', { limite: 9999, offset: -5 });
      expect(r.limite).toBe(200);
      expect(r.offset).toBe(0);
    });

it('el filtro de en proceso excluye los cubos que lo desplazan', async () => {
      const qb = qbFalso({ rawOne: { total: '0' }, many: [] });
      mensajeRepo.createQueryBuilder = jest.fn(() => qb);
      mensajeRepo.count = jest.fn(() => Promise.resolve(0));

      await servicio.mensajesDeAsesor('a-jean', { cubo: 'en_proceso' });

      const llamado = (qb.andWhere as jest.Mock).mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('jsonb_array_elements_text'),
      );
      expect(llamado).toBeDefined();
      const [sql, params] = llamado!;
      // Exige la categoria propia...
      expect(sql).toContain('= :propia');
      // ...y descarta las de mayor precedencia: resuelto, escalado y gestionado.
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('= ANY(:superiores)');
      expect((params as any).propia).toBe('EN PROCESO');
      expect((params as any).superiores.sort()).toEqual([
        'ESCALADO',
        'GESTIONADO',
        'RESUELTO',
      ]);
    });

    it('el filtro de resuelto no excluye nada, porque es el de mayor precedencia', async () => {
      const qb = qbFalso({ rawOne: { total: '0' }, many: [] });
      mensajeRepo.createQueryBuilder = jest.fn(() => qb);

      await servicio.mensajesDeAsesor('a-jean', { cubo: 'resuelto' });

      const llamado = (qb.andWhere as jest.Mock).mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('jsonb_array_elements_text'),
      );
      expect(llamado![0]).not.toContain('NOT EXISTS');
      expect((llamado![1] as any).propia).toBe('RESUELTO');
      expect((llamado![1] as any).superiores).toEqual([]);
    });

    it('el filtro de pendiente usa las tres formas de vacio y no toca jsonb', async () => {
      const qb = qbFalso({ rawOne: { total: '0' }, many: [] });
      mensajeRepo.createQueryBuilder = jest.fn(() => qb);

      await servicio.mensajesDeAsesor('a-jean', { cubo: 'pendiente' });

      const llamado = (qb.andWhere as jest.Mock).mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('categorias IS NULL'),
      );
      expect(llamado![0]).toBe("(m.categorias IS NULL OR m.categorias IN ('[]', 'null'))");
      expect(llamado![0]).not.toContain('jsonb');
    });

    it('el filtro de otros busca una categoria que no sea ninguna conocida', async () => {
      const qb = qbFalso({ rawOne: { total: '0' }, many: [] });
      mensajeRepo.createQueryBuilder = jest.fn(() => qb);

      await servicio.mensajesDeAsesor('a-jean', { cubo: 'otros' });

      const llamado = (qb.andWhere as jest.Mock).mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('<> ALL'),
      );
      expect(llamado![0]).toContain('NOT (m.categorias IS NULL');
      expect((llamado![1] as any).conocidas.sort()).toEqual([
        'EN PROCESO',
        'ESCALADO',
        'GESTIONADO',
        'RESUELTO',
      ]);
    });

    it('normaliza el simbolo de Outlook al filtrar, para que -EN PROCESO cuente', async () => {
      const qb = qbFalso({ rawOne: { total: '0' }, many: [] });
      mensajeRepo.createQueryBuilder = jest.fn(() => qb);

      await servicio.mensajesDeAsesor('a-jean', { cubo: 'en_proceso' });

      const sql = (qb.andWhere as jest.Mock).mock.calls.find((c) =>
        String(c[0]).includes('jsonb_array_elements_text'),
      )![0] as string;
      // Sin esta normalizacion, "-EN PROCESO" no igualaria "EN PROCESO".
      expect(sql).toContain("upper(t.cat)");
      expect(sql).toContain("'^[^A-Z0-9]+'");
    });
  });

  describe('cuerpoDeAsesor', () => {
    beforeEach(() => {
      crear([]);
    });

    it('delega en CorreosService con el id del asesor, sin duplicar el sanitizado', async () => {
      userRepo.findOne = jest.fn(() => Promise.resolve({ id: 'a-jean', active: true }));
      correos.cuerpo = jest.fn(() => Promise.resolve({ html: '<p>ok</p>', truncado: false }));

      const r = await servicio.cuerpoDeAsesor('a-jean', 'm1', 'http://api');

      expect(correos.cuerpo).toHaveBeenCalledWith('m1', 'a-jean', 'http://api');
      expect(r.html).toBe('<p>ok</p>');
    });

    it('no lee el cuerpo de un asesor que ya no existe', async () => {
      userRepo.findOne = jest.fn(() => Promise.resolve(null));
      await expect(servicio.cuerpoDeAsesor('a-jean', 'm1', 'http://api')).rejects.toThrow(
        'Asesor no encontrado',
      );
      expect(correos.cuerpo).not.toHaveBeenCalled();
    });
  });
});