import { COLOR_ESTADO } from './correos-sla.util';

/**
 * Presentacion de categorias de Outlook para el listado del admin.
 *
 * Se normaliza el texto para que "EN PROCESO", "-EN PROCESO" o "en_proceso"
 * aparezcan como "En proceso", exactamente como en la vista del asesor. Ademas
 * se asigna un color por cubo conocido para que el ojo lea el estado de un
 * vistazo.
 */

const MAPA_ETIQUETAS: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  'EN PROCESO': 'En proceso',
  EN_PROCESO: 'En proceso',
  ENPROCESO: 'En proceso',
  GESTIONADO: 'Gestionado',
  ESCALADO: 'Escalado',
  RESUELTO: 'Resuelto',
  RESUELTOS: 'Resuelto',
  OTROS: 'Otros',
  OTRO: 'Otros',
  SIN_CATEGORIA: 'Sin categoría',
  'SIN CATEGORÍA': 'Sin categoría',
  'SIN CATEGORIA': 'Sin categoría',
  'PENDIENTE DE CLASIFICAR': 'Pendiente',
  'PENDIENTE DE ASIGNAR': 'Pendiente',
};

const MAPA_COLORES: Record<string, string> = {
  PENDIENTE: COLOR_ESTADO['pendiente'],
  'EN PROCESO': COLOR_ESTADO['enProceso'],
  EN_PROCESO: COLOR_ESTADO['enProceso'],
  ENPROCESO: COLOR_ESTADO['enProceso'],
  GESTIONADO: COLOR_ESTADO['gestionado'],
  ESCALADO: COLOR_ESTADO['escalado'],
  RESUELTO: COLOR_ESTADO['resuelto'],
  RESUELTOS: COLOR_ESTADO['resuelto'],
  OTROS: COLOR_ESTADO['otros'],
  OTRO: COLOR_ESTADO['otros'],
};

export function etiquetaCategoria(categoria: string | null | undefined): string {
  if (!categoria) return 'Sin categoría';

  const cruda = categoria.trim();
  if (!cruda) return 'Sin categoría';

  const claveDirecta = cruda.toUpperCase();
  if (MAPA_ETIQUETAS[claveDirecta]) {
    return MAPA_ETIQUETAS[claveDirecta];
  }

  const limpia = cruda
    .replace(/^[\-\s]+/, '')
    .replace(/[\-\s]+$/, '')
    .replace(/[_]+/g, ' ');

  const claveLimpia = limpia.toUpperCase();
  if (MAPA_ETIQUETAS[claveLimpia]) {
    return MAPA_ETIQUETAS[claveLimpia];
  }

  const capitalizada = limpia
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ');

  if (!capitalizada) return 'Sin categoría';
  return capitalizada;
}

export function colorCategoria(categoria: string | null | undefined): string {
  if (!categoria) return '#64748b';

  const cruda = categoria.trim().toUpperCase();
  if (!cruda) return '#64748b';

  if (MAPA_COLORES[cruda]) return MAPA_COLORES[cruda];

  const limpia = cruda.replace(/^[\-\s]+/, '').replace(/[_]+/g, ' ');
  if (MAPA_COLORES[limpia]) return MAPA_COLORES[limpia];

  return '#64748b';
}

export function esCategoriaPendiente(categoria: string | null | undefined): boolean {
  if (!categoria) return false;
  const c = categoria.trim().toUpperCase();
  return c === 'PENDIENTE' || c === 'PENDIENTE DE CLASIFICAR' || c === 'PENDIENTE DE ASIGNAR';
}