/**
 * Helpers puros del importador de Perfil Institucional.
 *
 * Regla de oro: la posición de la columna NO importa. Todo se asigna por el
 * nombre del encabezado; lo único obligatorio es la columna "Nombre".
 * (Si la lógica cambia aquí, cambia también el spec importar-helpers.util.spec.ts.)
 */

export type ColumnaBase =
  | 'nombre'
  | 'email'
  | 'link'
  | 'calendario'
  | 'ciudad'
  | 'tipo'
  | 'asesor'
  | 'activo';

export const COLUMNAS_BASE: ColumnaBase[] = [
  'nombre',
  'email',
  'link',
  'calendario',
  'ciudad',
  'tipo',
  'asesor',
  'activo',
];

/** Alias aceptados por columna base, ya normalizados. */
export const BASE_ALIAS: Record<ColumnaBase, string[]> = {
  nombre: ['nombre', 'name', 'colegio', 'institucion', 'nombre colegio', 'nombre institucion', 'colegio/institucion'],
  email: ['email', 'e-mail', 'emails', 'correo', 'correos', 'correo electronico', 'correos electronicos', 'mail', 'mails', 'correo institucional', 'email institucional', 'correos institucionales'],
  link: ['link', 'links', 'url', 'urls', 'sitio web', 'pagina web', 'web', 'enlace', 'enlaces'],
  calendario: ['calendario', 'calendario academico', 'turno'],
  ciudad: ['ciudad', 'ubicacion', 'ciudad/ubicacion'],
  tipo: ['tipo', 'tipo colegio', 'tipo de colegio', 'tipocolegio', 'proyecto', 'sistema'],
  asesor: ['asesor', 'asesor principal', 'advisor', 'responsable', 'asesor/a'],
  activo: ['activo', 'estado', 'status', 'habilitado', 'vigente'],
};

export interface CampoRef {
  id: string;
  nombre: string;
  categoria: string | null;
}

export type ColumnaEstado = 'mapeada' | 'ignorada' | 'ausente';

export interface ColumnaReporte {
  /** Encabezado tal cual aparece en el archivo. */
  origen: string;
  /** A qué se asignó: "Email", "Contacto > Correo", o "—" si se ignora. */
  destino: string;
  estado: ColumnaEstado;
  detalle?: string;
}

export interface ColumnaDinamica {
  campoId: string;
  campoNombre: string;
  col: number;
  header: string;
}

export interface MapeoColumnas {
  base: Map<ColumnaBase, number>;
  dinamicos: ColumnaDinamica[];
  columnas: ColumnaReporte[];
}

