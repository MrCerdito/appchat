// ─────────────────────────────────────────────────────────────────────────────
// message-format.ts
// Renderizador compartido de mensajes del chat (Markdown → HTML semántico).
// Único punto de procesamiento usado por chat del cliente, chat del asesor,
// historial, panel interno de WhatsApp y módulo de operaciones.
//
// Comportamiento:
//  - Si el contenido ya es HTML, se limpia y se devuelve tal cual (compatibilidad).
//  - Si es texto plano/Markdown, se convierte a HTML con etiquetas semánticas:
//    <ol>/<ul>/<li>, <p>, <strong>, <em>, <code>/<pre>, <a>, [color:...].
//  - Las listas con un único salto de línea entre elementos se agrupan en una
//    SOLA <ol>/<ul> (evita "1." repetidos y elementos vacíos).
//  - No se generan <br> vacíos ni nuevos elementos a partir de saltos de línea.
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, string> = {
  rojo: '#ef4444',
  verde: '#10b981',
  azul: '#3b82f6',
  naranja: '#f97316',
  morado: '#8b5cf6',
  amarillo: '#eab308',
};

const NUMBERED_LIST_RE = /^\s*\d{1,3}[.)]\s+/;
const BULLET_RE = /^\s*[-•*▪‣]\s+/;
const BLANK_RE = /^\s*$/;
const FENCE_RE = /^```/;
const HEADING_RE = /^#{1,4}\s+/;
const FIELD_RE = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9][A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 ]{0,40}:\s.+/;
const FIELD_LINE_MAX = 140;

/** Determina si el texto parece HTML ya renderizado (para passthrough seguro). */
export function isHtmlContentLike(text: string): boolean {
  return /<(strong|b|ul|ol|li|div|p|br|span)[\s>]/i.test(text);
}

/** Limpia HTML existente eliminando etiquetas/atributos peligrosos y todo
 *  estilo inline (color, fondo, tamaño, etc.) para que las burbujas muestren
 *  SIEMPRE el color de texto de su tema (p. ej. blanco sobre el gradiente del
 *  asesor) aunque el contenido venga pegado desde Teams u otra app. Además
 *  convierte en enlaces clicables las URLs sueltas (https:// y www.). */
export function secureMessageHtml(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<\s*(script|iframe|object|embed)/gi, '&lt;$1')
    .replace(/\son[a-z]+\s*=/gi, ' data-blocked=')
    .replace(/\sstyle\s*=\s*(".*?"|'.*?'|[^\s>]*)/gi, '')
    .replace(/javascript:/gi, '');
  return linkifyPlainUrls(cleaned);
}

/** Convierte URLs sueltas en <a> SOLO dentro de nodos de texto, sin tocar
 *  atributos ni etiquetas (p. ej. "Unirse: https://teams.microsoft.com/..."). */
function linkifyPlainUrls(text: string): string {
  if (!/https?:\/\/|www\./i.test(text)) return text;
  const URL_RE = /(?:https?:\/\/|www\.)[^\s<"']+/gi;
  return text
    .split(/(<[^>]+>)/g)
    .map((part) =>
      part.startsWith('<')
        ? part
        : part.replace(URL_RE, (match) => {
            const href = match.startsWith('www.') ? `https://${match}` : match;
            return `<a href="${href}" target="_blank" rel="noopener noreferrer">${match}</a>`;
          }),
    )
    .join('');
}

/** Punto de entrada: formatea cualquier contenido de mensaje como HTML seguro. */
export function formatMessageContent(text: string): string {
  if (!text) return '';
  if (isHtmlContentLike(text)) return secureMessageHtml(text);
  return markdownToHtml(text);
}

// Cache de renderizado por contenido. Evita que Angular reescriba el innerHTML
// de las burbujas en cada ciclo de detección de cambios (lo que borraba la
// seleccion del usuario al intentar copiar un mensaje).
const FORMAT_CACHE_MAX = 600;
const formatCache = new Map<string, string>();

/** Igual a formatMessageContent pero con cache: mismo contenido → misma
 *  referencia de string, asi el binding [innerHTML] no se vuelve a escribir. */
export function memoFormatMessageContent(text: string): string {
  const key = text ?? '';
  const cached = formatCache.get(key);
  if (cached !== undefined) return cached;
  const html = formatMessageContent(key);
  if (formatCache.size >= FORMAT_CACHE_MAX) formatCache.clear();
  formatCache.set(key, html);
  return html;
}

// ── Markdown → HTML ────────────────────────────────────────────────────────

function markdownToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;

  const listKindOf = (line: string): 'ol' | 'ul' | null => {
    if (NUMBERED_LIST_RE.test(line)) return 'ol';
    if (BULLET_RE.test(line)) return 'ul';
    return null;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Saltos de línea sobrantes: se descartan (no crean elementos vacíos).
    if (BLANK_RE.test(line)) {
      i++;
      continue;
    }

    // Bloques de código (```...```).
    if (FENCE_RE.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // cierre (si existe)
      out.push(`<pre><code>${buf.join('\n')}</code></pre>`);
      continue;
    }

    // Listas numeradas o con viñetas.
    const kind = listKindOf(line);
    if (kind) {
      const items: string[] = [];
      let blankAbsorbed = false;
      while (i < lines.length) {
        const l = lines[i];
        const k = listKindOf(l);
        if (k === kind) {
          blankAbsorbed = false;
          items.push(stripListMarker(l));
          i++;
          continue;
        }
        if (BLANK_RE.test(l)) {
          // Un solo salto de línea entre elementos mantiene la misma lista;
          // dos o más lo separan en otro bloque.
          if (blankAbsorbed) break;
          blankAbsorbed = true;
          i++;
          continue;
        }
        break;
      }
      out.push(
        `<${kind}>${items.map(it => `<li>${inlineFormat(it.trim())}</li>`).join('')}</${kind}>`,
      );
      continue;
    }

    // Títulos / secciones destacadas (# ... → negrita destacada).
    if (HEADING_RE.test(line)) {
      const content = line.replace(HEADING_RE, '').trim();
      out.push(`<p class="mb-heading"><strong>${inlineFormat(content)}</strong></p>`);
      i++;
      continue;
    }

    // Campos "Etiqueta: valor" → <ol> auto-numerada (estilo ticket).
    // Solo cuando hay >= 2 líneas cortas consecutivas (permite un salto simple
    // entre ellas); dos o más saltos las separan en párrafos normales.
    if (isFieldLine(line)) {
      const fields: string[] = [line];
      let j = i + 1;
      let blanks = 0;
      let consumed = i + 1;
      while (j < lines.length) {
        const l = lines[j];
        if (BLANK_RE.test(l)) {
          blanks++;
          if (blanks > 1) break;
          j++;
          continue;
        }
        if (isFieldLine(l)) {
          fields.push(l);
          blanks = 0;
          consumed = j + 1;
          j++;
          continue;
        }
        break;
      }
      if (fields.length >= 2) {
        out.push(
          `<ol>${fields
            .map(f => `<li>${inlineFormat(f.trim())}</li>`)
            .join('')}</ol>`,
        );
        i = consumed;
        continue;
      }
      // Menos de 2 campos: cae en el párrafo normal de más abajo.
    }

    // Párrafo: se agrupa hasta un bloque distinto.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i];
      if (BLANK_RE.test(l)) break;
      if (FENCE_RE.test(l) || HEADING_RE.test(l) || listKindOf(l)) break;
      para.push(l);
      i++;
    }
    // Párrafo formado únicamente por **texto en negrita** → cabecera destacada
    // (p. ej. "**INFORMACIÓN DEL TICKET**"): gana aire con .mb-heading.
    if (
      para.length === 1 &&
      /^\s*\*\*[^*\n]+\*\*\s*$/.test(para[0]) &&
      !BLANK_RE.test(para[0])
    ) {
      out.push(
        `<p class="mb-heading">${inlineFormat(para[0].trim())}</p>`,
      );
    } else {
      out.push(`<p>${para.map(l => inlineFormat(l)).join('<br>')}</p>`);
    }
  }

  return out.join('');
}

function stripListMarker(line: string): string {
  return line.replace(NUMBERED_LIST_RE, '').replace(BULLET_RE, '');
}

function isFieldLine(line: string): boolean {
  const t = line.trim();
  return t.length >= 3 && t.length <= FIELD_LINE_MAX && FIELD_RE.test(t);
}

function inlineFormat(line: string): string {
  return line
    // Código en línea `...`
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Negrita **texto**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Cursiva *texto* o _texto_
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=\s|$|[.!?;,)\]])/g, '$1<em>$2</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=\s|$|[.!?;,)\]])/g, '$1<em>$2</em>')
    // Color [color:...]texto[/color]
    .replace(
      /\[color:(rojo|verde|azul|naranja|morado|amarillo)\]([\s\S]*?)\[\/color\]/g,
      (_, c, inner) => `<span style="color:${COLOR_MAP[c]}">${inner}</span>`,
    )
    // Enlaces [texto](url)
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    // Prefijo link:https://...
    .replace(
      /link:((?:https?:\/\/|www\.)[^\s<]+)/gi,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>',
    )
    // URLs en bruto
    .replace(
      /(?<!href=")((?:https?:\/\/|www\.)[^\s<]+)/g,
      (match) => {
        const url = match.startsWith('www.') ? `https://${match}` : match;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${match}</a>`;
      },
    );
}