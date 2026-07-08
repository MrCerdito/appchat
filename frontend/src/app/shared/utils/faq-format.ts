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
  let inList = false;
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length > 0) {
      html += '<ul>\n' + listItems.map(li => '  <li>' + li + '</li>\n').join('') + '</ul>\n';
      listItems = [];
    }
    inList = false;
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (line === '') {
      flushList();
      const next = lines[i + 1];
      if (next && next.trimStart().indexOf('* ') !== 0 && next.trim() !== '') {
        html += '</p>\n<p>';
      }
      continue;
    }

    if (line.trimStart().indexOf('* ') === 0) {
      flushList();
      inList = true;
      const itemText = line.trimStart().slice(2).trim();
      listItems.push(inlineFormat(escapeHtml(itemText)));
      continue;
    }

    if (inList) {
      flushList();
    }

    const isFirst = i === 0;
    const prev = lines[i - 1];
    const prevEmpty = prev === undefined || prev.trim() === '';
    const nextLine = lines[i + 1];
    const nextEmpty = !nextLine || nextLine.trim() === '';

    if (prevEmpty && nextEmpty) {
      html += '<p>' + inlineFormat(escapeHtml(line)) + '</p>\n';
    } else if (prevEmpty) {
      html += '<p>' + inlineFormat(escapeHtml(line));
    } else if (nextEmpty) {
      html += '<br>' + inlineFormat(escapeHtml(line)) + '</p>\n';
    } else {
      html += '<br>' + inlineFormat(escapeHtml(line));
    }
  }

  flushList();
  return html;
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
    );
}
