import {
  BASE_ALIAS,
  claveNombre,
  construirCorreos,
  esEmailValido,
  mapearColumnas,
  normalizarEncabezado,
  parseCorreos,
} from './importar-helpers.util';

const CAMPOS = [
  { id: 'c1', nombre: 'Jornada', categoria: 'Académico' },
  { id: 'c2', nombre: 'Correo del rector', categoria: 'Contacto' },
  { id: 'c3', nombre: 'Sede principal', categoria: null },
  { id: 'c4', nombre: 'Jornada', categoria: 'Deportes' }, // homónimo con c1
];

describe('importar-helpers.util (importación de Perfil Institucional)', () => {
  describe('normalizarEncabezado', () => {
    it('quita acentos, baja a minúsculas y colapsa espacios', () => {
      expect(normalizarEncabezado('  Correo Electrónico ')).toBe('correo electronico');
      expect(normalizarEncabezado('TIPO   DE Colegio')).toBe('tipo de colegio');
    });

    it('tolera null/undefined sin explotar', () => {
      expect(normalizarEncabezado(null as any)).toBe('');
      expect(normalizarEncabezado(undefined as any)).toBe('');
    });
  });

  describe('claveNombre (existencia y duplicados)', () => {
    it('empata mayúsculas y acentos para no crear duplicados', () => {
      expect(claveNombre('San Martín')).toBe(claveNombre('SAN MARTIN'));
      expect(claveNombre('San  Marcos')).toBe(claveNombre('san marcos'));
      expect(claveNombre(' San Marcos ')).toBe(claveNombre('san marcos'));
    });

    it('no confunde instituciones distintas', () => {
      expect(claveNombre('San Marcos')).not.toBe(claveNombre('La Salle'));
    });
  });

  describe('parseCorreos / construirCorreos', () => {
    it('acepta el formato canónico de la app con pipe', () => {
      const r = parseCorreos('uno@x.com|dos@y.com');
      expect(r.validos).toEqual(['uno@x.com', 'dos@y.com']);
      expect(r.invalidos).toEqual([]);
    });

    it('acepta coma, punto y coma y espacios como separadores', () => {
      expect(parseCorreos('a@x.com, b@y.com;  c@z.com  d@w.com').validos).toHaveLength(4);
    });

    it('separa válidos de inválidos y deduplica', () => {
      const r = parseCorreos('bueno@x.com|malo@@y.com|BUENO@x.com');
      expect(r.validos).toEqual(['bueno@x.com']);
      expect(r.invalidos).toEqual(['malo@@y.com']);
    });

    it('construye el valor canónico o null si nada es válido', () => {
      expect(construirCorreos('a@x.com | no-es-correo').valor).toBe('a@x.com');
      expect(construirCorreos('no-es-correo').valor).toBeNull();
      expect(construirCorreos('').valor).toBeNull();
    });

    it('valida el formato básico de correo', () => {
      expect(esEmailValido('rector@colegio.edu.co')).toBe(true);
      expect(esEmailValido('rector@colegio')).toBe(false);
      expect(esEmailValido('dos@@x.com')).toBe(false);
    });
  });

  describe('mapearColumnas', () => {
    const enc = (col: number, texto: string) => ({ col, texto });

    it('asigna por nombre sin importar la posición', () => {
      const m = mapearColumnas(
        [enc(1, 'Ciudad'), enc(2, 'NOMBRE'), enc(3, 'Correo Electrónico'), enc(4, 'Activo')],
        CAMPOS,
        { incluirAusentes: false },
      );
      expect(m.base.get('nombre')).toBe(2);
      expect(m.base.get('email')).toBe(3);
      expect(m.base.get('ciudad')).toBe(1);
      expect(m.base.get('activo')).toBe(4);
      expect(m.base.has('link')).toBe(false);
    });

    it('exige la columna Nombre', () => {
      const m = mapearColumnas([enc(1, 'Email')], CAMPOS, { incluirAusentes: false });
      expect(m.base.has('nombre')).toBe(false);
      expect(m.base.get('email')).toBe(1);
    });

    it('cubre alias comunes de email/link/asesor', () => {
      const m = mapearColumnas(
        [enc(1, 'Nombre'), enc(2, 'E-mail'), enc(3, 'Sitio Web'), enc(4, 'Asesor principal')],
        CAMPOS,
        { incluirAusentes: false },
      );
      expect(m.base.get('email')).toBe(2);
      expect(m.base.get('link')).toBe(3);
      expect(m.base.get('asesor')).toBe(4);
    });

    it('resuelve campos dinámicos con "Categoria > Campo" sin importar posición', () => {
      const m = mapearColumnas(
        [enc(1, 'Nombre'), enc(2, 'Académico > Jornada'), enc(3, 'Contacto > Correo del rector')],
        CAMPOS,
        { incluirAusentes: false },
      );
      expect(m.dinamicos).toHaveLength(2);
      expect(m.dinamicos[0].campoId).toBe('c1');
      expect(m.dinamicos[1].campoId).toBe('c2');
      expect(m.columnas.filter((c) => c.estado === 'mapeada')).toHaveLength(3);
    });

    it('acepta variantes de separador (dos puntos, pipe, ->)', () => {
      const m = mapearColumnas(
        [
          enc(1, 'Nombre'),
          enc(2, 'Académico: Jornada'),
          enc(3, 'Contacto | Correo del rector'),
          enc(4, 'Deportes -> Jornada'),
        ],
        CAMPOS,
        { incluirAusentes: false },
      );
      expect(m.dinamicos).toHaveLength(3);
      expect(m.dinamicos[0].campoId).toBe('c1');
      expect(m.dinamicos[1].campoId).toBe('c2');
      expect(m.dinamicos[2].campoId).toBe('c4');
      expect(m.columnas.filter((c) => c.estado === 'mapeada')).toHaveLength(4);
    });

    it('descarta el homónimo repetido (un campo solo se mapea una vez)', () => {
      const m = mapearColumnas(
        [
          enc(1, 'Nombre'),
          enc(2, 'Académico: Jornada'),
          enc(3, 'Académico | Jornada'), // homónimo: ya mapeó c1
        ],
        CAMPOS,
        { incluirAusentes: false },
      );
      expect(m.dinamicos).toHaveLength(1);
      expect(m.dinamicos[0].campoId).toBe('c1');
      expect(m.columnas[2].estado).toBe('ignorada');
    });

    it('resuelve campo homónimo por la categoría del encabezado', () => {
      const m = mapearColumnas(
        [enc(1, 'Nombre'), enc(2, 'Deportes > Jornada')],
        CAMPOS,
        { incluirAusentes: false },
      );
      expect(m.dinamicos[0].campoId).toBe('c4');
    });

    it('resuelve campo dinámico por nombre único aunque no traiga categoría', () => {
      const m = mapearColumnas(
        [enc(1, 'Nombre'), enc(2, 'Sede principal')],
        CAMPOS,
        { incluirAusentes: false },
      );
      expect(m.dinamicos[0].campoId).toBe('c3');
    });

    it('reporta columnas desconocidas en vez de ignorarlas en silencio', () => {
      const m = mapearColumnas(
        [enc(1, 'Nombre'), enc(2, 'Esta Columna No Existe')],
        CAMPOS,
        { incluirAusentes: false },
      );
      const ignorada = m.columnas.find((c) => c.origen === 'Esta Columna No Existe');
      expect(ignorada?.estado).toBe('ignorada');
      expect(ignorada?.detalle).toBeTruthy();
    });

    it('reporta la segunda columna base repetida como ignorada', () => {
      const m = mapearColumnas(
        [enc(1, 'Nombre'), enc(2, 'Email'), enc(3, 'Correo')],
        CAMPOS,
        { incluirAusentes: false },
      );
      expect(m.base.get('email')).toBe(2);
      expect(m.columnas.find((c) => c.origen === 'Correo')?.estado).toBe('ignorada');
    });

    it('lista los campos activos sin columna como "ausente"', () => {
      const m = mapearColumnas([enc(1, 'Nombre')], CAMPOS);
      const ausentes = m.columnas.filter((c) => c.estado === 'ausente');
      expect(ausentes).toHaveLength(CAMPOS.length);
      expect(ausentes[0].origen).toBe('—');
    });

    it('un encabezado con separador que no resuelve no cae en columna base', () => {
      const m = mapearColumnas(
        [enc(1, 'Nombre'), enc(2, 'Categoría Inventada > Campo Inventado')],
        CAMPOS,
        { incluirAusentes: false },
      );
      expect(m.columnas.find((c) => c.origen.includes('Inventada'))?.estado).toBe('ignorada');
      expect(m.base.has('email')).toBe(false);
    });
  });

  describe('BASE_ALIAS', () => {
    it('cada alias está normalizado y no se solapa entre columnas', () => {
      const visto = new Map<string, string>();
      for (const [col, aliases] of Object.entries(BASE_ALIAS)) {
        for (const a of aliases) {
          expect(normalizarEncabezado(a)).toBe(a);
          expect(visto.has(a)).toBe(false);
          visto.set(a, col);
        }
      }
    });
  });
});
