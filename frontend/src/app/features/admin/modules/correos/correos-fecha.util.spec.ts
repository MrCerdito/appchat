import { fechaCorta, numero, tiempoRelativo } from './correos-fecha.util';

/** 2026-03-12T15:04:00Z, punto de partida de todas las pruebas. */
const BASE = '2026-03-12T15:04:00Z';

/** Minutos antes de BASE: "en(2)" es un correo que llego hace dos minutos. */
function en(min: number): string {
  return new Date(new Date(BASE).getTime() - min * 60_000).toISOString();
}

describe('correos-fecha.util', () => {
  const ahora = new Date(BASE);

  describe('tiempoRelativo', () => {
    it('devuelve null si no hay fecha, para que elija quien la pinta', () => {
      expect(tiempoRelativo(null, ahora)).toBeNull();
      expect(tiempoRelativo(undefined, ahora)).toBeNull();
      expect(tiempoRelativo('', ahora)).toBeNull();
    });

    it('devuelve null si la fecha no se puede leer, en vez de "Invalid Date"', () => {
      expect(tiempoRelativo('no-es-una-fecha', ahora)).toBeNull();
    });

    it('redondea al minuto, para no ver "hace 0 min"', () => {
      expect(tiempoRelativo(en(0.4), ahora)).toBe('ahora');
    });

    it('cuenta minutos mientras dure la sesion', () => {
      expect(tiempoRelativo(en(1), ahora)).toBe('hace 1 min');
      expect(tiempoRelativo(en(2), ahora)).toBe('hace 2 min');
      expect(tiempoRelativo(en(59), ahora)).toBe('hace 59 min');
    });

    it('sube a horas al pasar de la hora', () => {
      expect(tiempoRelativo(en(60), ahora)).toBe('hace 1 h');
      expect(tiempoRelativo(en(150), ahora)).toBe('hace 3 h');
    });

    it('sube a dias durante la semana', () => {
      expect(tiempoRelativo(en(1440), ahora)).toBe('hace 1 d');
      expect(tiempoRelativo(en(1440 * 6), ahora)).toBe('hace 6 d');
    });

    it('deja de contar dias a la semana y muestra la fecha', () => {
      expect(tiempoRelativo(en(1440 * 8), ahora)).toBe(fechaCorta(en(1440 * 8)));
    });

    it('un reloj por delante se lee "ahora", no un negativo', () => {
      expect(tiempoRelativo(en(-5), ahora)).toBe('ahora');
      expect(tiempoRelativo(en(-1440), ahora)).toBe('ahora');
    });
  });

  describe('fechaCorta', () => {
    it('devuelve null cuando no hay nada que formatear', () => {
      expect(fechaCorta(null)).toBeNull();
      expect(fechaCorta('basura')).toBeNull();
    });

    it('incluye dia, mes y anio, todos a dos digitos', () => {
      // 04/03/2026, 10:04 a.m. en America/Bogota.
      expect(fechaCorta('2026-03-04T15:04:00Z')).toMatch(/04\/03\/2026/);
    });
  });

  describe('numero', () => {
    it('separa miles, porque sin eso los conteos no se comparan', () => {
      expect(numero(1234)).toMatch(/1.234/);
      expect(numero(1234567)).toMatch(/1.234.567/);
    });

    it('deja los numeros cortos como estan', () => {
      expect(numero(0)).toBe('0');
      expect(numero(7)).toBe('7');
      expect(numero(999)).toBe('999');
    });

    it('un valor ausente o invalido se lee 0, nunca NaN en pantalla', () => {
      expect(numero(null)).toBe('0');
      expect(numero(undefined)).toBe('0');
      expect(numero(Number.NaN)).toBe('0');
    });
  });
});