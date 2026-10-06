/**
 * Categorias de reuniones, con el color que Outlook les pinta.
 *
 * OJO con el nombre: en el calendario real del grupo las categorias no son
 * "REUNION PRESENCIAL" sino los nombres que crea la app de Teams/Outlook
 * ("Yellow category", "Blue category", "Purple category"...). Graph guarda
 * esos literales, asi que para que un evento nuevo salga coloreado hay que
 * enviar EXACTAMENTE uno de ellos.
 *
 * Verificado en el calendario del grupo (sep-dic 2026): 45 de 50 eventos usan
 * "Yellow category", 2 "Blue category" y 1 "Purple category". Por eso
 * `REUNION PRESENCIAL` (que es la mayoritaria) mapea a Yellow y no a otro.
 *
 * `alias` es lo que ve el usuario; `outlook` es lo que se manda a Graph.
 */
export interface CategoriaReunion {
  alias: string;
  outlook: string;
  /** Color de la UI, alineado al que usa la app de Teams. */
  color: string;
}

export const CATEGORIAS_REUNION: CategoriaReunion[] = [
  { alias: 'Reunion presencial', outlook: 'Yellow category', color: '#eab308' },
  { alias: 'Reunion virtual', outlook: 'Blue category', color: '#3b82f6' },
  { alias: 'Reunion equipo', outlook: 'Purple category', color: '#a855f7' },
  { alias: 'Cumpleanos', outlook: 'Green category', color: '#22c55e' },
];

/** Default: presencial es la categoria mayoritaria del calendario. */
export const CATEGORIA_POR_DEFECTO = CATEGORIAS_REUNION[0];

export function buscarCategoria(alias: string | null | undefined): CategoriaReunion | null {
  if (!alias) return null;
  const limpio = alias.trim().toLowerCase();
  return CATEGORIAS_REUNION.find((c) => c.alias.toLowerCase() === limpio) ?? null;
}

/**
 * Traduce la categoria de un evento existente a la nuestra, para pintar el chip
 * del mismo color que el de la lista.
 *
 * Los eventos que ya estaban en el calendario traen nombres de Outlook
 * ("Yellow category"); los nuevos traen el alias que eligio el usuario. Se
 * aceptan los dos formatos para que la grilla se pinte igual antes y despues de
 * migrar.
 */
export function categoriaDeEvento(
  categorias: string[] | null | undefined,
): CategoriaReunion | null {
  for (const c of categorias ?? []) {
    const porAlias = buscarCategoria(c);
    if (porAlias) return porAlias;
    const porOutlook = CATEGORIAS_REUNION.find(
      (x) => x.outlook.toLowerCase() === c.trim().toLowerCase(),
    );
    if (porOutlook) return porOutlook;
  }
  return null;
}