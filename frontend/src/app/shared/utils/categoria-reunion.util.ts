/**
 * Categorias de reuniones y su presentacion en el calendario de la app.
 *
 * Cada tipo manda DOS nombres a Graph:
 *  - `alias`: lo que elige el usuario ("Reunion presencial"...). La app lo
 *    resuelve primero para pintar el chip con `color`.
 *  - `outlook`: nombre literal de la categoria de Outlook cuyo color por
 *    defecto coincide con `color`, para que Teams/Outlook pinten el evento
 *    igual que la app (presencial=azul, virtual=amarillo).
 *
 * `outlookLegado` guarda el nombre que usaban los eventos antiguos
 * (presencial era "Yellow category" y virtual "Blue category"). Solo sirve
 * como ultimo recurso: el color lo decide `outlook`, porque el nombre literal
 * de Outlook ES su color y asi la app pinta igual que Teams. Si se resolviera
 * primero el legado, "Yellow category" (amarilla en Teams) caeria en
 * presencial y se pintaria AZUL.
 */
export interface CategoriaReunion {
  alias: string;
  outlook: string;
  /** Nombre de Outlook que traian los eventos creados antes del cambio. */
  outlookLegado: string;
  /** Color visual del calendario en la app. */
  color: string;
  /**
   * true = ocasion puntual marcada por un RANGO de fechas (ausencia,
   * vacaciones, incapacidad): el formulario pide "Desde" y "Hasta" en lugar
   * de hora de inicio y duracion, y el evento pinta todos los dias del tramo.
   * false = reunion con hora de inicio y duracion (comportamiento normal).
   */
  esRango: boolean;
  /**
   * true = es una reunion con el colegio (solo presencial y virtual): ahi SI se
   * etiqueta el colegio, que es lo que permite filtrarla en Metricas por
   * proyecto. El resto (equipo, cumpleanos y las marcas por rango) no es con
   * un colegio concreto, asi que no piden colegio.
   */
  esReunion: boolean;
}

/**
 * Colores fijados con el usuario:
 *   AMARILLO  → virtual        AZUL       → presencial
 *   MORADO    → reunion equipo VERDE      → cumpleanos
 *   NARANJA   → ausencia/permisos          PURPURA → vacaciones
 *   ROJO      → incapacidad
 *
 * El `outlook` es la categoria literal de Outlook que mas se le acerca, para
 * que Teams/Outlook pinten el evento con un color parecido al de la app.
 */
export const CATEGORIAS_REUNION: CategoriaReunion[] = [
  { alias: 'Reunion presencial', outlook: 'Blue category', outlookLegado: 'Yellow category', color: '#3b82f6', esRango: false, esReunion: true },
  { alias: 'Reunion virtual', outlook: 'Yellow category', outlookLegado: 'Blue category', color: '#eab308', esRango: false, esReunion: true },
  { alias: 'Reunion equipo', outlook: 'Purple category', outlookLegado: 'Purple category', color: '#a855f7', esRango: false, esReunion: false },
  { alias: 'Cumpleanos', outlook: 'Green category', outlookLegado: 'Green category', color: '#22c55e', esRango: false, esReunion: false },
  { alias: 'Ausencia/permisos', outlook: 'Orange category', outlookLegado: 'Orange category', color: '#f97316', esRango: true, esReunion: false },
  { alias: 'Vacaciones', outlook: 'Purple category', outlookLegado: 'Purple category', color: '#7e22ce', esRango: true, esReunion: false },
  { alias: 'Incapacidad', outlook: 'Red category', outlookLegado: 'Red category', color: '#ef4444', esRango: true, esReunion: false },
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
 * Se resuelve ITEM POR ITEM en el orden de la lista, y dentro de cada item en
 * este orden:
 *  1. El alias, que solo traen los eventos creados por la app: da la categoria
 *     SEMANTICA correcta ("Reunion virtual" sigue siendo virtual aunque su
 *     color haya cambiado).
 *  2. El nombre literal de Outlook. Este paso es el que garantiza que la app
 *     pinte IGUAL que Teams/Outlook: el nombre de la categoria ES su color
 *     ("Yellow category" = amarilla, "Blue category" = azul), y `outlook` de
 *     cada categoria ya esta elegido para coincidir con su `color`.
 *  3. El nombre legado, solo como ultimo recurso: no pinta distinto a lo que
 *     ya resolvio el paso 2, porque todos los legados siguen siendo nombres de
 *     color actuales.
 *
 * Por que por item y no en tres pasadas sobre la lista entera:
 * `mapear()` del backend arma la lista como [categorias de Graph, ...las de la
 * fila local]. Antes la pasada de alias recorria toda la lista, asi que un
 * alias VIEJO de la fila local ("Reunion virtual") le ganaba a la categoria
 * que el usuario acababa de poner en Teams ("Blue category") y el chip se
 * quedaba con el color anterior. Con resolucion por item manda el primero que
 * resuelva; como Graph va primero, manda Teams/Outlook. Si Graph trae algo que
 * no reconocemos, se cae al alias de la fila local, que era el motivo de
 * fusionar las dos listas.
 */
export function categoriaDeEvento(
  categorias: string[] | null | undefined,
): CategoriaReunion | null {
  const lista = (categorias ?? [])
    .map((c) => String(c ?? '').trim())
    .filter((c) => c.length > 0);

  const normalizar = (valor: string) => valor.toLowerCase();

  for (const c of lista) {
    const porAlias = buscarCategoria(c);
    if (porAlias) return porAlias;

    const porOutlook = CATEGORIAS_REUNION.find(
      (x) => normalizar(x.outlook) === normalizar(c),
    );
    if (porOutlook) return porOutlook;

    const porLegado = CATEGORIAS_REUNION.find(
      (x) => normalizar(x.outlookLegado) === normalizar(c),
    );
    if (porLegado) return porLegado;
  }

  return null;
}
