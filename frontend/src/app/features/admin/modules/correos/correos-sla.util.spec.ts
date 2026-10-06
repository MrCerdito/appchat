import {
  ACENTO_SLA,
  BORDE_SLA,
  COLOR_ESTADO,
  COLOR_SLA,
  COLUMNAS_ESTADO,
  ETIQUETA_SLA,
  FONDO_SLA,
  ORDEN_NIVEL,
  estiloNivel,
} from './correos-sla.util';
import { NivelSla } from '../../../../core/services/correos-admin.service';

describe('correos-sla.util', () => {
  describe('estiloNivel', () => {
    it('devuelve etiqueta y color de cada nivel', () => {
      expect(estiloNivel('critico').etiqueta).toBe('Critico');
      expect(estiloNivel('en_riesgo').etiqueta).toBe('En riesgo');
      expect(estiloNivel('estable').etiqueta).toBe('Estable');
      expect(estiloNivel('al_dia').etiqueta).toBe('Al dia');
    });

    it('trae fondo y borde para que el chip sea un chip y no una mancha', () => {
      for (const nivel of ORDEN_NIVEL) {
        expect(estiloNivel(nivel).fondo).toMatch(/^#[0-9a-f]{6}$/i);
        expect(estiloNivel(nivel).borde).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it('el texto de un nivel es mas oscuro que su fondo', () => {
      for (const nivel of ORDEN_NIVEL) {
        expect(canal(estiloNivel(nivel).color)).toBeLessThan(canal(estiloNivel(nivel).fondo));
      }
    });

    it('el acento es mas saturado que el texto, para la barra de la fila', () => {
      for (const nivel of ORDEN_NIVEL) {
        expect(estiloNivel(nivel).acento).not.toBe(estiloNivel(nivel).color);
      }
    });

    it('cae en Al dia si llega un nivel desconocido, en vez de pintar undefined', () => {
      const nivel = 'inventado' as NivelSla;
      expect(estiloNivel(nivel).etiqueta).toBe('Al dia');
      expect(estiloNivel(nivel).color).toBe(COLOR_SLA.al_dia);
      expect(estiloNivel(nivel).fondo).toBe(FONDO_SLA.al_dia);
      expect(estiloNivel(nivel).borde).toBe(BORDE_SLA.al_dia);
    });

    it('los cuatro niveles tienen etiqueta, color, fondo y borde propios', () => {
      expect(new Set(Object.values(ETIQUETA_SLA)).size).toBe(4);
      expect(new Set(Object.values(COLOR_SLA)).size).toBe(4);
      expect(new Set(Object.values(FONDO_SLA)).size).toBe(4);
      expect(new Set(Object.values(BORDE_SLA)).size).toBe(4);
      expect(new Set(Object.values(ACENTO_SLA)).size).toBe(4);
    });

    it('ningun estado comparte color con otro, para que las columnas se lean', () => {
      const colores = Object.values(COLOR_ESTADO);
      expect(new Set(colores).size).toBe(colores.length);
    });
  });

  describe('ORDEN_NIVEL', () => {
    it('va de mas urgente a menos urgente', () => {
      expect(ORDEN_NIVEL).toEqual(['critico', 'en_riesgo', 'estable', 'al_dia']);
    });
  });

  describe('COLUMNAS_ESTADO', () => {
    it('son las cinco del reporte, en el orden pedido', () => {
      expect(COLUMNAS_ESTADO.map((c) => c.clave)).toEqual([
        'enProceso',
        'gestionado',
        'escalado',
        'resuelto',
        'pendiente',
      ]);
    });

    it('cada columna tiene color propio, para distinguirlas de un vistazo', () => {
      const colores = COLUMNAS_ESTADO.map((c) => COLOR_ESTADO[c.clave]);
      expect(new Set(colores).size).toBe(COLUMNAS_ESTADO.length);
    });

    it('cada columna trae su titulo legible', () => {
      for (const col of COLUMNAS_ESTADO) {
        expect(col.titulo).toBeTruthy();
      }
    });
  });
});

/** Luminancia aproximada de un color hexadecimal, para comparar contrastes. */
function canal(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}