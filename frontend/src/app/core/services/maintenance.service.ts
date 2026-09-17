import { Injectable, signal, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { SocketService } from './socket.service';
import { Subscription, timeout } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MaintenanceService implements OnDestroy {
  isMaintenance = signal(false);

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private socketSub: Subscription | null = null;
  private failCount = 0;
  private readonly FAIL_THRESHOLD = 8;
  private readonly POLL_MS = 60_000;

  /** Bundle principal cargado al inicio (main-XXXX.js). */
  private loadedBundle = '';

  constructor(
    private http: HttpClient,
    private socket: SocketService
  ) {}

  /** Detecta el nombre del bundle principal en el HTML servido. */
  private static readServedBundle(html: string): string {
    const m = html.match(/src="(main-[A-Za-z0-9]+\.js)"/);
    return m ? m[1] : '';
  }

  /** Al arrancar, captura el bundle que el navegador ya cargó. */
  private captureCurrentBundle(): void {
    if (this.loadedBundle) return;
    const scripts = document.querySelectorAll('script[src]');
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].getAttribute('src') || '';
      if (/main-[A-Za-z0-9]+\.js/.test(src)) {
        this.loadedBundle = MaintenanceService.readServedBundle(
          '<script src="' + src + '">',
        );
        break;
      }
    }
  }

  /** Cada chequeo, re-fetch index.html y compara con el bundle cargado. */
  private async checkForNewDeploy(): Promise<void> {
    try {
      const indexUrl = environment.apiUrl
        ? environment.apiUrl.replace(/\/+$/, '') + '/'
        : '/';
      const res = await fetch(indexUrl, { cache: 'no-store' });
      if (!res.ok) return;
      const html = await res.text();
      const served = MaintenanceService.readServedBundle(html);
      if (served && this.loadedBundle && served !== this.loadedBundle) {
        location.reload();
      }
    } catch (_) {}
  }

  start(): void {
    if (this.intervalId) return;
    this.captureCurrentBundle();
    this.check();
    this.intervalId = setInterval(() => {
      this.check();
      this.checkForNewDeploy();
    }, this.POLL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.socketSub) {
      this.socketSub.unsubscribe();
      this.socketSub = null;
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private check(): void {
    this.http.get(`${environment.apiUrl}/health`).pipe(
      timeout(3000)
    ).subscribe({
      next: () => {
        this.failCount = 0;
        if (this.isMaintenance()) {
          this.isMaintenance.set(false);
        }
      },
      error: (err) => this.reportError(err),
    });
  }

  /**
   * Registra un fallo de conectividad con el mismo criterio del poll de
   * /health: solo status 0 (red caída / sin respuesta) o 5xx cuentan como
   * caída real. Un 4xx (p. ej. 429 rate-limit) significa que el backend SÍ
   * responde, por lo que se trata como éxito.
   */
  reportError(err?: { status?: number }): void {
    const status = err?.status ?? 0;
    if (status !== 0 && status < 500) {
      this.failCount = 0;
      if (this.isMaintenance()) {
        this.isMaintenance.set(false);
      }
      return;
    }
    this.failCount++;
    if (this.failCount >= this.FAIL_THRESHOLD) {
      this.isMaintenance.set(true);
    }
  }
}
