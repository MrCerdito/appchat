import { Component, ChangeDetectionStrategy, OnInit, signal } from '@angular/core';
import { MaintenanceService } from '../../core/services/maintenance.service';

@Component({
  selector: 'app-maintenance-overlay',
  standalone: true,
  template: `
    @if (maintenance.isMaintenance()) {
    <div class="maintenance-overlay" [style.background-color]="bgColor()">
      <div class="maintenance-backdrop" [style.background-image]="'url(assets/maintenance.gif)'"></div>
      <div class="maintenance-content">
        <img src="assets/maintenance.gif" alt="Mantenimiento" class="maintenance-gif"
          (load)="onGifLoad($event)" />
        <h1 class="maintenance-title" [style.color]="textColor()">ESTAMOS FUERA DE SERVICIO</h1>
        <p class="maintenance-sub" [style.color]="textColor()">En este momento nos encontramos en mantenimiento.</p>
        <div class="maintenance-spinner" [style.border-color]="spinnerBorder()" [style.border-top-color]="textColor()"></div>
      </div>
    </div>
    }
  `,
  styles: [`
    .maintenance-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.6s ease;
      animation: fadeIn 0.4s ease;
    }

    .maintenance-backdrop {
      position: absolute;
      inset: -40px;
      background-size: cover;
      background-position: center;
      filter: blur(50px) saturate(1.8) brightness(0.6);
      opacity: 0.35;
    }

    .maintenance-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      text-align: center;
      padding: 2.5rem;
      max-width: 400px;
    }

    .maintenance-gif {
      width: 200px;
      height: 200px;
      object-fit: contain;
      border-radius: 20px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
    }

    .maintenance-title {
      font-size: 1.5rem;
      font-weight: 900;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin: 0;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    }

    .maintenance-sub {
      font-size: 0.88rem;
      font-weight: 400;
      opacity: 0.75;
      margin: 0;
      line-height: 1.5;
    }

    .maintenance-spinner {
      width: 30px;
      height: 30px;
      border: 3px solid rgba(255, 255, 255, 0.15);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-top: 4px;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MaintenanceOverlayComponent implements OnInit {
  bgColor = signal('rgb(25, 32, 56)');
  textColor = signal('#ffffff');
  spinnerBorder = signal('rgba(255,255,255,0.15)');

  constructor(public maintenance: MaintenanceService) {}

  ngOnInit(): void {
    this.extractDominantColor();
  }

  onGifLoad(event: Event): void {
    this.extractColorFromElement(event.target as HTMLImageElement);
  }

  private extractDominantColor(): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = 'assets/maintenance.gif';
    img.onload = () => this.extractColorFromElement(img);
  }

  private extractColorFromElement(img: HTMLImageElement): void {
    try {
      const canvas = document.createElement('canvas');
      const size = 10;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        rSum += data[i];
        gSum += data[i + 1];
        bSum += data[i + 2];
        count++;
      }
      const r = Math.round(rSum / count);
      const g = Math.round(gSum / count);
      const b = Math.round(bSum / count);

      this.bgColor.set(`rgb(${r}, ${g}, ${b})`);
      this.textColor.set(this.isLight(r, g, b) ? '#1e293b' : '#ffffff');
      this.spinnerBorder.set(this.isLight(r, g, b) ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.15)');
    } catch {
      // CORS or other error — keep defaults
    }
  }

  private isLight(r: number, g: number, b: number): boolean {
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
  }
}
