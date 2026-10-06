/**
 * Categorias del buzon de correo.
 *
 * En Outlook las categorias llevan un simbolo delante para que se distinguan de
 * un vistazo en la lista de la propia aplicacion de Microsoft ("✓ RESUELTO",
 * "-EN PROCESO", "- ESCALADO"). Ese simbolo es decorativo y molesta cuando el
 * correo se lee dentro de esta app, asi que aqui se quita y solo se muestra el
 * texto. OJO: esto es solo presentacion; los filtros siguen comparando contra el
 * valor CRUDO de Outlook, porque el backend hace coincidencia exacta sobre el
 * `jsonb` de la columna y mandarle "RESUELTO" no encontraria "✓ RESUELTO".
 */

/** Simbolos con los que Outlook decora las categorias. */
const SIMBOLOS_INICIALES = /^[\s\-=+*_•·✓✔✔☑✅❗❗!|#>»›.:;,\u2022\u2713\u2714\u2717]+/u;

/**
 * Colores de cada categoria.
 */
export const COLORES_CATEGORIA: Record<string, string> = {
  ESCALADO: '#d696c0',
  GESTIONADO: '#a6e9ed',
  RESUELTO: '#9ad29a',
  'CASO OMISO': '#c4c4c4',
  'EN PROCESO': '#caada3',
};

/** Color para una categoria que no este en la lista. */
export const COLOR_CATEGORIA_POR_DEFECTO = '#cbd5e1';

/**
 * Quita el simbolo y los espacios de una categoria de Outlook y la deja en
 * mayusculas: "✓ RESUELTO" -> "RESUELTO", "-EN PROCESO" -> "EN PROCESO",
 * "- ESCALADO" -> "ESCALADO".
 *
 * No toca el valor que se envia al backend: eso es otra cosa.
 */
export function normalizarCategoria(categoria: string | null | undefined): string {
  const texto = (categoria ?? '').trim();
  if (!texto) return '';
  return texto
    .replace(SIMBOLOS_INICIALES, '')
    .trim()
    // Outlook admite espacios dobles al escribir la categoria y se guardan
    // tal cual; sin colapsarlos "EN  PROCESO" y "EN PROCESO" se verian
    // distintas en pantalla.
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Color de fondo de una categoria. Acepta el valor crudo o ya normalizado, para
 * que se pueda llamar sin importar de donde salga la cadena.
 */
export function colorCategoria(categoria: string | null | undefined): string {
  const normalizada = normalizarCategoria(categoria);
  if (!normalizada) return COLOR_CATEGORIA_POR_DEFECTO;
  return COLORES_CATEGORIA[normalizada] ?? COLOR_CATEGORIA_POR_DEFECTO;
}

/**
 * Texto de una categoria ya normalizado y coloreado, listo para pintar.
 *
 * Devuelve null para las categorias sin color conocido, para que quien lo use
 * pueda dejar la hoja de estilos por defecto en lugar de forzar un gris.
 */
export function estiloCategoria(categoria: string | null | undefined): {
  texto: string;
  fondo: string | null;
} {
  const texto = normalizarCategoria(categoria);
  const fondo = COLORES_CATEGORIA[texto];
  return { texto, fondo: fondo ?? null };
}

/**
 * Normaliza una lista de categorias de un mensaje, quita vacios y evita
 * repetir la misma categoria cuando en Outlook hay variantes decoradas distintas.
 */
export function normalizarCategorias(categorias: string[] | null | undefined): string[] {
  const vistas = new Set<string>();
  for (const c of categorias ?? []) {
    const n = normalizarCategoria(c);
    if (n) vistas.add(n);
  }
  return [...vistas];
}