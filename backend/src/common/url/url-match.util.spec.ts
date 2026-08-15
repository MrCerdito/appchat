import { normalizeUrl, matchColegio } from './url-match.util';

describe('normalizeUrl', () => {
  it('añade esquema y normaliza host', () => {
    expect(normalizeUrl('micolegio.edu/login')).toEqual({
      host: 'micolegio.edu',
      path: '/login',
    });
  });

  it('quita www y normaliza mayúsculas y barras finales', () => {
    expect(normalizeUrl('HTTP://WWW.MiColegio.Edu//Login///')).toEqual({
      host: 'micolegio.edu',
      path: '/login',
    });
  });

  it('soporta protocolo-relative', () => {
    expect(normalizeUrl('//micolegio.edu/a')).toEqual({
      host: 'micolegio.edu',
      path: '/a',
    });
  });

  it('devuelve null para entradas inválidas', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('   ')).toBeNull();
    expect(normalizeUrl('#')).toBeNull();
    expect(normalizeUrl('not a url at all')).toBeNull(); // espacios en host = inválido
    expect(normalizeUrl('micolegio.edu/sin-esquema')).toEqual({
      host: 'micolegio.edu',
      path: '/sin-esquema',
    });
    expect(normalizeUrl(null)).toBeNull();
    expect(normalizeUrl(undefined)).toBeNull();
  });
});

describe('matchColegio', () => {
  const colegios = [
    {
      nombre: 'ABRIENDO CAMINOS',
      link: 'https://controlacademic.co/abriendocaminos',
    },
    {
      nombre: 'AMERICAN GARDEN BY GCB',
      link: 'https://edu.controlacademic.co/jgcb',
    },
    {
      nombre: 'AMERICAN SCHOOL',
      link: 'https://app.controlacademic.co/americanschool',
    },
    { nombre: 'CANVAS', link: 'https://controlacademic.co/canvas' },
    { nombre: 'COLEGIO NUEVO', link: 'https://colegio.com' },
    { nombre: 'GOLDEN', link: 'https://cloud.sian365.co/gis' },
  ];

  it('coincide por host exacto y ruta', () => {
    expect(
      matchColegio(colegios, 'https://controlacademic.co/abriendocaminos')
        ?.nombre,
    ).toBe('ABRIENDO CAMINOS');
  });

  it('coincide ignorando www, protocolo y mayúsculas', () => {
    expect(
      matchColegio(colegios, 'http://WWW.ControlAcademic.Co/ABRIENDOcaminoS')
        ?.nombre,
    ).toBe('ABRIENDO CAMINOS');
  });

  it('coincide cuando la página está en un subdominio no registrado', () => {
    expect(
      matchColegio(
        colegios,
        'https://portal.controlacademic.co/abriendocaminos/login',
      )?.nombre,
    ).toBe('ABRIENDO CAMINOS');
  });

  it('coincide cuando la página está en el dominio base y el colegio en subdominio', () => {
    expect(
      matchColegio(colegios, 'https://controlacademic.co/jgcb')?.nombre,
    ).toBe('AMERICAN GARDEN BY GCB');
  });

  it('no empareja subdominios hermanos', () => {
    expect(matchColegio(colegios, 'https://edu.sian365.co/gis')).toBeNull();
    expect(
      matchColegio(colegios, 'https://cloud.controlacademic.co/jgcb'),
    ).toBeNull();
  });

  it('no empareja dominios parecidos (ataques tipo suffix)', () => {
    expect(matchColegio(colegios, 'https://xcolegio.com/')).toBeNull();
    expect(
      matchColegio(colegios, 'https://notcontrolacademic.co/abriendocaminos'),
    ).toBeNull();
    expect(matchColegio(colegios, 'https://evil.com/')).toBeNull();
  });

  it('usa la ruta como prefijo', () => {
    expect(
      matchColegio(
        colegios,
        'https://app.controlacademic.co/americanschool/dashboard',
      )?.nombre,
    ).toBe('AMERICAN SCHOOL');
  });

  it('hace fallback a host-raíz cuando hay un único candidato', () => {
    expect(matchColegio(colegios, 'https://colegio.com/login')?.nombre).toBe(
      'COLEGIO NUEVO',
    );
  });

  it('devuelve null cuando hay ambigüedad de rutas', () => {
    expect(
      matchColegio(colegios, 'https://controlacademic.co/otra-ruta'),
    ).toBeNull();
  });

  it('devuelve null para URL inválida', () => {
    expect(matchColegio(colegios, '')).toBeNull();
    expect(matchColegio(colegios, null)).toBeNull();
  });
});
