import sanitizeHtml from 'sanitize-html';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function sanitizeMessage(value: string, maxLength = 1000): string {
  return sanitizeHtml(String(value ?? ''), {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
    exclusiveFilter: () => true,
  })
    .replace(CONTROL_CHARS, '')
    .replace(/\s+\n/g, '\n')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeSenderName(value: string, maxLength = 80): string {
  const name = sanitizeHtml(String(value ?? ''), {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
    exclusiveFilter: () => true,
  })
    .replace(/[<>`"'\\]/g, '')
    .replace(CONTROL_CHARS, '')
    .trim()
    .slice(0, maxLength);
  return name || 'Usuario';
}

export function cleanText(value: unknown, maxLength = 4096): string {
  if (typeof value !== 'string') return '';
  return sanitizeHtml(value, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
    exclusiveFilter: () => true,
  })
    .replace(CONTROL_CHARS, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeOutboundText(
  value: unknown,
  maxLength: number,
): string {
  if (typeof value !== 'string') return '';
  return cleanText(value, maxLength);
}

const EMAIL_STYLE_RE = {
  color: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/],
  background: [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/, /^none$/i],
  'background-color': [/^#[0-9a-fA-F]{3,8}$/, /^rgb\(/, /^rgba\(/],
  'font-size': [/^\d+(\.\d+)?(px|pt|em|rem|%)$/],
  'font-family': [/^[a-zA-Z\s,'"-]+$/],
  'font-weight': [/^(\d+|bold|normal)$/],
  'font-style': [/^(normal|italic|oblique)$/],
  'text-align': [/^(left|right|center|justify)$/],
  'text-decoration': [/^[a-z\s]+$/],
  'line-height': [/^[\d.]+(px|em|rem|%)?$/],
  padding: [/^[\d.]+(px|em|rem|%)?(\s+[\d.]+(px|em|rem|%)?)*$/],
  margin: [/^[\d.]+(px|em|rem|%)?(\s+[\d.]+(px|em|rem|%)?)*$/],
  'border-radius': [/^\d+(px|%)?(\s+\d+(px|%)?)*$/],
  border: [/^[\d.\s]+(px|em|rem)?(\s+(solid|dashed|dotted|none))?(\s+#[0-9a-fA-F]{3,8})?$/],
  'border-top': [/^[\d.\s]+(px|em|rem)?(\s+(solid|dashed|dotted|none))?(\s+#[0-9a-fA-F]{3,8})?$/],
  'max-width': [/^\d+(px|%)?$/],
  width: [/^\d+(px|%)?$/],
  height: [/^\d+(px|%)?$/],
  display: [/^(block|inline|inline-block|none|table)$/],
  'vertical-align': [/^(top|middle|bottom|baseline)$/],
  'letter-spacing': [/^[\d.]+px$/],
  'word-break': [/^(normal|break-all|break-word)$/],
};

const EMAIL_EXCLUDED = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'style',
]);

/**
 * Sanea HTML de correo: permite etiquetas/atributos/estilos aptos para
 * clientes de correo y elimina contenido peligroso (script, iframe, on*,
 * javascript:). Conserva tokens {{...}} y atributos data-sb (round-trip del
 * editor visual).
 */
export function sanitizeEmailHtml(value: unknown, maxLength = 200000): string {
  if (typeof value !== 'string') return '';
  return sanitizeHtml(value, {
    allowedTags: [
      'html',
      'head',
      'body',
      'meta',
      'title',
      'p',
      'div',
      'span',
      'br',
      'hr',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'b',
      'strong',
      'i',
      'em',
      'u',
      's',
      'strike',
      'small',
      'big',
      'sub',
      'sup',
      'mark',
      'a',
      'img',
      'table',
      'thead',
      'tbody',
      'tfoot',
      'tr',
      'td',
      'th',
      'caption',
      'col',
      'colgroup',
      'ul',
      'ol',
      'li',
      'blockquote',
      'pre',
      'code',
      'center',
      'font',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'title'],
      img: ['src', 'alt', 'width', 'height', 'align', 'title'],
      table: ['width', 'cellpadding', 'cellspacing', 'border', 'align', 'bgcolor', 'style'],
      td: ['width', 'colspan', 'rowspan', 'align', 'valign', 'bgcolor', 'style'],
      th: ['width', 'colspan', 'rowspan', 'align', 'valign', 'bgcolor', 'style'],
      tr: ['align', 'valign', 'bgcolor', 'style'],
      tbody: ['align', 'valign', 'style'],
      tfoot: ['align', 'valign', 'style'],
      thead: ['align', 'valign', 'style'],
      col: ['width', 'span', 'style'],
      colgroup: ['span', 'style'],
      div: ['align', 'style'],
      p: ['align', 'style'],
      span: ['style'],
      h1: ['align', 'style'],
      h2: ['align', 'style'],
      h3: ['align', 'style'],
      h4: ['align', 'style'],
      h5: ['align', 'style'],
      h6: ['align', 'style'],
      ul: ['style'],
      ol: ['style'],
      li: ['style'],
      font: ['color', 'size', 'face'],
      blockquote: ['style'],
      center: ['style'],
      '*': ['data-sb', 'data-sb-id'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedStyles: { '*': EMAIL_STYLE_RE },
    disallowedTagsMode: 'discard',
    exclusiveFilter: (frame) =>
      EMAIL_EXCLUDED.has(String(frame.tag || '').toLowerCase()) ||
      Object.keys(frame.attribs || {}).some((a) =>
        a.toLowerCase().startsWith('on'),
      ),
    textFilter: (text) =>
      text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' '),
  })
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, maxLength);
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/g, 'n')
    .replace(/Ñ/g, 'N');
}

export function sanitizeFileName(value: unknown, mimeType = ''): string {
  const fallback = `archivo${mimeType ? '.' + mimeType.split('/')[1] : ''}`;
  const raw = typeof value === 'string' ? value : fallback;
  return (
    raw
      .split(/[\\/]/)
      .pop()
      ?.replace(/[\u0000-\u001F\u007F<>:"|?*]/g, '-')
      .trim() || fallback
  );
}
