import {
  COLOR_CATEGORIA_POR_DEFECTO,
  COLORES_CATEGORIA,
  colorCategoria,
  estiloCategoria,
  normalizarCategoria,
  normalizarCategorias,
} from './categoria-correo.util';

/**
 * Los valores de entrada son los que hay realmente en la columna `categorias`
 * de la base, con su simbolo y todo.
 */
describe('normalizarCategoria', () => {
  it('quita el simbolo de las categorias reales del buzon', () => {
    expect(normalizarCategoria('✓ RESUELTO')).toBe('RESUELTO');
    expect(normalizarCategoria('-EN PROCESO')).toBe('EN PROCESO');
    expect(normalizarCategoria('- ESCALADO')).toBe('ESCALADO');
    expect(normalizarCategoria('- GESTIONADO')).toBe('GESTIONADO');
    expect(normalizarCategoria('CASO OMISO')).toBe('CASO OMISO');
  });

  it('deja intactas las categorias que ya venían limpias', () => {
    expect(normalizarCategoria('RESUELTO')).toBe('RESUELTO');
    expect(normalizarCategoria('CASO OMISO')).toBe('CASO OMISO');
  });

  it('normaliza espacios y mayusculas', () => {
    expect(normalizarCategoria('  ✓   resuelto ')).toBe('RESUELTO');
    expect(normalizarCategoria('en proceso')).toBe('EN PROCESO');
    expect(normalizarCategoria('-en  proceso')).toBe('EN PROCESO');
  });

  it('no rompe una categoria que empieza por una letra', () => {
    // Si se comiera letras, "Reabierto" se volveria "EABIERTO".
    expect(normalizarCategoria('REABIERTO')).toBe('REABIERTO');
    expect(normalizarCategoria('CASO OMISO')).toBe('CASO OMISO');
  });

  it('devuelve texto vacio para entradas vacias o nulas', () => {
    expect(normalizarCategoria('')).toBe('');
    expect(normalizarCategoria(null)).toBe('');
    expect(normalizarCategoria(undefined)).toBe('');
    expect(normalizarCategoria('   ')).toBe('');
    expect(normalizarCategoria('-')).toBe('');
  });
});

describe('colorCategoria', () => {
  it('devuelve el color indicado para cada categoria', () => {
    expect(colorCategoria('ESCALADO')).toBe('#d696c0');
    expect(colorCategoria('GESTIONADO')).toBe('#a6e9ed');
    expect(colorCategoria('RESUELTO')).toBe('#9ad29a');
    expect(colorCategoria('CASO OMISO')).toBe('#c4c4c4');
    expect(colorCategoria('EN PROCESO')).toBe('#caada3');
  });

  it('busca el color aunque la cadena venga con el simbolo de Outlook', () => {
    expect(colorCategoria('✓ RESUELTO')).toBe('#9ad29a');
    expect(colorCategoria('- ESCALADO')).toBe('#d696c0');
  });

  it('cae al color por defecto si la categoria no esta en la paleta', () => {
    expect(colorCategoria('OTRA COSA')).toBe(COLOR_CATEGORIA_POR_DEFECTO);
    expect(colorCategoria('')).toBe(COLOR_CATEGORIA_POR_DEFECTO);
  });
});

describe('estiloCategoria', () => {
  it('devuelve el texto limpio y el color de fondo', () => {
    expect(estiloCategoria('✓ RESUELTO')).toEqual({ texto: 'RESUELTO', fondo: '#9ad29a' });
    expect(estiloCategoria('- GESTIONADO')).toEqual({
      texto: 'GESTIONADO',
      fondo: '#a6e9ed',
    });
  });

  it('deja el fondo en null cuando no hay color conocido', () => {
    // Con null el template no fuerza el estilo y manda la hoja de estilos.
    expect(estiloCategoria('OTRA COSA')).toEqual({
      texto: 'OTRA COSA',
      fondo: null,
    });
  });
});

describe('normalizarCategorias', () => {
  it('normaliza una lista y quita vacios', () => {
    expect(normalizarCategorias(['✓ RESUELTO', '-EN PROCESO', '  ', ''])).toEqual([
      'RESUELTO',
      'EN PROCESO',
    ]);
  });

  it('no repite cuando en Outlook hay variantes decoradas distintas', () => {
    expect(normalizarCategorias(['✓ RESUELTO', '- RESUELTO', 'RESUELTO'])).toEqual([
      'RESUELTO',
    ]);
  });

  it('sabe trabajar sin categorias', () => {
    expect(normalizarCategorias(null)).toEqual([]);
    expect(normalizarCategorias(undefined)).toEqual([]);
    expect(normalizarCategorias([])).toEqual([]);
  });
});