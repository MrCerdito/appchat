import {
  ETIQUETA_CUBO,
  UMBRAL_CRITICO,
  UMBRAL_EN_RIESGO,
  abiertosCubos,
  acumular,
  clasificarMensaje,
  conteoVacio,
  cuentaParaSla,
  filaDesdeConteo,
  nivelSla,
  normalizarCategoria,
  normalizarCategorias,
  parsearCategorias,
  totalCubos,
} from './categoria-correo.util';

describe('categoria-correo.util (dashboard admin)', () => {
  describe('normalizarCategoria', () => {
    it('quita el simbolo que Outlook pone delante', () => {
      expect(normalizarCategoria('✓ RESUELTO')).toBe('RESUELTO');
      expect(normalizarCategoria('-EN PROCESO')).toBe('EN PROCESO');
      expect(normalizarCategoria('- ESCALADO')).toBe('ESCALADO');
      expect(normalizarCategoria('#GESTIONADO')).toBe('GESTIONADO');
    });

    it('colapsa espacios dobles, que Outlook guarda tal cual', () => {
      expect(normalizarCategoria('EN  PROCESO')).toBe('EN PROCESO');
    });

    it('devuelve vacio para null, undefined y espacios', () => {
      expect(normalizarCategoria(null)).toBe('');
      expect(normalizarCategoria(undefined)).toBe('');
      expect(normalizarCategoria('   ')).toBe('');
    });

    it('aplica el mismo criterio que el frontend, que es lo que evita contradicciones', () => {
      // El frontend (shared/utils/categoria-correo.util.ts) normaliza igual. Si
      // cambia aqui, hay que cambiarlo alli, o el dashboard contradiria a la
      // bandeja que ve el asesor.
      expect(normalizarCategoria('✓✔ RESUELTO')).toBe('RESUELTO');
      expect(normalizarCategoria('»EN PROCESO')).toBe('EN PROCESO');
    });
  });

  describe('normalizarCategorias', () => {
    it('quita duplicados decorados de forma distinta', () => {
      expect(normalizarCategorias(['✓ RESUELTO', 'RESUELTO'])).toEqual(['RESUELTO']);
    });

    it('descarta vacios y no revienta con null', () => {
      expect(normalizarCategorias(null)).toEqual([]);
      expect(normalizarCategorias(['', '  ', 'EN PROCESO'])).toEqual(['EN PROCESO']);
    });
  });

  describe('parsearCategorias', () => {
    it('interpreta las tres formas de "sin categoria" de la columna simple-json', () => {
      expect(parsearCategorias(null)).toEqual([]);
      expect(parsearCategorias('null')).toEqual([]);
      expect(parsearCategorias('[]')).toEqual([]);
    });

    it('lee un arreglo real y descarta lo que no sea texto', () => {
      expect(parsearCategorias('["✓ RESUELTO","-EN PROCESO"]')).toEqual([
        '✓ RESUELTO',
        '-EN PROCESO',
      ]);
      expect(parsearCategorias('[1,null,"ESCALADO"]')).toEqual(['ESCALADO']);
    });

    it('devuelve vacio si el texto no es JSON valido', () => {
      expect(parsearCategorias('{roto')).toEqual([]);
    });
  });

  describe('clasificarMensaje', () => {
    it('sin categorias es pendiente', () => {
      expect(clasificarMensaje([])).toBe('pendiente');
      expect(clasificarMensaje(null)).toBe('pendiente');
      expect(clasificarMensaje(['  '])).toBe('pendiente');
    });

    it('mapea cada categoria conocida a su cubo', () => {
      expect(clasificarMensaje(['✓ RESUELTO'])).toBe('resuelto');
      expect(clasificarMensaje(['-EN PROCESO'])).toBe('en_proceso');
      expect(clasificarMensaje(['- ESCALADO'])).toBe('escalado');
      expect(clasificarMensaje(['GESTIONADO'])).toBe('gestionado');
    });

    it('una categoria desconocida cae en otros', () => {
      expect(clasificarMensaje(['CASO OMISO'])).toBe('otros');
      expect(clasificarMensaje(['✓✓ REABIERTO'])).toBe('otros');
    });

    it('con varias categorias gana la de mayor precedencia', () => {
      // El caso real: el asesor marco "EN PROCESO" y luego "RESUELTO" sin quitar
      // la etiqueta vieja. Debe contar como resuelto.
      expect(clasificarMensaje(['-EN PROCESO', '✓ RESUELTO'])).toBe('resuelto');
      expect(clasificarMensaje(['✓ RESUELTO', '-EN PROCESO'])).toBe('resuelto');
      expect(clasificarMensaje(['-EN PROCESO', '- ESCALADO'])).toBe('escalado');
      expect(clasificarMensaje(['GESTIONADO', '-EN PROCESO'])).toBe('gestionado');
    });

    it('la precedencia no depende del orden de las categorias', () => {
      expect(clasificarMensaje(['GESTIONADO', '✓ RESUELTO', '- ESCALADO', '-EN PROCESO'])).toBe(
        'resuelto',
      );
    });

    it('una categoria desconocida junto a una conocida no la pisa', () => {
      expect(clasificarMensaje(['CASO OMISO', '-EN PROCESO'])).toBe('en_proceso');
    });
  });

  describe('cuentaParaSla', () => {
    it('cuentan pendiente, en proceso y escalado', () => {
      expect(cuentaParaSla('pendiente')).toBe(true);
      expect(cuentaParaSla('en_proceso')).toBe(true);
      expect(cuentaParaSla('escalado')).toBe(true);
    });

    it('lo resuelto y lo demas no generan alerta', () => {
      expect(cuentaParaSla('resuelto')).toBe(false);
      expect(cuentaParaSla('gestionado')).toBe(false);
      expect(cuentaParaSla('otros')).toBe(false);
    });
  });

  describe('nivelSla', () => {
    it('0 abiertos es al dia', () => {
      expect(nivelSla(0)).toBe('al_dia');
    });

    it('1 y 2 abiertos es estable', () => {
      expect(nivelSla(1)).toBe('estable');
      expect(nivelSla(2)).toBe('estable');
    });

    it('3 abiertos es en riesgo', () => {
      expect(nivelSla(3)).toBe('en_riesgo');
    });

    it(`desde ${UMBRAL_CRITICO} abiertos es critico`, () => {
      expect(nivelSla(UMBRAL_CRITICO)).toBe('critico');
      expect(nivelSla(UMBRAL_CRITICO + 12)).toBe('critico');
    });

    it('los umbrales declarados son los acordados', () => {
      expect(UMBRAL_EN_RIESGO).toBe(3);
      expect(UMBRAL_CRITICO).toBe(4);
    });

    it('no se rompe con numeros raros', () => {
      expect(nivelSla(-1)).toBe('al_dia');
    });
  });

  describe('conteo y fila', () => {
    it('reparte cada mensaje en su cubo y recalcula total y SLA', () => {
      const conteo = conteoVacio();
      acumular(conteo, ['-EN PROCESO']);
      acumular(conteo, ['-EN PROCESO']);
      acumular(conteo, ['- ESCALADO']);
      acumular(conteo, ['✓ RESUELTO']);
      acumular(conteo, ['GESTIONADO']);
      acumular(conteo, null);

      const fila = filaDesdeConteo(conteo);
      expect(fila.enProceso).toBe(2);
      expect(fila.escalado).toBe(1);
      expect(fila.resuelto).toBe(1);
      expect(fila.gestionado).toBe(1);
      expect(fila.pendiente).toBe(1);
      expect(fila.total).toBe(6);
      // abiertos = pendiente + en proceso + escalado = 4
      expect(fila.abiertos).toBe(4);
      expect(fila.nivel).toBe('critico');
    });

    it('cuenta en el cubo correcto aunque el mensaje tenga varias categorias', () => {
      const conteo = conteoVacio();
      acumular(conteo, ['✓ RESUELTO', '-EN PROCESO']);
      const fila = filaDesdeConteo(conteo);
      expect(fila.resuelto).toBe(1);
      expect(fila.enProceso).toBe(0);
      expect(fila.abiertos).toBe(0);
      expect(fila.nivel).toBe('al_dia');
    });

    it('no deja contadores en cero por mezclar el nombre del cubo con el del DTO', () => {
      // El cubo es `en_proceso` y el campo del DTO es `enProceso`. Si se mezclan
      // al contar, aparece una propiedad suelta y el campo real se queda en 0.
      const conteo = conteoVacio();
      acumular(conteo, ['-EN PROCESO']);
      const fila = filaDesdeConteo(conteo);
      expect(fila.enProceso).toBe(1);
      expect(fila.total).toBe(1);
      expect(Object.keys(conteo)).toHaveLength(6);
      expect(Object.values(conteo).reduce((a, b) => a + b, 0)).toBe(1);
    });

    it('el total cuadra aunque aparezcan categorias nuevas', () => {
      const conteo = conteoVacio();
      acumular(conteo, ['CASO OMISO']);
      acumular(conteo, ['REABIERTO']);
      acumular(conteo, ['✓ RESUELTO', '-EN PROCESO']);
      const fila = filaDesdeConteo(conteo);
      expect(fila.otros).toBe(2);
      expect(fila.resuelto).toBe(1);
      expect(fila.total).toBe(3);
    });

    it('resolver baja la alerta porque lo resuelto no cuenta como abierto', () => {
      // El criterio pedido: "solo resuelto disminuye la alerta". Se comprueba
      // sobre el estado que ve el admin, no como transicion.
      const antes = conteoVacio();
      for (let i = 0; i < 4; i++) acumular(antes, ['-EN PROCESO']);
      expect(filaDesdeConteo(antes).nivel).toBe('critico');

      const despues = conteoVacio();
      for (let i = 0; i < 4; i++) acumular(despues, ['✓ RESUELTO', '-EN PROCESO']);
      const fila = filaDesdeConteo(despues);
      expect(fila.resuelto).toBe(4);
      expect(fila.abiertos).toBe(0);
      expect(fila.nivel).toBe('al_dia');
      // Resolver no borra el correo: siguen en la tabla.
      expect(fila.total).toBe(4);
    });

    it('una categoria desconocida suma al total sin generar alerta', () => {
      const conteo = conteoVacio();
      acumular(conteo, ['CASO OMISO']);
      acumular(conteo, ['-EN PROCESO']);
      const fila = filaDesdeConteo(conteo);
      expect(fila.otros).toBe(1);
      expect(fila.total).toBe(2);
      expect(fila.abiertos).toBe(1);
      expect(fila.nivel).toBe('estable');
    });

    it('empieza en al dia y en ceros', () => {
      const fila = filaDesdeConteo(conteoVacio());
      expect(fila.total).toBe(0);
      expect(fila.abiertos).toBe(0);
      expect(fila.nivel).toBe('al_dia');
    });

    it('totalCubos y abiertosCubos coinciden con la fila', () => {
      const conteo = conteoVacio();
      acumular(conteo, null);
      acumular(conteo, ['-EN PROCESO']);
      acumular(conteo, ['GESTIONADO']);
      expect(totalCubos(conteo)).toBe(3);
      expect(abiertosCubos(conteo)).toBe(2);
      expect(filaDesdeConteo(conteo).total).toBe(3);
      expect(filaDesdeConteo(conteo).abiertos).toBe(2);
    });
  });

  it('ETIQUETA_CUBO cubre exactamente los seis cubos', () => {
    expect(Object.keys(ETIQUETA_CUBO).sort()).toEqual(
      ['escalado', 'en_proceso', 'gestionado', 'otros', 'pendiente', 'resuelto'].sort(),
    );
  });
});