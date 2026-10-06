/**
 * Fechas del modulo de Correos, en dos formatos.
 *
 * La tabla muestra "hace 3 min" porque la pregunta del admin es "¿esto esta
 * viejo?", y esa pregunta se responde con una distancia, no con un reloj. El
 * valor exacto sigue disponible en el `title`, para cuando hace falta.
 */

/** Minutos de un dia, para no repetir la division en cada rama. */
const MIN_DIA = 1440;

/**
 * Distancia legible desde `ahora`.
 *
 * @returns `null` si no hay fecha o no se puede leer, para que quien llame
 * decida si escribe "Nunca", un guion o nada.
 */
export function tiempoRelativo(
  iso: string | null | undefined,
  ahora: Date = new Date(),
): string | null {
  if (!iso) return null;

  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;

  // Math.round y no floor: a los 59 s ya se lee "hace 1 min", que es lo que
  // espera alguien mirando un tablero que se refresca cada dos minutos.
  const minutos = Math.round((ahora.getTime() - fecha.getTime()) / 60_000);

  // Un reloj que va por delante no es un error de datos, pero tampoco tiene
  // sentido decir "hace -2 min": se muestra "ahora".
  if (minutos < 1) return 'ahora';

  if (minutos < 60) return `hace ${minutos} min`;
  if (minutos < MIN_DIA) return `hace ${Math.round(minutos / 60)} h`;
  if (minutos < MIN_DIA * 7) return `hace ${Math.round(minutos / MIN_DIA)} d`;

  return fechaCorta(iso);
}

/**
 * Fecha corta para el `title` y para cuando la distancia deja de tener sentido.
 *
 * El mismo formato para todos los meses: en una columna de fechas, un "5 oct"
 * al lado de un "05 oct" se nota, y un "oct" suelto no dice el dia.
 */
export function fechaCorta(iso: string | null | undefined): string | null {
  if (!iso) return null;

  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;

  return fecha.toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Separador de miles para los conteos.
 *
 * Con cinco cifras y cuatro columnas, sin separador los numeros se pegan y el
 * admin termina comparando posiciones en vez de magnitudes.
 */
export function numero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return '0';
  return valor.toLocaleString('es-CO');
}