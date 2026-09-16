import { describe, it, expect } from 'vitest';
import {
  formatMessageContent,
  isHtmlContentLike,
  secureMessageHtml,
} from './message-format';

describe('message-format (renderizado de burbujas)', () => {
  describe('ticket de atención (flujo real del backend)', () => {
    const ticket = [
      'Queremos informarle que su solicitud es importante para nosotros. Para brindarle una respuesta precisa y adecuada, nuestro equipo requiere realizar una **validación e investigación interna** con el área correspondiente.',
      '',
      'Por este motivo, se ha generado un **ticket de atención** para realizar el seguimiento de su solicitud:',
      '',
      '**INFORMACIÓN DEL TICKET**',
      '',
      '1. **Código:** T-2026-001',
      '2. **Prioridad:** Alta',
      '3. **Tiempo estimado de resolución:** 24 horas',
      '',
      'Nuestro equipo especializado realizará las validaciones correspondientes. Una vez contemos con la información necesaria, nos pondremos en contacto con usted a través de los datos registrados en el formulario inicial.',
      '',
      'Agradecemos su paciencia y comprensión mientras adelantamos este proceso.',
    ].join('\n');

    it('genera cabeceras destacadas (.mb-heading) y lista numerada <ol> con negritas', () => {
      const html = formatMessageContent(ticket);
      expect(html).toBe(
        '<p>Queremos informarle que su solicitud es importante para nosotros. Para brindarle una respuesta precisa y adecuada, nuestro equipo requiere realizar una <strong>validación e investigación interna</strong> con el área correspondiente.</p>' +
          '<p>Por este motivo, se ha generado un <strong>ticket de atención</strong> para realizar el seguimiento de su solicitud:</p>' +
          '<p class="mb-heading"><strong>INFORMACIÓN DEL TICKET</strong></p>' +
          '<ol><li><strong>Código:</strong> T-2026-001</li>' +
          '<li><strong>Prioridad:</strong> Alta</li>' +
          '<li><strong>Tiempo estimado de resolución:</strong> 24 horas</li></ol>' +
          '<p>Nuestro equipo especializado realizará las validaciones correspondientes. Una vez contemos con la información necesaria, nos pondremos en contacto con usted a través de los datos registrados en el formulario inicial.</p>' +
          '<p>Agradecemos su paciencia y comprensión mientras adelantamos este proceso.</p>',
      );
    });

    it('la estructura generada es la que estiliza el CSS de las burbujas', () => {
      const html = formatMessageContent(ticket);
      expect(html).toContain('<p class="mb-heading">');
      expect(html).toContain('<ol>');
      expect(html).toContain('<li><strong>Código:</strong>');
      expect(html).not.toContain('**INFORMACIÓN DEL TICKET**');
      expect(html).not.toContain('1. **Código:**');
    });
  });

  describe('cabeceras destacadas', () => {
    it('convierte "# Sección" en <p class="mb-heading">', () => {
      expect(formatMessageContent('# INFORMACIÓN\n\nDetalle')).toBe(
        '<p class="mb-heading"><strong>INFORMACIÓN</strong></p><p>Detalle</p>',
      );
    });

    it('admite hasta 4 niveles de #', () => {
      expect(formatMessageContent('#### Sección')).toBe(
        '<p class="mb-heading"><strong>Sección</strong></p>',
      );
      expect(formatMessageContent('###### Sección')).toBe('<p>###### Sección</p>');
    });

    it('un párrafo de solo **negrita** genera cabecera con más aire', () => {
      expect(formatMessageContent('**INFORMACIÓN DEL TICKET**\n\nasunto: x')).toBe(
        '<p class="mb-heading"><strong>INFORMACIÓN DEL TICKET</strong></p><p>asunto: x</p>',
      );
    });

    it('la negrita dentro de una frase NO genera cabecera', () => {
      expect(formatMessageContent('Esto es **muy** importante')).toBe(
        '<p>Esto es <strong>muy</strong> importante</p>',
      );
    });
  });

  describe('listas', () => {
    it('agrupa una lista numerada con salto simple en UN solo <ol>', () => {
      expect(formatMessageContent('1. Primero\n2. Segundo\n\n3. Tercero\n4. Cuarto')).toBe(
        '<ol><li>Primero</li><li>Segundo</li><li>Tercero</li><li>Cuarto</li></ol>',
      );
    });

    it('convierte viñetas en <ul>', () => {
      expect(formatMessageContent('- Rojo\n- Verde\n- Azul')).toBe(
        '<ul><li>Rojo</li><li>Verde</li><li>Azul</li></ul>',
      );
    });

    it('no rompe el conteo de una lista separada por dos saltos', () => {
      expect(formatMessageContent('1. A\n\n\n2. B')).toBe(
        '<ol><li>A</li></ol><ol><li>B</li></ol>',
      );
    });
  });

  describe('formato inline', () => {
    it('combina negrita, código en línea, link markdown y URL en bruto', () => {
      const html = formatMessageContent(
        '**Importante**: usa `npm` y visita [Docs](https://docs.example.com) o https://sian.edu.co',
      );
      expect(html).toBe(
        '<p><strong>Importante</strong>: usa <code>npm</code> y visita <a href="https://docs.example.com" target="_blank" rel="noopener noreferrer">Docs</a> o <a href="https://sian.edu.co" target="_blank" rel="noopener noreferrer">https://sian.edu.co</a></p>',
      );
    });

    it('no re-envuelve con <a> los links ya generados', () => {
      const html = formatMessageContent('[Docs](https://docs.example.com)');
      expect(html.match(/<a /g)?.length).toBe(1);
    });

    it('convierte cursiva (*texto* y _texto_)', () => {
      expect(formatMessageContent('Hola _mundo_ y *texto*')).toBe(
        '<p>Hola <em>mundo</em> y <em>texto</em></p>',
      );
    });

    it('aplica [color:...]', () => {
      expect(formatMessageContent('[color:rojo]Urgente[/color]')).toBe(
        '<p><span style="color:#ef4444">Urgente</span></p>',
      );
    });
  });

  describe('párrafos', () => {
    it('une líneas consecutivas con <br> en un solo <p>', () => {
      expect(formatMessageContent('Hola mundo\ncómo estás')).toBe(
        '<p>Hola mundo<br>cómo estás</p>',
      );
    });

    it('separa párrafos con salto de línea', () => {
      expect(formatMessageContent('A\n\nB')).toBe('<p>A</p><p>B</p>');
    });

    it('una sola línea "Etiqueta: valor" NO genera <ol>', () => {
      expect(formatMessageContent('Asunto: solo')).toBe('<p>Asunto: solo</p>');
    });

    it('bloques de código ``` ... ``` generan <pre><code>', () => {
      expect(formatMessageContent('```\nconst a = 1;\n```')).toBe(
        '<pre><code>const a = 1;</code></pre>',
      );
    });
  });

  describe('seguridad del HTML', () => {
    it('HTML ya renderizado pasa limpio y sin atributos peligrosos', () => {
      const html = formatMessageContent('<p onclick="x">Hola <strong>mundo</strong></p>');
      expect(html).toBe('<p data-blocked="x">Hola <strong>mundo</strong></p>');
      expect(secureMessageHtml('<script>alert(1)</script>')).not.toMatch(/<script/i);
    });

    it('detecta contenido HTML', () => {
      expect(isHtmlContentLike('<strong>x</strong>')).toBe(true);
      expect(isHtmlContentLike('**x**')).toBe(false);
    });

    it('maneja texto vacío', () => {
      expect(formatMessageContent('')).toBe('');
      expect(formatMessageContent('\n\n')).toBe('');
    });
  });
});