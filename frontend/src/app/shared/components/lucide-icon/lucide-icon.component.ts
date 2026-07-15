import { Component, Input, OnChanges } from '@angular/core';
import * as lucide from 'lucide';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

function iconNodeToHtml(node: lucide.IconNode): string {
  return node.map(([tag, attrs]) => {
    const attrStr = Object.entries(attrs)
      .map(([k, v]) => `${k}="${(v ?? '').toString().replace(/"/g, '&quot;')}"`)
      .join(' ');
    return `<${tag} ${attrStr}></${tag}>`;
  }).join('');
}

@Component({
  selector: 'lucide-icon',
  standalone: true,
  styles: [`
    :host{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;line-height:0;vertical-align:middle}
    :host-context(.spin){animation:lucideSpin 1s linear infinite}
    @keyframes lucideSpin{to{transform:rotate(360deg)}}
    svg{display:block}
  `],
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      [style.width.px]="size"
      [style.height.px]="size"
    >
      <g [innerHTML]="svgContent"></g>
    </svg>
  `
})
export class LucideIconComponent implements OnChanges {
  @Input() name: string = '';
  @Input() size: number = 18;
  svgContent: SafeHtml = '';

  constructor(private sanitizer: DomSanitizer) {}

  ngOnChanges(): void {
    const pascalName = this.name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    const icon = (lucide as any)[pascalName] as lucide.IconNode | undefined;
    if (icon) {
      this.svgContent = this.sanitizer.bypassSecurityTrustHtml(iconNodeToHtml(icon));
    }
  }
}