/** Minúsculas + sin acentos + espacios colapsados. */
export function normalizarEncabezado(txt: string): string {
  return String(txt ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clave de comparación de nombres de institución (existe o duplicado en archivo). */
export function claveNombre(nombre: string): string {
  return normalizarEncabezado(nombre).replace(/\s*([.,;:])\s*/g, '$1');
}

export function esEmailValido(valor: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor);
}

export interface ParseCorreos {
  validos: string[];
  invalidos: string[];
}

/**
 * La app guarda varios correos con formato canónico "uno@x.com|dos@y.com".
 * Aquí se acepta la celda separada por | , ; o espacios y se valida cada una.
 */
export function parseCorreos(celda: string | null | undefined): ParseCorreos {
  const partes = String(celda ?? '')
    .split(/[,;|\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const validos: string[] = [];
  const invalidos: string[] = [];
  const vistos = new Set<string>();
  for (const p of partes) {
    const k = p.toLowerCase();
    if (vistos.has(k)) continue;
    vistos.add(k);
    if (esEmailValido(p)) validos.push(p);
    else invalidos.push(p);
  }
  return { validos, invalidos };
}

/** Devuelve el valor canónico a guardar (null = nada válido). */
export function construirCorreos(celda: string | null | undefined): {
  valor: string | null;
  invalidos: string[];
} {
  const { validos, invalidos } = parseCorreos(celda);
  return { valor: validos.length ? validos.join('|') : null, invalidos };
}

/** Canoniza un correo ya guardado para compararlo sin falsos positivos. */
export function canonizarCorreosGuardados(valor: string | null | undefined): string {
  const { validos } = parseCorreos(valor);
  return validos.join('|');
}

function partirHeader(headerNorm: string): [string, string] | null {
  const conFlecha = headerNorm.replace(/->/g, '→');
  for (const sep of ['→', ' > ', '|', ':', ' - ']) {
    const i = conFlecha.indexOf(sep);
    if (i > 0 && i < conFlecha.length - sep.length) {
      const izq = conFlecha.slice(0, i).trim();
      const der = conFlecha.slice(i + sep.length).trim();
      if (izq && der) return [izq, der];
    }
  }
  return null;
}

function destinoCampo(c: CampoRef): string {
  return c.categoria ? `${c.categoria} > ${c.nombre}` : c.nombre;
}

function resolverDinamico(
  headerNorm: string,
  headerCrudo: string,
  campos: CampoRef[],
): { campo: CampoRef; detalle?: string } | null {
  const parte = partirHeader(headerNorm);

  // 1) "Categoria > Campo" (o variantes "Categoria: Campo", "Categoria | Campo")
  if (parte) {
    const [catNorm, campoNorm] = parte;
    const porNombre = campos.filter((c) => normalizarEncabezado(c.nombre) === campoNorm);
    if (porNombre.length === 1) {
      const c = porNombre[0];
      const catOk = !c.categoria || normalizarEncabezado(c.categoria) === catNorm;
      return {
        campo: c,
        detalle: catOk ? undefined : `La categoría del encabezado ("${catNorm}") no coincide con la del campo; se asignó por nombre.`,
      };
    }
    if (porNombre.length > 1) {
      const conCat = porNombre.filter(
        (c) => c.categoria && normalizarEncabezado(c.categoria) === catNorm,
      );
      if (conCat.length === 1) return { campo: conCat[0] };
      return null; // ambiguo
    }
    return null;
  }

  // 2) El encabezado completo coincide con un nombre de campo único
  const porNombre = campos.filter((c) => normalizarEncabezado(c.nombre) === headerNorm);
  if (porNombre.length === 1) return { campo: porNombre[0] };
  if (porNombre.length > 1) {
    const sinCat = porNombre.filter((c) => !c.categoria);
    if (sinCat.length === 1) return { campo: sinCat[0] };
    return null; // ambiguo entre campos homónimos
  }
  void headerCrudo;
  return null;
}

/**
 * Asigna cada encabezado del archivo a su destino, sin importar la posición.
 * Orden de precedencia: "Cat > Campo" (con separador) → alias de columna base
 * → nombre único de campo dinámico → ignorada (y se reporta).
 */
export function mapearColumnas(
  encabezados: { col: number; texto: string }[],
  campos: CampoRef[],
  opts: { incluirAusentes?: boolean; ausentes?: CampoRef[] } = {},
): MapeoColumnas {
  const { incluirAusentes = true } = opts;
  const camposAusentes = opts.ausentes ?? campos;
  const base = new Map<ColumnaBase, number>();
  const baseOrigen = new Map<ColumnaBase, string>();
  const usados = new Set<string>();
  const dinamicos: ColumnaDinamica[] = [];
  const columnas: ColumnaReporte[] = [];

  const aliasABase = new Map<string, ColumnaBase>();
  for (const col of COLUMNAS_BASE) {
    for (const alias of BASE_ALIAS[col]) {
      if (!aliasABase.has(alias)) aliasABase.set(alias, col);
    }
  }

  for (const enc of encabezados) {
    const texto = enc.texto;
    const norm = normalizarEncabezado(texto);
    if (!norm) continue;

    // a) Dinámico con separador ("Contacto > Email")
    const conSeparador = partirHeader(norm) != null;
    if (conSeparador) {
      const hit = resolverDinamico(norm, texto, campos);
      if (hit && !usados.has(hit.campo.id)) {
        usados.add(hit.campo.id);
        dinamicos.push({
          campoId: hit.campo.id,
          campoNombre: hit.campo.nombre,
          col: enc.col,
          header: texto,
        });
        columnas.push({
          origen: texto,
          destino: destinoCampo(hit.campo),
          estado: 'mapeada',
          detalle: hit.detalle,
        });
        continue;
      }
      if (!hit) {
        columnas.push({
          origen: texto,
          destino: '—',
          estado: 'ignorada',
          detalle: 'No coincide con ningún campo dinámico (Categoría > Campo).',
        });
        continue;
      }
    }

    // b) Columna base por alias
    const colBase = aliasABase.get(norm);
    if (colBase && COLUMNAS_BASE.includes(colBase)) {
      if (base.has(colBase)) {
        columnas.push({
          origen: texto,
          destino: '—',
          estado: 'ignorada',
          detalle: `Columna base duplicada: "${baseOrigen.get(colBase)}" ya mapeó "${colBase}".`,
        });
        continue;
      }
      base.set(colBase, enc.col);
      baseOrigen.set(colBase, texto);
      columnas.push({ origen: texto, destino: etiquetaBase(colBase), estado: 'mapeada' });
      continue;
    }

    // c) Campo dinámico por nombre único
    const hit = resolverDinamico(norm, texto, campos);
    if (hit && !usados.has(hit.campo.id)) {
      usados.add(hit.campo.id);
      dinamicos.push({
        campoId: hit.campo.id,
        campoNombre: hit.campo.nombre,
        col: enc.col,
        header: texto,
      });
      columnas.push({
        origen: texto,
        destino: destinoCampo(hit.campo),
        estado: 'mapeada',
        detalle: hit.detalle,
      });
      continue;
    }

    // d) Sin coincidencia → se reporta, nunca se ignora en silencio
    columnas.push({
      origen: texto,
      destino: '—',
      estado: 'ignorada',
      detalle: hit
        ? 'El nombre del campo es ambiguo entre varias categorías.'
        : 'No coincide con ninguna columna base ni con un campo dinámico.',
    });
  }

  if (incluirAusentes) {
    const mapeados = new Set(usados);
    for (const c of camposAusentes) {
      if (mapeados.has(c.id)) continue;
      columnas.push({
        origen: '—',
        destino: destinoCampo(c),
        estado: 'ausente',
        detalle: 'Sin columna en el archivo; el valor actual se conserva.',
      });
    }
  }

  return { base, dinamicos, columnas };
}

function etiquetaBase(col: ColumnaBase): string {
  switch (col) {
    case 'nombre':
      return 'Nombre';
    case 'email':
      return 'Email';
    case 'link':
      return 'Link';
    case 'calendario':
      return 'Calendario';
    case 'ciudad':
      return 'Ciudad';
    case 'tipo':
      return 'Tipo';
    case 'asesor':
      return 'Asesor';
    case 'activo':
      return 'Activo';
  }
}
