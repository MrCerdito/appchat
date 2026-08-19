function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatFaqText(text: string): string {
  let html = '';
  const lines = text.split('\n');
  let ulItems: string[] = [];
  let olItems: string[] = [];

  function flushUl() {
    if (ulItems.length > 0) {
      html += '<ul>' + ulItems.map(li => '<li>' + li + '</li>').join('') + '</ul>';
      ulItems = [];
    }
  }

  function flushOl() {
    if (olItems.length > 0) {
      html += '<ol>' + olItems.map(li => '<li>' + li + '</li>').join('') + '</ol>';
      olItems = [];
    }
  }

  function flushLists() {
    flushUl();
    flushOl();
  }

  function isNextBlockBreak(nextLine: string | undefined): boolean {
    if (!nextLine) return true;
    const t = nextLine.trim();
    if (t === '') return true;
    if (t.indexOf('* ') === 0) return true;
    if (/^\d+\.\s/.test(t)) return true;
    if (/^-{3,}$/.test(t)) return true;
    if (/^#{1,3}\s/.test(t)) return true;
    return false;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const trimmed = line.trimStart();

    if (line === '') {
      flushLists();
      continue;
    }

    if (/^-{3,}$/.test(trimmed)) {
      flushLists();
      html += '<hr>';
      continue;
    }

    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      flushLists();
      html += '<span class="faq-answer-heading">' + inlineFormat(escapeHtml(headingMatch[1])) + '</span>';
      continue;
    }

    if (trimmed.indexOf('* ') === 0) {
      flushOl();
      const itemText = trimmed.slice(2).trim();
      ulItems.push(inlineFormat(escapeHtml(itemText)));
      continue;
    }

    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      flushUl();
      const itemText = olMatch[2].trim();
      olItems.push(inlineFormat(escapeHtml(itemText)));
      continue;
    }

    flushLists();

    const prev = lines[i - 1];
    const prevEmpty = prev === undefined || prev.trim() === '';
    const nextLine = lines[i + 1];
    const nextEmpty = isNextBlockBreak(nextLine);

    if (prevEmpty && nextEmpty) {
      html += '<p>' + inlineFormat(escapeHtml(line)) + '</p>';
    } else if (prevEmpty) {
      html += '<p>' + inlineFormat(escapeHtml(line));
    } else if (nextEmpty) {
      html += inlineFormat(escapeHtml(line)) + '</p>';
    } else {
      html += '<br>' + inlineFormat(escapeHtml(line));
    }
  }

  flushLists();
  return html;
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(
      /((https?:\/\/|www\.)[^\s<]+)/g,
      (match) => {
        const url = match.startsWith('www.') ? `https://${match}` : match;
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + match + '</a>';
      }
    );
}
