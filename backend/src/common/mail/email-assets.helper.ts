import { access, readFile } from 'fs/promises';
import { join, normalize, resolve, sep } from 'path';

const UPLOADS_ROOT = resolve(process.cwd(), 'uploads');

export interface SmtpAttachment {
  filename: string;
  path: string;
  cid: string;
  contentType?: string;
}

export interface ResendAttachment {
  content: string;
  filename: string;
  contentId: string;
}

export interface InlineImageResult {
  html: string;
  smtpAttachments: SmtpAttachment[];
  resendAttachments: ResendAttachment[];
}

/**
 * Normaliza elementos HTML comunes para que se vean bien en clientes de
 * correo (Outlook, Gmail): agrega estilos inline (los clientes no confian en
 * <style>) solo cuando el elemento no trae su propio style.
 */
export function emailificarHtml(html: string): string {
  let out = html;
  const addStyle = (tag: string, style: string) => {
    const re = new RegExp(`(<${tag})(?![^>]*\\bstyle=)`, 'gi');
    out = out.replace(re, `$1 style="${style}"`);
  };
  addStyle('ul', 'margin:0 0 12px;padding-left:22px;line-height:1.6;');
  addStyle('ol', 'margin:0 0 12px;padding-left:22px;line-height:1.6;');
  addStyle('li', 'margin:0 0 6px;line-height:1.6;');
  addStyle('p', 'margin:0 0 12px;');
  addStyle('a', 'color:#2563eb;text-decoration:underline;');
  addStyle('h1', 'margin:0 0 10px;');
  addStyle('h2', 'margin:0 0 10px;');
  addStyle('h3', 'margin:0 0 10px;');
  addStyle('h4', 'margin:0 0 10px;');
  addStyle('h5', 'margin:0 0 10px;');
  addStyle('h6', 'margin:0 0 10px;');
  out = out.replace(
    /(<img)(?![^>]*\bstyle=)(?![^>]*\bsrc="cid:)/gi,
    '$1 style="max-width:100%;height:auto;border:0;display:inline-block;"',
  );
  return out;
}

/**
 * Convierte imagenes locales (/uploads/...) en adjuntos inline (cid:) para
 * que lleguen incrustadas en el correo, sin depender de URL publicas ni del
 * boton "mostrar imagenes" del cliente de correo. Las URLs que no apunten a
 * archivos existentes se dejan tal cual (fallback a URL absoluta).
 */
export async function embedInlineImages(
  html: string,
): Promise<InlineImageResult> {
  const matches = [
    ...html.matchAll(
      /(src|poster)="((?:https?:\/\/[^"]*\/uploads\/|\/uploads\/)([^"]+))"/g,
    ),
  ];
  if (!matches.length)
    return { html, smtpAttachments: [], resendAttachments: [] };

  const seen = new Set<string>();
  const replacements = new Map<string, string>();
  const smtpAttachments: SmtpAttachment[] = [];
  const resendAttachments: ResendAttachment[] = [];
  let index = 0;

  for (const m of matches) {
    const url = m[2];
    const rel = m[3];
    if (seen.has(rel)) continue;
    seen.add(rel);

    const safe = normalize(rel)
      .replace(/^(\.\.[/\\])+/, '')
      .replace(/^[/\\]+/, '');
    const filePath = resolve(UPLOADS_ROOT, safe);
    const rootWithSep = UPLOADS_ROOT.endsWith(sep)
      ? UPLOADS_ROOT
      : UPLOADS_ROOT + sep;
    if (!filePath.startsWith(rootWithSep)) continue;

    try {
      await access(filePath);
    } catch {
      continue;
    }

    let buffer: Buffer | null = null;
    try {
      buffer = await readFile(filePath);
    } catch {
      continue;
    }

    index += 1;
    const cid = `rc_email_img_${index}@reportacasos`;
    const filename = safe.split(/[\\/]/).pop() || 'imagen.png';
    const ext = (filename.match(/\.([a-zA-Z0-9]+)$/) || [
      '',
      'png',
    ])[1].toLowerCase();
    const contentType = ext === 'jpg' ? 'image/jpeg' : `image/${ext || 'png'}`;

    smtpAttachments.push({ filename, path: filePath, cid, contentType });
    resendAttachments.push({
      content: buffer.toString('base64'),
      filename,
      contentId: cid,
    });
    replacements.set(url, `cid:${cid}`);
  }

  let out = html;
  for (const [url, cid] of replacements) {
    out = out.split(`"${url}"`).join(`"${cid}"`);
  }

  return { html: out, smtpAttachments, resendAttachments };
}
