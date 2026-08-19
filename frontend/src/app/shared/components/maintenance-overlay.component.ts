import { Component, ChangeDetectionStrategy } from '@angular/core';
import { MaintenanceService } from '../../core/services/maintenance.service';

@Component({
  selector: 'app-maintenance-overlay',
  standalone: true,
  template: `
    @if (maintenance.isMaintenance()) {
    <div class="maintenance-overlay">
      <div class="maintenance-content">
        <img src="assets/maintenance.gif" alt="Mantenimiento" class="maintenance-gif" />
        <h2 class="maintenance-title">Estamos en mantenimiento</h2>
        <p class="maintenance-sub">El sistema se está reiniciando. Intenta de nuevo en unos segundos.</p>
        <div class="maintenance-spinner"></div>
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
      background: rgba(15, 23, 42, 0.92);
      backdrop-filter: blur(6px);
      animation: fadeIn 0.3s ease;
    }

    .maintenance-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      text-align: center;
      padding: 2rem;
      max-width: 360px;
    }

    .maintenance-gif {
      width: 180px;
      height: 180px;
      object-fit: contain;
      border-radius: 16px;
    }

    .maintenance-title {
      font-size: 1.1rem;
      font-weight: 700;
      color: #fff;
      margin: 0;
    }

    .maintenance-sub {
      font-size: 0.82rem;
      color: rgba(255, 255, 255, 0.65);
      margin: 0;
      line-height: 1.5;
    }

    .maintenance-spinner {
      width: 28px;
      height: 28px;
      border: 3px solid rgba(255, 255, 255, 0.15);
      border-top-color: #3b82f6;
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
export class MaintenanceOverlayComponent {
  constructor(public maintenance: MaintenanceService) {}
}
