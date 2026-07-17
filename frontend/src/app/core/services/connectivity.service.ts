import { Injectable, signal, OnDestroy } from '@angular/core';
import { NotificationService } from './notification.service';

@Injectable({ providedIn: 'root' })
export class ConnectivityService implements OnDestroy {
  isOnline = signal(navigator.onLine);

  private readonly onOnline = (): void => {
    if (!this.isOnline()) {
      this.isOnline.set(true);
      this.notification.success('Conexion restaurada', 'Tu conexion a internet se recupero correctamente.');
    }
  };

  private readonly onOffline = (): void => {
    this.isOnline.set(false);
  };

  constructor(private notification: NotificationService) {
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
  }

  ngOnDestroy(): void {
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
  }
}
