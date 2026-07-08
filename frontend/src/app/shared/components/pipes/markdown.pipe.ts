import { Pipe, PipeTransform } from '@angular/core';

// ─────────────────────────────────────────────────────────────────────────────
// MarkdownPipe
// Parser liviano de markdown → HTML seguro para los mensajes de la IA.
// Soporta: **negrita**, *cursiva*, - listas, párrafos separados por \n\n
// Se usa en el template con: [innerHTML]="msg.content | markdown"
// Solo aplicar en burbujas de la IA (ai-msg), nunca en mensajes del cliente.
// ─────────────────────────────────────────────────────────────────────────────
@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {
  transform(text: string): string {
    if (!text) return '';

    let html = text
      // Escapar HTML para evitar XSS antes de insertar nuestras etiquetas
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // ── Listas (líneas que empiezan con - o *) ───────────────────────────
    // Agrupa líneas consecutivas de lista en un <ul>
    html = html.replace(/((?:^[ \t]*[-*][ \t].+\n?)+)/gm, (block) => {
      const items = block
        .trim()
        .split('\n')
        .filter(l => l.trim())
        .map(l => `<li>${l.replace(/^[ \t]*[-*][ \t]/, '').trim()}</li>`)
        .join('');
      return `<ul>${items}</ul>`;
    });

    // ── Negritas **texto** ────────────────────────────────────────────────
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // ── Cursiva *texto* (solo si no fue negrita) ──────────────────────────
    html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    // ── Párrafos: doble salto de línea → <p> ─────────────────────────────
    html = html
      .split(/\n{2,}/)
      .map(block => block.trim())
      .filter(Boolean)
      .map(block => {
        // Si ya es un bloque de lista, no envolver en <p>
        if (block.startsWith('<ul>')) return block;
        // Saltos simples dentro de un párrafo → <br>
        return `<p>${block.replace(/\n/g, '<br>')}</p>`;
      })
      .join('');

    return html;
  }
}
