/**
 * Categorias de reuniones y su presentacion en el calendario de la app.
 *
 * Cada tipo manda DOS nombres a Graph:
 *  - `alias`: lo que elige el usuario ("Reunion presencial"...). La app lo
 *    resuelve primero para pintar el chip con `color`.
 *  - `outlook`: nombre literal de la categoria de Outlook cuyo color por
 *    defecto coincide con `color`, para que Teams/Outlook pinten el evento
 *    igual que la app (presencial=azul, virtual=naranja).
 *
 * `outlookLegado` guarda el nombre que usaban los eventos antiguos
 * (presencial era "Yellow category" y virtual "Blue category"): solo lectura,
 * para que el historial siga mostrando el mismo color de siempre.
 */
export interface CategoriaReunion {
  alias: string;
  outlook: string;
  /** Nombre de Outlook que traian los eventos creados antes del cambio. */
  outlookLegado: string;
  /** Color visual del calendario en la app. */
  color: string;
}

export const CATEGORIAS_REUNION: CategoriaReunion[] = [
  { alias: 'Reunion presencial', outlook: 'Blue category', outlookLegado: 'Yellow category', color: '#3b82f6' },
  { alias: 'Reunion virtual', outlook: 'Orange category', outlookLegado: 'Blue category', color: '#f97316' },
  { alias: 'Reunion equipo', outlook: 'Purple category', outlookLegado: 'Purple category', color: '#a855f7' },
  { alias: 'Cumpleanos', outlook: 'Green category', outlookLegado: 'Green category', color: '#22c55e' },
];

/** Default: presencial es la categoria mayoritaria del calendario. */
export const CATEGORIA_POR_DEFECTO = CATEGORIAS_REUNION[0];

export function buscarCategoria(alias: string | null | undefined): CategoriaReunion | null {
  if (!alias) return null;
  const limpio = alias.trim().toLowerCase();
  return CATEGORIAS_REUNION.find((c) => c.alias.toLowerCase() === limpio) ?? null;
}

/**
 * Traduce la categoria de un evento a la nuestra, para pintar el chip del
 * mismo color que el de la lista.
 *
 * Orden: primero el alias (los eventos creados por la app lo traen), luego el
 * nombre de Outlook viejo y por ultimo el actual, para que un evento antiguo
 * ("Yellow category") y uno nuevo ("Blue category") no se confundan.
 */
export function categoriaDeEvento(
  categorias: string[] | null | undefined,
): CategoriaReunion | null {
  const lista = (categorias ?? [])
    .map((c) => String(c ?? '').trim())
    .filter((c) => c.length > 0);

  for (const c of lista) {
    const porAlias = buscarCategoria(c);
    if (porAlias) return porAlias;
  }

  const normalizar = (valor: string) => valor.toLowerCase();
  for (const c of lista) {
    const porLegado = CATEGORIAS_REUNION.find(
      (x) => normalizar(x.outlookLegado) === normalizar(c),
    );
    if (porLegado) return porLegado;
  }

  for (const c of lista) {
    const porOutlook = CATEGORIAS_REUNION.find(
      (x) => normalizar(x.outlook) === normalizar(c),
    );
    if (porOutlook) return porOutlook;
  }

  return null;
}
