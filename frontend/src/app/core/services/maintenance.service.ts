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
  private readonly POLL_MS = 5_000;

  constructor(
    private http: HttpClient,
    private socket: SocketService
  ) {}

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
      error: () => {
        this.failCount++;
        if (this.failCount >= this.FAIL_THRESHOLD) {
          this.isMaintenance.set(true);
        }
      },
    });
  }
}
