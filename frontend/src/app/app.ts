import { Component, signal, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConnectivityBannerComponent } from './shared/components/connectivity-banner.component';
import { ToastContainerComponent } from './shared/components/toast-container.component';
import { MaintenanceOverlayComponent } from './shared/components/maintenance-overlay.component';
import { MaintenanceService } from './core/services/maintenance.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConnectivityBannerComponent, ToastContainerComponent, MaintenanceOverlayComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnInit {
  protected readonly title = signal('frontend');

  constructor(private maintenance: MaintenanceService) {}

  ngOnInit(): void {
    this.maintenance.start();
  }
}
