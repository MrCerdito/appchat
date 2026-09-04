import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { SocketService } from '../../core/services/socket.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationRealtimeService } from '../../core/services/notification-realtime.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="notif-bell-wrap">
      <button class="notif-bell" [class.has-unread]="svc.hasUnread()" title="Notificaciones" (click)="togglePanel($event)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="20" height="20">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        @if (svc.hasUnread()) {
          <span class="notif-badge">{{ svc.unreadCount() > 99 ? '99+' : svc.unreadCount() }}</span>
        }
      </button>

      @if (panelOpen) {
      <div class="notif-panel-overlay" (click)="closePanel()"></div>
      <div class="notif-panel" (click)="$event.stopPropagation()">

        <div class="notif-panel-header">
          <h3>Notificaciones</h3>
          <div class="notif-header-actions">
            @if (svc.hasUnread()) {
              <button class="notif-mark-all" (click)="markAllRead()">Marcar todo leido</button>
            }
          </div>
        </div>

        <div class="notif-desktop-row">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" width="16" height="16">
            <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          <span class="notif-desktop-label">Notificaciones de escritorio</span>
          <label class="notif-toggle">
            <input type="checkbox" [checked]="svc.permission() === 'granted'" (change)="toggleDesktop($event)">
            <span class="notif-toggle-track"><span class="notif-toggle-thumb"></span></span>
          </label>
        </div>

        <div class="notif-list">
          @if (svc.notifications().length === 0) {
            <div class="notif-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2 3-9"/>
                <path d="M13.73 21a1.94 1.94 0 0 0 3.4 0"/>
              </svg>
              <p>Sin notificaciones</p>
            </div>
          }
          @for (n of svc.notifications(); track n.id) {
            <div class="notif-item" [class.unread]="!n.read" (click)="onNotifClick(n)">
              <div class="notif-icon" [style.background]="getIconBg(n.type)">
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" width="14" height="14">
                  @switch (n.type) {
                    @case ('ticket_created') { <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/> }
                    @case ('ticket_assigned') { <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/> }
                    @case ('ticket_reassigned') { <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/> }
                    @case ('ticket_updated') { <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/> }
                    @case ('ticket_status_changed') { <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/> }
                    @case ('ticket_priority_changed') { <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/> }
                    @case ('ticket_closed') { <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/> }
                    @case ('ticket_denied') { <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/> }
                    @case ('ticket_deleted') { <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/> }
                    @case ('ticket_sla_warning') { <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/> }
                    @case ('ticket_sla_expired') { <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/> }
                    @default { <circle cx="12" cy="12" r="10"/> }
                  }
                </svg>
              </div>
              <div class="notif-content">
                <span class="notif-title">{{ n.title }}</span>
                <span class="notif-msg">{{ n.message }}</span>
                <span class="notif-time">{{ fmtTime(n.createdAt) }}</span>
              </div>
              @if (!n.read) {
                <span class="notif-dot"></span>
              }
            </div>
          }
          @if (!svc.loadedAll()) {
            <button class="notif-load-more" (click)="loadMore()">Cargar m&aacute;s</button>
          }
        </div>
      </div>
      }
    </div>
  `,
  styles: [`
    .notif-bell-wrap { position: relative; }

    .notif-bell {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: var(--text-muted, #9ca3af);
      cursor: pointer;
      transition: all 0.15s;
    }
    .notif-bell:hover { background: var(--bg-hover, rgba(255,255,255,0.06)); color: var(--text, #e5e7eb); }

    .notif-badge {
      position: absolute;
      top: 2px;
      right: 2px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: #ef4444;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      animation: badge-pop 0.2s ease;
    }
    @keyframes badge-pop {
      from { transform: scale(0.6); } to { transform: scale(1); }
    }

    .notif-panel-overlay {
      position: fixed;
      inset: 0;
      z-index: 9998;
    }

    .notif-panel {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 380px;
      max-height: 540px;
      background: var(--surface, #1e1e2e);
      border: 1px solid var(--border, rgba(255,255,255,0.08));
      border-radius: 14px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.3);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: panel-in 0.15s ease;
    }
    @keyframes panel-in {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .notif-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px 12px;
      border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
      h3 { margin: 0; font-size: 15px; font-weight: 700; color: var(--text, #e5e7eb); }
    }

    .notif-header-actions { display: flex; align-items: center; gap: 10px; }

    .notif-mark-all {
      border: none;
      background: transparent;
      color: #6366f1;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      padding: 0;
      transition: opacity 0.15s;
    }
    .notif-mark-all:hover { opacity: 0.7; }

    .notif-desktop-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      border-bottom: 1px solid var(--border, rgba(255,255,255,0.08));
      color: var(--text-muted, #9ca3af);
    }

    .notif-desktop-label {
      flex: 1;
      font-size: 12px;
      font-weight: 500;
    }

    .notif-toggle {
      position: relative;
      cursor: pointer;
      input { position: absolute; opacity: 0; width: 0; height: 0; }
    }

    .notif-toggle-track {
      display: block;
      width: 36px;
      height: 20px;
      border-radius: 12px;
      background: rgba(255,255,255,0.12);
      transition: background 0.2s;
      position: relative;
    }

    .notif-toggle input:checked + .notif-toggle-track {
      background: #6366f1;
    }

    .notif-toggle-thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.2s;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }

    .notif-toggle input:checked + .notif-toggle-track .notif-toggle-thumb {
      transform: translateX(16px);
    }

    .notif-list {
      overflow-y: auto;
      flex: 1;
      max-height: 420px;
    }

    .notif-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 40px 20px;
      color: var(--text-muted, #9ca3af);
      p { margin: 0; font-size: 13px; }
      svg { opacity: 0.3; }
    }

    .notif-item {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 18px;
      cursor: pointer;
      transition: background 0.1s;
      border-bottom: 1px solid var(--border, rgba(255,255,255,0.04));
    }
    .notif-item:hover { background: var(--bg-hover, rgba(255,255,255,0.04)); }
    .notif-item.unread { background: rgba(99, 102, 241, 0.06); }

    .notif-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .notif-content {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .notif-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text, #e5e7eb);
      word-break: break-word;
    }

    .notif-msg {
      font-size: 12px;
      line-height: 1.4;
      color: var(--text-muted, #9ca3af);
      word-break: break-word;
    }

    .notif-time {
      font-size: 11px;
      color: var(--text-faint, #6b7280);
      margin-top: 2px;
    }

    .notif-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #6366f1;
      flex-shrink: 0;
      margin-top: 6px;
    }

    .notif-load-more {
      display: block;
      width: 100%;
      padding: 12px 18px;
      border: 0;
      background: transparent;
      color: #6366f1;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      text-align: center;
    }
    .notif-load-more:hover { background: var(--bg-hover, rgba(255,255,255,0.04)); }
  `],
})
export class NotificationBellComponent implements OnInit, OnDestroy {
  panelOpen = false;
  private destroy$ = new Subject<void>();
  private userRole: string | null = null;

  constructor(
    public readonly svc: NotificationRealtimeService,
    private readonly socket: SocketService,
    private readonly router: Router,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.svc.init(this.socket);
    this.auth.user$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.userRole = user?.role ?? null;
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  togglePanel(e: Event): void {
    e.stopPropagation();
    this.panelOpen = !this.panelOpen;
    if (this.panelOpen) {
      this.svc.requestPermission();
      this.svc.fetch().subscribe();
    }
  }

  closePanel(): void {
    this.panelOpen = false;
  }

  toggleDesktop(e: Event): void {
    e.stopPropagation();
    if (this.svc.permission() === 'granted') {
      this.svc.setPermission('denied');
    } else {
      this.svc.requestPermission();
    }
  }

  markAllRead(): void {
    this.svc.markAllAsRead().subscribe();
  }

  loadMore(): void {
    this.svc.loadMore().subscribe();
  }

  onNotifClick(notif: any): void {
    if (!notif.read) {
      this.svc.markAsRead(notif.id).subscribe();
    }
    this.closePanel();
    if (notif.entityType === 'ticket') {
      const route = this.getTicketsRoute();
      if (notif.entityCodigo) {
        this.router.navigate([route], { queryParams: { highlight: notif.entityCodigo } });
      } else {
        this.router.navigate([route]);
      }
    }
  }

  private getTicketsRoute(): string {
    switch (this.userRole) {
      case 'admin': return '/admin/tickets';
      case 'advisor': return '/dashboard/tickets';
      case 'desarrollador': return '/developer/tickets';
      default: return '/admin/tickets';
    }
  }

  getIconBg(type: string): string {
    const map: Record<string, string> = {
      ticket_created: '#3b82f6',
      ticket_assigned: '#6366f1',
      ticket_reassigned: '#8b5cf6',
      ticket_updated: '#22c55e',
      ticket_status_changed: '#f59e0b',
      ticket_priority_changed: '#f97316',
      ticket_closed: '#10b981',
      ticket_denied: '#ef4444',
      ticket_deleted: '#6b7280',
      ticket_sla_warning: '#f59e0b',
      ticket_sla_expired: '#dc2626',
    };
    return map[type] ?? '#6b7280';
  }

  fmtTime(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Ahora';
    if (mins < 60) return `Hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `Hace ${days}d`;
  }
}
