/**
 * Clasificacion de un correo en un cubo unico para el dashboard del admin.
 *
 * Es la contraparte en backend de
 * `frontend/src/app/shared/utils/categoria-correo.util.ts`. La normalizacion
 * esta duplicada a proposito: los dos paquetes no comparten codigo y, si el
 * dashboard normalizara distinto que la bandeja, el admin veria un numero que
 * no corresponde a lo que el asesor ve en sus filtros. Si se cambia una, se
 * cambia la otra.
 */

/** Simbolos con los que Outlook decora las categorias. */
const SIMBOLOS_INICIALES = /^[\s\-=+*_•·✓✔✔☑✅❗❗!|#>»›.:;,\u2022\u2713\u2714\u2717]+/u;

/**
 * Quita el simbolo y los espacios, y pasa a mayusculas: "✓ RESUELTO" ->
 * "RESUELTO", "-EN PROCESO" -> "EN PROCESO", "- ESCALADO" -> "ESCALADO".
 * Colapsa tambien los espacios dobles, porque Outlook los guarda tal cual.
 */
export function normalizarCategoria(categoria: string | null | undefined): string {
  const texto = (categoria ?? '').trim();
  if (!texto) return '';
  return texto
    .replace(SIMBOLOS_INICIALES, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** Normaliza una lista, quita vacios y evita repetir variantes decoradas. */
export function normalizarCategorias(categorias: string[] | null | undefined): string[] {
  const vistas = new Set<string>();
  for (const c of categorias ?? []) {
    const n = normalizarCategoria(c);
    if (n) vistas.add(n);
  }
  return [...vistas];
}

/**
 * Convierte el texto de la columna `simple-json` en arreglo. La columna guarda
 * `null` como el texto "null" y el vacio como "[]"; ambos son "sin categoria".
 */
export function parsearCategorias(valor: string | null | undefined): string[] {
  if (!valor) return [];
  try {
    const lista: unknown = JSON.parse(valor);
    return Array.isArray(lista) ? lista.filter((c): c is string => typeof c === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Los seis cubos de la tabla del admin. Un correo cae en UNO solo, nunca en
 * varios: los cubos son excluyentes para que las columnas sumen el Total sin
 * contarse dos veces.
 */
export type CuboCorreo = 'pendiente' | 'en_proceso' | 'gestionado' | 'escalado' | 'resuelto' | 'otros';

/** Categoria de Outlook -> cubo. Lo que no este aqui cae en "otros". */
const CUBO_POR_CATEGORIA: Record<string, CuboCorreo> = {
  RESUELTO: 'resuelto',
  ESCALADO: 'escalado',
  GESTIONADO: 'gestionado',
  'EN PROCESO': 'en_proceso',
};

/**
 * Categorias conocidas, ya normalizadas. El detalle del admin filtra por cubo en
 * SQL, y para excluir "otros" necesita esta lista; se exporta para que el filtro
 * no tenga que reescribirla y se quede desincronizada.
 */
export const CATEGORIAS_CONOCIDAS: string[] = Object.keys(CUBO_POR_CATEGORIA);

/**
 * Orden de resolucion. Gana el primero que aparezca en la lista del correo.
 *
 * `RESUELTO` va primero a proposito. En la practica un asesor marca "EN
 * PROCESO" y luego "RESUELTO" sin quitar la etiqueta vieja, asi que el correo
 * llega con las dos categorias; si sumara en ambos cubos seguiria contando como
 * trabajo abierto y la alerta del SLA no bajaria al resolverlo, que es
 * justo lo contrario de lo que se pide.
 */
const PRECEDENCIA: CuboCorreo[] = ['resuelto', 'escalado', 'gestionado', 'en_proceso', 'otros'];

/** Los mismos cubos en orden, exportado para armar el filtro por cubo en SQL. */
export const PRECEDENCIA_CUBOS = [...PRECEDENCIA];

/**
 * Nombre de categoria normalizada que identifica cada cubo. `pendiente` y
 * `otros` no aparecen porque no se distinguen por una categoria concreta.
 */
export const CATEGORIA_POR_CUBO: Partial<Record<CuboCorreo, string>> = {
  resuelto: 'RESUELTO',
  escalado: 'ESCALADO',
  gestionado: 'GESTIONADO',
  en_proceso: 'EN PROCESO',
};

/**
 * Cubo de un mensaje a partir de sus categorias.
 *
 * Sin ninguna categoria el correo esta "pendiente": es el estado por defecto de
 * lo que entra al buzon y todavia nadie ha clasificado.
 */
export function clasificarMensaje(categorias: string[] | null | undefined): CuboCorreo {
  const normalizadas = normalizarCategorias(categorias);
  if (!normalizadas.length) return 'pendiente';
  const presentes = new Set(normalizadas.map((c) => CUBO_POR_CATEGORIA[c] ?? 'otros'));
  return PRECEDENCIA.find((cubo) => presentes.has(cubo)) ?? 'otros';
}

/** Cuantos correos sin resolver arrastra un asesor. Base del nivel de SLA. */
export type NivelSla = 'al_dia' | 'estable' | 'en_riesgo' | 'critico';

/** Desde 4 correos abiertos el SLA ya se considera critico. */
export const UMBRAL_CRITICO = 4;
/** Con 3 correos abiertos ya esta en riesgo. */
export const UMBRAL_EN_RIESGO = 3;

/**
 * Nivel de SLA a partir de los correos abiertos.
 *
 * Solo cuentan pendiente, en proceso y escalado: lo resuelto no genera alerta,
 * que es el criterio pedido.
 */
export function nivelSla(abiertos: number): NivelSla {
  if (abiertos >= UMBRAL_CRITICO) return 'critico';
  if (abiertos >= UMBRAL_EN_RIESGO) return 'en_riesgo';
  if (abiertos >= 1) return 'estable';
  return 'al_dia';
}

/** Si un cubo suma para el nivel de SLA. */
export function cuentaParaSla(cubo: CuboCorreo): boolean {
  return cubo === 'pendiente' || cubo === 'en_proceso' || cubo === 'escalado';
}

/** Etiqueta legible de cada cubo, para las columnas de la tabla. */
export const ETIQUETA_CUBO: Record<CuboCorreo, string> = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  gestionado: 'Gestionado',
  escalado: 'Escalado',
  resuelto: 'Resuelto',
  otros: 'Otros',
};

/** Una tabla de ceros, para partir de ahi y ir sumando. */
export type ConteoCubos = Record<CuboCorreo, number>;

export function conteoVacio(): ConteoCubos {
  return { pendiente: 0, en_proceso: 0, gestionado: 0, escalado: 0, resuelto: 0, otros: 0 };
}

/**
 * Suma un correo a su cubo.
 *
 * `cantidad` existe porque el dashboard no recorre mensaje a mensaje: agrega en
 * SQL por `(asesor, categorias)` y recibe un conteo, no un mensaje.
 *
 * El conteo vive en espacio de cubos (`en_proceso`) y el DTO que ve el frontend
 * en camelCase (`enProceso`). Son dos vocabularios distintos a proposito: contar
 * en los cubos no puede equivocarse de nombre, y la conversion ocurre una sola
 * vez, en `filaDesdeConteo`.
 */
export function acumular(
  conteo: ConteoCubos,
  categorias: string[] | null | undefined,
  cantidad = 1,
): ConteoCubos {
  conteo[clasificarMensaje(categorias)] += cantidad;
  return conteo;
}

/** Suma de los seis cubos. Como son excluyentes, es el numero de correos. */
export function totalCubos(conteo: ConteoCubos): number {
  return (Object.keys(conteo) as CuboCorreo[]).reduce((suma, c) => suma + conteo[c], 0);
}

/** Correos sin resolver: los que cuentan para el nivel de SLA. */
export function abiertosCubos(conteo: ConteoCubos): number {
  return (Object.keys(conteo) as CuboCorreo[])
    .filter(cuentaParaSla)
    .reduce((suma, c) => suma + conteo[c], 0);
}

/** Un registro de la tabla del admin, ya agregado. */
export interface FilaSla {
  pendiente: number;
  enProceso: number;
  gestionado: number;
  escalado: number;
  resuelto: number;
  otros: number;
  total: number;
  abiertos: number;
  nivel: NivelSla;
}

/**
 * Une el conteo con el nivel de SLA. Es el unico punto donde los dos
 * vocabularios se cruzan.
 */
export function filaDesdeConteo(conteo: ConteoCubos): FilaSla {
  const abiertos = abiertosCubos(conteo);
  return {
    pendiente: conteo.pendiente,
    enProceso: conteo.en_proceso,
    gestionado: conteo.gestionado,
    escalado: conteo.escalado,
    resuelto: conteo.resuelto,
    otros: conteo.otros,
    total: totalCubos(conteo),
    abiertos,
    nivel: nivelSla(abiertos),
  };
}