import { Component, ChangeDetectionStrategy, OnInit, signal } from '@angular/core';
import { MaintenanceService } from '../../core/services/maintenance.service';

@Component({
  selector: 'app-maintenance-overlay',
  standalone: true,
  template: `
    @if (maintenance.isMaintenance()) {
    <div class="maintenance-overlay" [style.background-color]="bgColor()">
      <!-- GIF a pantalla completa como fondo -->
      <img [src]="'assets/maintenance.gif?v=' + gifVersion" alt="" class="maintenance-bg"
        (load)="onGifLoad($event)" />

      <!-- Overlay de gradiente para legibilidad del texto -->
      <div class="maintenance-gradient"></div>

      <!-- Contenido sobre el fondo -->
      <div class="maintenance-content">
        <h1 class="maintenance-title" [style.color]="textColor()">
          ESTAMOS FUERA DE SERVICIO
        </h1>
        <p class="maintenance-sub" [style.color]="textColor()">
          En este momento nos encontramos en mantenimiento.
        </p>
        <div class="maintenance-divider" [style.background-color]="dividerColor()"></div>
        <p class="maintenance-hint" [style.color]="textColor()">
          Vuelve a intentarlo en unos minutos.
        </p>
        <div class="maintenance-spinner-wrap">
          <div class="maintenance-spinner" [style.border-color]="spinnerBorder()" [style.border-top-color]="textColor()"></div>
        </div>
      </div>
    </div>
    }
  `,
  styles: [`
    :host { display: block; }

    .maintenance-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      overflow: hidden;
      animation: fadeIn 0.5s ease;
    }

    .maintenance-bg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
    }

    .maintenance-gradient {
      position: absolute;
      inset: 0;
      background: linear-gradient(
        to top,
        rgba(0, 0, 0, 0.85) 0%,
        rgba(0, 0, 0, 0.5) 35%,
        rgba(0, 0, 0, 0.15) 60%,
        transparent 100%
      );
    }

    .maintenance-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      text-align: center;
      padding: 0 2rem 4.5rem;
      width: 100%;
      max-width: 520px;
    }

    .maintenance-title {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: clamp(1.2rem, 4vw, 1.8rem);
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin: 0;
      color: #fff;
      text-shadow: 0 2px 20px rgba(0, 0, 0, 0.5);
      line-height: 1.2;
    }

    .maintenance-sub {
      font-size: clamp(0.8rem, 2.5vw, 0.95rem);
      font-weight: 400;
      margin: 0;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.8);
      text-shadow: 0 1px 8px rgba(0, 0, 0, 0.4);
    }

    .maintenance-divider {
      width: 40px;
      height: 3px;
      border-radius: 2px;
      background: rgba(255, 255, 255, 0.4);
      margin: 4px 0;
    }

    .maintenance-hint {
      font-size: 0.75rem;
      font-weight: 400;
      margin: 0;
      color: rgba(255, 255, 255, 0.55);
      text-shadow: 0 1px 6px rgba(0, 0, 0, 0.3);
    }

    .maintenance-spinner-wrap {
      margin-top: 8px;
    }

    .maintenance-spinner {
      width: 26px;
      height: 26px;
      border: 2.5px solid rgba(255, 255, 255, 0.15);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
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
  bgColor = signal('#111827');
  textColor = signal('#ffffff');
  dividerColor = signal('rgba(255,255,255,0.4)');
  spinnerBorder = signal('rgba(255,255,255,0.15)');
  gifVersion = Date.now();

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
    } catch {
      // CORS — keep defaults
    }
  }
}
