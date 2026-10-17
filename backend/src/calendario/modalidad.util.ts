/**
 * Modalidad (virtual / presencial) deducida de las categorias de un evento.
 *
 * Los eventos creados desde la app ya guardan `modalidad` en `teams_meetings`,
 * pero los creados directamente en Teams/Outlook no: existen unicamente como
 * evento de Graph, cuya unica pista es la categoria de Outlook que les puso el
 * organizador. Como la app ya escribe `Blue category` para presencial y
 * `Yellow category` para virtual, la categoria ES el color y ES la modalidad.
 *
 * El mapa replica el de `frontend/src/app/shared/utils/categoria-reunion.util.ts`
 * (alias + nombre de Outlook + nombre legado), resolviendo ITEM POR ITEM en el
 * orden de la lista: si Graph trae varias categorias, manda la primera que se
 * reconozca. Si ninguna se reconoce, se devuelve el valor por defecto.
 */

export type Modalidad = 'virtual' | 'presencial';

/**
 * OJO con el legado: antes presencial era "Yellow category" y virtual
 * "Blue category" (inverso al actual). Por eso el nombre de Outlook se resuelve
 * primero que el legado, igual que en el front.
 */
const PRESENCIAL_ACTUAL = ['reunion presencial', 'blue category'];
const PRESENCIAL_LEGADO = ['yellow category'];
const VIRTUAL_ACTUAL = ['reunion virtual', 'yellow category'];
const VIRTUAL_LEGADO = ['blue category'];

function normalizar(valor: unknown): string {
  return String(valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Modalidad de un evento segun sus categorias.
 *
 * Sin categorias no hay nada que inferir: se devuelve `fallback`, que es el
 * valor que ya traia la fila local (o 'virtual' si tampoco lo hay).
 */
export function modalidadDesdeCategorias(
  categorias: readonly unknown[] | null | undefined,
  fallback: Modalidad = 'virtual',
): Modalidad {
  const lista = (Array.isArray(categorias) ? categorias : [])
    .map(normalizar)
    .filter((c) => c.length > 0);

  if (lista.length === 0) return fallback;

  // 1) Nombre actual de la categoria (alias de la app o color literal).
  for (const c of lista) {
    if (PRESENCIAL_ACTUAL.includes(c)) return 'presencial';
    if (VIRTUAL_ACTUAL.includes(c)) return 'virtual';
  }
  // 2) Nombre legado, solo como ultimo recurso.
  for (const c of lista) {
    if (PRESENCIAL_LEGADO.includes(c)) return 'presencial';
    if (VIRTUAL_LEGADO.includes(c)) return 'virtual';
  }

  return fallback;
}

/**
 * Proyecto (Sian365 / ControlAcademic) al que pertenece el colegio.
 *
 * Sian365 y ControlAcademic son PROYECTOS, no marcas: este es el nombre con el
 * que se agrupan en Metricas (mismo criterio que `PROYECTO_SESIONES`).
 */
export function proyectoDeTipoColegio(tipoColegio: string | null | undefined): string {
  const t = normalizar(tipoColegio);
  if (/control|academic/.test(t)) return 'ControlAcademic';
  if (/sian|365/.test(t)) return 'Sian365';
  return 'Sin clasificar';
}

/**
 * Categoria SEMANTICA completa del evento (no solo su modalidad).
 *
 * Modalidad solo distingue virtual/presencial, pero el calendario pinta SIETE
 * tipos con colores distintos (cumpleanos, reunion de equipo, vacaciones...).
 * Para que Metricas pinte igual que el Calendario necesita saber de que tipo es
 * cada evento, no solo si es online o presencial.
 *
 * Replica item por item el orden de `categoriaDeEvento` del front
 * (`shared/utils/categoria-reunion.util.ts`): en cada categoria de Graph se
 * prueba primero el alias de la app, luego el nombre literal de Outlook y al
 * final el legado. Si Graph trae varias, manda la primera que se reconozca y,
 * como la lista va en el mismo orden que el front, tambien manda el mismo item.
 *
 * Sin categorias reconocibles se cae a la modalidad que ya traia el evento, asi
 * un evento creado en la app sigue pintando aunque Graph no conserve el tag.
 */
const CATEGORIAS_ALIAS: { alias: string; outlook: string; legado: string }[] = [
  { alias: 'Reunion presencial', outlook: 'Blue category', legado: 'Yellow category' },
  { alias: 'Reunion virtual', outlook: 'Yellow category', legado: 'Blue category' },
  { alias: 'Reunion equipo', outlook: 'Purple category', legado: 'Purple category' },
  { alias: 'Cumpleanos', outlook: 'Green category', legado: 'Green category' },
  { alias: 'Ausencia/permisos', outlook: 'Orange category', legado: 'Orange category' },
  { alias: 'Vacaciones', outlook: 'Purple category', legado: 'Purple category' },
  { alias: 'Incapacidad', outlook: 'Red category', legado: 'Red category' },
];

/** Alias que corresponde a una modalidad conocida (fallback). */
export function aliasDeModalidad(modalidad: Modalidad): string {
  return modalidad === 'presencial' ? 'Reunion presencial' : 'Reunion virtual';
}

export function categoriaDesdeCategorias(
  categorias: readonly unknown[] | null | undefined,
  fallback: Modalidad = 'virtual',
): string {
  const lista = (Array.isArray(categorias) ? categorias : [])
    .map(normalizar)
    .filter((c) => c.length > 0);

  for (const c of lista) {
    const porAlias = CATEGORIAS_ALIAS.find((x) => normalizar(x.alias) === c);
    if (porAlias) return porAlias.alias;
    const porOutlook = CATEGORIAS_ALIAS.find((x) => normalizar(x.outlook) === c);
    if (porOutlook) return porOutlook.alias;
    const porLegado = CATEGORIAS_ALIAS.find((x) => normalizar(x.legado) === c);
    if (porLegado) return porLegado.alias;
  }

  return aliasDeModalidad(fallback);
}
