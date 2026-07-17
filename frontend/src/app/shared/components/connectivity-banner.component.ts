import { Component, ChangeDetectionStrategy } from '@angular/core';
import { ConnectivityService } from '../../core/services/connectivity.service';

@Component({
  selector: 'app-connectivity-banner',
  standalone: true,
  template: `
    @if (!connectivity.isOnline()) {
    <div class="connectivity-banner">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
        <line x1="1" y1="1" x2="23" y2="23"/>
        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/>
        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/>
        <path d="M10.71 5.05A16 16 0 0 1 22.56 9"/>
        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/>
        <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
        <line x1="12" y1="20" x2="12.01" y2="20"/>
      </svg>
      <span>Sin conexion a internet — intentando reconectar...</span>
    </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectivityBannerComponent {
  constructor(public connectivity: ConnectivityService) {}
}
