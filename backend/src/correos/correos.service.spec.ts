jest.mock('sanitize-html', () => {
  const sanitize = jest.fn(() => '');
  return {
    __esModule: true,
    default: Object.assign(sanitize, {
      defaults: { allowedTags: [] },
      simpleTransform: jest.fn(),
    }),
  };
});

import { CorreosService } from './correos.service';

function queryBuilder(raw?: Record<string, string>) {
  const builder: any = {};
  for (const method of [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'limit',
    'offset',
    'groupBy',
  ]) {
    builder[method] = jest.fn(() => builder);
  }
  builder.getMany = jest.fn().mockResolvedValue([]);
  builder.getRawOne = jest.fn().mockResolvedValue(raw ?? {});
  return builder;
}

describe('CorreosService conteos de carpeta', () => {
  it('cuenta pendientes y no leídos en toda la carpeta, aunque haya filtros', async () => {
    const listado = queryBuilder();
    const conteoFiltrado = queryBuilder({ total: '1' });
    const resumenCarpeta = queryBuilder({
      total: '12',
      noLeidos: '4',
      sinCategoria: '3',
    });
    const createQueryBuilder = jest
      .fn()
      .mockReturnValueOnce(listado)
      .mockReturnValueOnce(conteoFiltrado)
      .mockReturnValueOnce(resumenCarpeta);
    const servicio = new CorreosService(
      { createQueryBuilder } as any,
      {} as any,
      {} as any,
      {
        carpetaDelAsesor: jest.fn().mockResolvedValue({
          folderId: 'folder-1',
          parentFolderId: 'parent-1',
          displayName: '10.Asesora',
        }),
      } as any,
      {} as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
    );

    jest.spyOn(servicio as any, 'contarAdjuntos').mockResolvedValue(new Map());
    jest.spyOn(servicio as any, 'categoriasDeCarpeta').mockResolvedValue([
      { categoria: 'Categoria A', total: 9 },
      { categoria: 'Categoria B', total: 8 },
    ]);

    const bandeja = await servicio.listar('asesor-1', 'Asesora', {
      soloNoLeidos: true,
      buscar: 'correo',
      categoria: 'Categoria A',
      desde: '2026-10-01',
    });

    expect(bandeja.total).toBe(1);
    expect(bandeja.totalCarpeta).toBe(12);
    expect(bandeja.noLeidosTotal).toBe(4);
    expect(bandeja.sinCategoriaTotal).toBe(3);
    expect(listado.andWhere).toHaveBeenCalled();
    expect(conteoFiltrado.andWhere).toHaveBeenCalled();
    expect(resumenCarpeta.andWhere).not.toHaveBeenCalled();
    expect(resumenCarpeta.addSelect).toHaveBeenCalledWith(
      expect.stringContaining('m.categorias'),
      'sinCategoria',
    );
  });
});
