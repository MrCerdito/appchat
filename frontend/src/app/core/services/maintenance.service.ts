import { Injectable, signal, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class MaintenanceService implements OnDestroy {
  isMaintenance = signal(false);

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private failCount = 0;
  private readonly FAIL_THRESHOLD = 3;
  private readonly POLL_MS = 10_000;

  constructor(private http: HttpClient) {}

  start(): void {
    if (this.intervalId) return;
    this.check();
    this.intervalId = setInterval(() => this.check(), this.POLL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private check(): void {
    this.http.get(`${environment.apiUrl}/health`, { timeout: 5000 }).subscribe({
      next: () => {
        this.failCount = 0;
        if (this.isMaintenance()) {
          this.isMaintenance.set(false);
        }
      },
      error: () => {
        this.failCount++;
        if (this.failCount >= this.FAIL_THRESHOLD) {
          this.isMaintenance.set(true);
        }
      },
    });
  }
}
