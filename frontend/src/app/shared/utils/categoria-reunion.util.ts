/**
 * Categorias de reuniones y su presentacion en el calendario de la app.
 *
 * OJO con el nombre: en el calendario real del grupo las categorias no son
 * "REUNION PRESENCIAL" sino los nombres que crea la app de Teams/Outlook
 * ("Yellow category", "Blue category", "Purple category"...). Graph guarda
 * esos literales, asi que para que un evento nuevo conserve su categoria hay
 * que enviar EXACTAMENTE uno de ellos. `color` es independiente y controla el
 * color que se muestra en la interfaz.
 *
 * `alias` es lo que ve el usuario; `outlook` es lo que se manda a Graph.
 */
export interface CategoriaReunion {
  alias: string;
  outlook: string;
  /** Color visual del calendario en la app. */
  color: string;
}

export const CATEGORIAS_REUNION: CategoriaReunion[] = [
  { alias: 'Reunion presencial', outlook: 'Yellow category', color: '#3b82f6' },
  { alias: 'Reunion virtual', outlook: 'Blue category', color: '#f97316' },
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
