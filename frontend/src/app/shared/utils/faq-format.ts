function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function processInline(text: string): string {
  return inlineFormat(escapeHtml(text));
}

type Block =
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'p'; lines: string[] }
  | { type: 'hr' }
  | { type: 'heading'; level: number; text: string };

function flushParagraph(lines: string[], blocks: Block[]): void {
  if (lines.length === 0) return;
  blocks.push({ type: 'p', lines: [...lines] });
  lines.length = 0;
}

function flushUl(items: string[], blocks: Block[]): void {
  if (items.length === 0) return;
  blocks.push({ type: 'ul', items: [...items] });
  items.length = 0;
}

function flushOl(items: string[], blocks: Block[]): void {
  if (items.length === 0) return;
  blocks.push({ type: 'ol', items: [...items] });
  items.length = 0;
}

function flushLists(ulItems: string[], olItems: string[], blocks: Block[]): void {
  flushUl(ulItems, blocks);
  flushOl(olItems, blocks);
}

function getIndent(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].replace(/\t/g, '  ').length : 0;
}

export function formatFaqText(text: string): string {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  const paraLines: string[] = [];
  let ulItems: string[] = [];
  let olItems: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = getIndent(line);

    // Empty line: flush everything
    if (trimmed === '') {
      flushLists(ulItems, olItems, blocks);
      flushParagraph(paraLines, blocks);
      continue;
    }

    // Separator: ---
    if (/^-{3,}$/.test(trimmed)) {
      flushLists(ulItems, olItems, blocks);
      flushParagraph(paraLines, blocks);
      blocks.push({ type: 'hr' });
      continue;
    }

    // Heading: ## text
    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      flushLists(ulItems, olItems, blocks);
      flushParagraph(paraLines, blocks);
      const level = trimmed.match(/^(#{1,3})/)![1].length;
      blocks.push({ type: 'heading', level, text: headingMatch[1] });
      continue;
    }

    // Unordered list: * item (with optional indent)
    const ulMatch = trimmed.match(/^(\*)\s+(.+)$/);
    if (ulMatch) {
      flushOl(olItems, blocks);
      flushParagraph(paraLines, blocks);
      const itemText = ulMatch[2].trim();
      ulItems.push(processInline(itemText));
      continue;
    }

    // Ordered list: 1. item (with optional indent)
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      flushUl(ulItems, blocks);
      flushParagraph(paraLines, blocks);
      const itemText = olMatch[2].trim();
      olItems.push(processInline(itemText));
      continue;
    }

    // Regular text line: accumulate into paragraph
    flushLists(ulItems, olItems, blocks);
    paraLines.push(line);
  }

  // Flush remaining
  flushLists(ulItems, olItems, blocks);
  flushParagraph(paraLines, blocks);

  // Render blocks to HTML
  let html = '';
  for (const block of blocks) {
    switch (block.type) {
      case 'hr':
        html += '<hr class="faq-separator">';
        break;
      case 'heading': {
        const cls = 'faq-h' + block.level;
        html += '<div class="' + cls + '">' + processInline(block.text) + '</div>';
        break;
      }
      case 'ul':
        html += '<ul>' + block.items.map(li => '<li>' + li + '</li>').join('') + '</ul>';
        break;
      case 'ol':
        html += '<ol>' + block.items.map(li => '<li>' + li + '</li>').join('') + '</ol>';
        break;
      case 'p': {
        const inner = block.lines.map(l => processInline(l.trim())).join('<br>');
        html += '<p>' + inner + '</p>';
        break;
      }
    }
  }

  return html;
}
