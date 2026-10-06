import { NivelSla } from '../../../../core/services/correos-admin.service';

/**
 * Presentacion de los niveles de SLA.
 *
 * El backend ya calcula el nivel (ver `nivelSla` en
 * `backend/src/correos/categoria-correo.util.ts`); aqui solo se traduce a como se
 * ve. Los umbrales NO se repiten en el frontend: si se duplicaran, un cambio en
 * un lado dejaria la tabla pintando un nivel que el conteo no dice.
 *
 * Cada nivel trae su trio de la escala Tailwind que usa `perfil-institucional`:
 * fondo `-50`, borde `-100` y texto `-700`. Asi los badges se leen como chips y
 * no como manchas de color.
 */
export interface EstiloNivelSla {
  etiqueta: string;
  /** Color del texto y del punto. */
  color: string;
  /** Fondo del chip. */
  fondo: string;
  /** Borde del chip. */
  borde: string;
  /** Color de la barra lateral de la fila. */
  acento: string;
}

/** Texto del estado. */
export const ETIQUETA_SLA: Record<NivelSla, string> = {
  critico: 'Critico',
  en_riesgo: 'En riesgo',
  estable: 'Estable',
  al_dia: 'Al dia',
};

/**
 * Escala de cada nivel: texto `-700`, fondo `-50`, borde `-100` y acento `-500`.
 *
 * Critico comparte rojo con "escalado" a proposito: son la misma alerta vista
 * desde dos angulos, asi que le conviene el mismo color.
 */
export const COLOR_SLA: Record<NivelSla, string> = {
  critico: '#b91c1c',
  en_riesgo: '#b45309',
  estable: '#1d4ed8',
  al_dia: '#15803d',
};

export const FONDO_SLA: Record<NivelSla, string> = {
  critico: '#fef2f2',
  en_riesgo: '#fffbeb',
  estable: '#eff6ff',
  al_dia: '#f0fdf4',
};

export const BORDE_SLA: Record<NivelSla, string> = {
  critico: '#fecaca',
  en_riesgo: '#fde68a',
  estable: '#bfdbfe',
  al_dia: '#bbf7d0',
};

export const ACENTO_SLA: Record<NivelSla, string> = {
  critico: '#ef4444',
  en_riesgo: '#f59e0b',
  estable: '#3b82f6',
  al_dia: '#22c55e',
};

/**
 * Estilo completo de un nivel. Se centraliza para que el chip de la leyenda, el
 * estado de la fila y la barra de acento usen exactamente los mismos colores.
 */
export function estiloNivel(nivel: NivelSla): EstiloNivelSla {
  const seguro = nivel in ETIQUETA_SLA ? nivel : 'al_dia';
  return {
    etiqueta: ETIQUETA_SLA[seguro],
    color: COLOR_SLA[seguro],
    fondo: FONDO_SLA[seguro],
    borde: BORDE_SLA[seguro],
    acento: ACENTO_SLA[seguro],
  };
}

/**
 * Color de cada columna de estado.
 *
 * En la tabla no se pinta el numero: el color va en el punto bajo el titulo y
 * solo se tiñe la celda cuando el valor es distinto de cero, para que un cero se
 * lea solo como silencio.
 */
export const COLOR_ESTADO: Record<string, string> = {
  pendiente: '#d97706',
  enProceso: '#2563eb',
  gestionado: '#0e7490',
  escalado: '#dc2626',
  resuelto: '#16a34a',
  otros: '#64748b',
};

/** Las cinco columnas del reporte, en el orden en que las pide el reporte. */
export const COLUMNAS_ESTADO = [
  { clave: 'enProceso', titulo: 'En proceso' },
  { clave: 'gestionado', titulo: 'Gestionado' },
  { clave: 'escalado', titulo: 'Escalado' },
  { clave: 'resuelto', titulo: 'Resuelto' },
  { clave: 'pendiente', titulo: 'Pendiente' },
] as const;

export type ClaveEstado = (typeof COLUMNAS_ESTADO)[number]['clave'];

/** Orden de urgencia: primero lo que hay que mirar hoy. */
export const ORDEN_NIVEL: NivelSla[] = ['critico', 'en_riesgo', 'estable', 'al_dia'];