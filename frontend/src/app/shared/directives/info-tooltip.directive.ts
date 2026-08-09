import {
  Directive,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
} from '@angular/core';

@Directive({
  selector: '[infoTooltip], [data-tip]',
  standalone: true,
})
export class InfoTooltipDirective implements OnInit, OnDestroy {
  @Input() infoTooltip = '';

  private tip: HTMLElement | null = null;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private onScrollCapture: (() => void) | null = null;

  constructor(private el: ElementRef) {}

  ngOnInit(): void {
    if (!this.infoTooltip) {
      this.infoTooltip = this.el.nativeElement.getAttribute('data-tip') ?? '';
    }
    this.onScrollCapture = () => this.remove();
    document.addEventListener('scroll', this.onScrollCapture, true);
  }

  @HostListener('mouseenter')
  onEnter(): void {
    if (!this.infoTooltip) return;
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.showTimer = setTimeout(() => {
      this.show();
    }, 220);
  }

  @HostListener('mouseleave')
  onLeave(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    this.hideTimer = setTimeout(() => this.remove(), 80);
  }

  @HostListener('click')
  onClick(): void {
    this.remove();
  }

  private show(): void {
    this.remove();
    const tip = document.createElement('div');
    tip.textContent = this.infoTooltip;
    tip.style.position = 'fixed';
    tip.style.zIndex = '99999';
    tip.style.maxWidth = '300px';
    tip.style.maxHeight = '60vh';
    tip.style.overflowY = 'auto';
    tip.style.padding = '9px 12px';
    tip.style.borderRadius = '10px';
    tip.style.background = '#0F172A';
    tip.style.color = '#F1F5F9';
    tip.style.fontFamily = "'Inter', system-ui, -apple-system, sans-serif";
    tip.style.fontSize = '12px';
    tip.style.fontWeight = '500';
    tip.style.lineHeight = '1.5';
    tip.style.textAlign = 'left';
    tip.style.whiteSpace = 'pre-line';
    tip.style.boxShadow = '0 10px 28px rgba(15, 23, 42, .35)';
    tip.style.pointerEvents = 'none';
    tip.style.animation = 'it-tooltip-fade .15s ease';
    document.body.appendChild(tip);
    this.tip = tip;
    this.position(tip);
  }

  private position(tip: HTMLElement): void {
    const host = this.el.nativeElement as HTMLElement;
    const rect = host.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const gap = 10;
    let left = Math.round(rect.left + rect.width / 2 - tipRect.width / 2);
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    let top = rect.top - tipRect.height - gap;
    if (top < 8) {
      top = rect.bottom + gap;
      if (top + tipRect.height > window.innerHeight - 8) {
        top = Math.max(8, window.innerHeight - tipRect.height - 8);
      }
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  private remove(): void {
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = null;
    }
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.tip) {
      this.tip.remove();
      this.tip = null;
    }
  }

  ngOnDestroy(): void {
    if (this.onScrollCapture) {
      document.removeEventListener('scroll', this.onScrollCapture, true);
      this.onScrollCapture = null;
    }
    this.remove();
  }
}
