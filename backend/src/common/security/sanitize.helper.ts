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
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeOutboundText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return cleanText(value, maxLength);
}

export function sanitizeFileName(value: unknown, mimeType = ''): string {
  const fallback = `archivo${mimeType ? '.' + mimeType.split('/')[1] : ''}`;
  const raw = typeof value === 'string' ? value : fallback;
  return raw
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001F\u007F<>:"|?*]/g, '-')
    .trim() || fallback;
}
