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

    // empty line — flush list, add paragraph break
    if (line === '') {
      flushList();
      // if next line is not empty and not a list item, wrap in <p>
      const next = lines[i + 1];
      if (next && next.trimStart().indexOf('* ') !== 0 && next.trim() !== '') {
        html += '</p>\n<p>';
      }
      continue;
    }

    // list item
    if (line.trimStart().indexOf('* ') === 0) {
      flushList();
      inList = true;
      const itemText = line.trimStart().slice(2).trim();
      listItems.push(inlineFormat(itemText));
      continue;
    }

    // if we were in a list, flush it before continuing
    if (inList) {
      flushList();
    }

    // regular paragraph line
    const isFirst = i === 0;
    const prev = lines[i - 1];
    const prevEmpty = prev === undefined || prev.trim() === '';
    const nextLine = lines[i + 1];
    const nextEmpty = !nextLine || nextLine.trim() === '';

    if (prevEmpty && nextEmpty) {
      html += '<p>' + inlineFormat(line) + '</p>\n';
    } else if (prevEmpty) {
      html += '<p>' + inlineFormat(line);
    } else if (nextEmpty) {
      html += '<br>' + inlineFormat(line) + '</p>\n';
    } else {
      html += '<br>' + inlineFormat(line);
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
