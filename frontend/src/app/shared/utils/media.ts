const ARCHIVE_MIMES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-rar',
  'application/x-7z-compressed',
  'application/x-compressed',
]);

const AUDIO_ALIASES: Record<string, string> = {
  'audio/mp3': 'audio/mpeg',
  'audio/x-mp3': 'audio/mpeg',
  'audio/x-mpeg': 'audio/mpeg',
  'audio/x-m4a': 'audio/mp4',
  'audio/3gpp': 'audio/3gpp',
};

export function normalizeMimeType(value = ''): string {
  return value.toLowerCase().split(';')[0].trim();
}

export function extensionFromName(name = ''): string {
  const match = name.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? '';
}

export function isArchiveMime(mimeType: string): boolean {
  return ARCHIVE_MIMES.has(normalizeMimeType(mimeType));
}

export function isArchiveExtension(ext: string): boolean {
  return ['.zip', '.rar', '.7z'].includes(ext.toLowerCase());
}

export function isGenericOrEmptyMime(mimeType: string): boolean {
  const m = normalizeMimeType(mimeType);
  return m === '' || m === 'application/octet-stream';
}

function fourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function walkBoxes(
  view: DataView,
  start: number,
  end: number,
  visitor: (type: string, bodyStart: number, boxEnd: number) => void,
): void {
  let off = start;
  while (off + 8 <= end) {
    let size = view.getUint32(off);
    let header = 8;
    if (size === 1) {
      if (off + 16 > end) break;
      size = Number(view.getBigUint64(off + 8));
      header = 16;
    } else if (size === 0) {
      size = end - off;
    }
    if (size < header) break;
    const type = fourCC(view, off + 4);
    const boxEnd = off + size;
    if (boxEnd > end) break;
    visitor(type, off + header, boxEnd);
    if (boxEnd <= off) break;
    off = boxEnd;
  }
}

function mp4HasVideoTrack(view: DataView): boolean {
  let hasVideo = false;
  walkBoxes(view, 0, view.byteLength, (type, start, end) => {
    if (type !== 'moov' || hasVideo) return;
    walkBoxes(view, start, end, (trakType, trakStart, trakEnd) => {
      if (trakType !== 'trak' || hasVideo) return;
      walkBoxes(view, trakStart, trakEnd, (mdiaType, mdiaStart, mdiaEnd) => {
        if (mdiaType !== 'mdia' || hasVideo) return;
        walkBoxes(view, mdiaStart, mdiaEnd, (hdlrType, hdlrStart, hdlrEnd) => {
          if (hdlrType !== 'hdlr' || hasVideo) return;
          if (hdlrStart + 12 <= hdlrEnd) {
            const handler = fourCC(view, hdlrStart + 8);
            if (handler === 'vide') hasVideo = true;
          }
        });
      });
    });
  });
  return hasVideo;
}

function isMp4Container(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const bytes = new Uint8Array(reader.result as ArrayBuffer);
      if (bytes.length < 12) {
        resolve(false);
        return;
      }
      const four = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
      resolve(four === 'ftyp');
    };
    reader.onerror = () => resolve(false);
    reader.readAsArrayBuffer(file.slice(0, 16));
  });
}

async function isAudioOnlyMp4(file: File): Promise<boolean> {
  try {
    if (!(await isMp4Container(file))) return false;
    const buf = await file.arrayBuffer();
    const view = new DataView(buf);
    return !mp4HasVideoTrack(view);
  } catch {
    return false;
  }
}

/**
 * Normaliza el archivo antes de subirlo:
 * - Alias de audio (audio/mp3, audio/x-m4a) → mime estándar.
 * - MP4 solo de audio (reportado como video/mp4 por el navegador) → audio/mp4,
 *   para que se renderice como nota de voz con ondas y no como video.
 */
export async function normalizeUploadFile(file: File): Promise<File> {
  const mime = normalizeMimeType(file.type);

  if (AUDIO_ALIASES[mime]) {
    return new File([file], file.name, { type: AUDIO_ALIASES[mime] });
  }

  if (mime.startsWith('video/')) {
    const audioOnly = await isAudioOnlyMp4(file);
    if (audioOnly) {
      return new File([file], file.name, { type: 'audio/mp4' });
    }
  }

  return file;
}
