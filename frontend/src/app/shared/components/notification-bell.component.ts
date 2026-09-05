import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { SocketService } from '../../core/services/socket.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationRealtimeService } from '../../core/services/notification-realtime.service';

const TYPE_LABELS: Record<string, string> = {
  ticket_created: 'Ticket creado',
  ticket_assigned: 'Ticket asignado',
  ticket_reassigned: 'Ticket reasignado',
  ticket_updated: 'Ticket actualizado',
  ticket_status_changed: 'Estado cambiado',
  ticket_priority_changed: 'Prioridad cambiada',
  ticket_note: 'Nota agregada',
  ticket_closed: 'Ticket cerrado',
  ticket_denied: 'Ticket rechazado',
  ticket_deleted: 'Ticket eliminado',
  ticket_sla_warning: 'SLA por vencer',
  ticket_sla_expired: 'SLA vencido',
};

const TYPE_BG: Record<string, string> = {
  ticket_created: '#EFF4FF',
  ticket_assigned: '#EEF0FF',
  ticket_reassigned: '#F5F3FF',
  ticket_updated: '#ECFDF3',
  ticket_status_changed: '#FFF7ED',
  ticket_priority_changed: '#FFF4ED',
  ticket_note: '#ECFDF3',
  ticket_closed: '#ECFDF3',
  ticket_denied: '#FEF2F2',
  ticket_deleted: '#F3F4F6',
  ticket_sla_warning: '#FFF7ED',
  ticket_sla_expired: '#FEF2F2',
};

const TYPE_FG: Record<string, string> = {
  ticket_created: '#3B82F6',
  ticket_assigned: '#6366F1',
  ticket_reassigned: '#8B5CF6',
  ticket_updated: '#16A34A',
  ticket_status_changed: '#D97706',
  ticket_priority_changed: '#EA580C',
  ticket_note: '#16A34A',
  ticket_closed: '#16A34A',
  ticket_denied: '#EF4444',
  ticket_deleted: '#6B7280',
  ticket_sla_warning: '#D97706',
  ticket_sla_expired: '#DC2626',
};

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
          <div class="notif-head-left">
            <div class="notif-head-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a1.94 1.94 0 0 1-3.46 0"/>
              </svg>
            </div>
            <h3>Notificaciones</h3>
          </div>
          <div class="notif-header-actions">
            @if (selectedIds.size > 0) {
              <span class="notif-selected-count">{{ selectedIds.size }} seleccionada{{ selectedIds.size > 1 ? 's' : '' }}</span>
              <button class="notif-bulk-del" (click)="deleteSelected()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Borrar
              </button>
              <button class="notif-bulk-cancel" (click)="clearSelection()">Cancelar</button>
            } @else {
              @if (svc.hasUnread() && svc.notifications().length > 0) {
                <button class="notif-mark-all" (click)="markAllRead()">Marcar le&iacute;dos</button>
              }
              @if (svc.notifications().length > 0) {
                <button class="notif-delete-all" (click)="deleteAll()">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                  Borrar todo
                </button>
              }
            }
          </div>
        </div>

        <div class="notif-desktop-row">
          <div class="notif-desk-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
          </div>
          <div class="notif-desk-text">
            <span class="notif-desk-title">Notificaciones de escritorio</span>
            <span class="notif-desk-sub">Recibe alertas en tiempo real</span>
          </div>
          <label class="notif-toggle">
            <input type="checkbox" [checked]="svc.permission() === 'granted'" (change)="toggleDesktop($event)">
            <span class="notif-toggle-track"><span class="notif-toggle-thumb"></span></span>
          </label>
        </div>

        <div class="notif-list">
          @if (svc.notifications().length === 0) {
            <div class="notif-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="44" height="44">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a1.94 1.94 0 0 1-3.46 0"/>
              </svg>
              <p>Sin notificaciones</p>
            </div>
          }
          @for (n of svc.notifications(); track n.id) {
          <div class="notif-item-wrap" [class.deleting]="deletingId === n.id" [class.dragging]="draggingId === n.id">
            <div class="notif-delete-bg" [style.opacity]="deleteOpacity(n.id)">
              <button class="notif-delete-btn" title="Eliminar" (click)="deleteNotif(n)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                <span class="notif-delete-label">Borrar</span>
              </button>
            </div>
            <div
              class="notif-item"
              [class.unread]="!n.read"
              [class.selected]="isSelected(n.id)"
              [class.dragging]="draggingId === n.id"
              [style.transform]="getOffset(n.id)"
              (click)="onNotifClick(n)"
              (pointerdown)="onPointerDown($event, n.id)"
              (pointermove)="onPointerMove($event)"
              (pointerup)="onPointerUp($event, n.id)"
              (pointercancel)="onPointerCancel($event, n.id)"
            >
              <label class="notif-check" (click)="$event.stopPropagation()" (pointerdown)="$event.stopPropagation()">
                <input type="checkbox" [checked]="isSelected(n.id)" (change)="toggleSelect(n.id, $event)" aria-label="Seleccionar">
                <span class="notif-checkbox">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
              </label>
              <div class="notif-icon" [style.background]="iconBg(n.type)" [style.color]="iconFg(n.type)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                  @switch (n.type) {
                    @case ('ticket_created') { <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/> }
                    @case ('ticket_assigned') { <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/> }
                    @case ('ticket_reassigned') { <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/> }
                    @case ('ticket_updated') { <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/> }
                    @case ('ticket_status_changed') { <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/> }
                    @case ('ticket_priority_changed') { <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/> }
                    @case ('ticket_note') { <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="13" y2="18"/> }
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
                <span
                  class="notif-tag"
                  [style.background]="iconBg(n.type)"
                  [style.color]="iconFg(n.type)"
                >{{ tagLabel(n.type) }}</span>
              </div>
              <div class="notif-meta">
                <span class="notif-time">{{ fmtTime(n.createdAt) }}</span>
                <svg class="notif-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </div>
          </div>
          }
        </div>

        <div class="notif-panel-footer">
          <span class="notif-footer-left">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Mostrando las &uacute;ltimas {{ svc.notifications().length }}
          </span>
          @if (!svc.loadedAll()) {
            <button class="notif-footer-view" (click)="viewAll()">Ver todas
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
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
      top: 1px;
      right: 1px;
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

    .notif-panel-overlay { position: fixed; inset: 0; z-index: 9998; }

    .notif-panel {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 620px;
      max-width: calc((100vw - 16px) / 0.7);
      background: #ffffff;
      border: 1px solid #e7eaf0;
      border-radius: 22px;
      box-shadow: 0 24px 64px rgba(16, 24, 40, 0.12), 0 4px 16px rgba(16, 24, 40, 0.06);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: panel-in 0.18s ease;
      color: #172033;
      transform: scale(0.7);
      transform-origin: top right;
    }
    @keyframes panel-in {
      from { opacity: 0; transform: scale(0.7) translateY(-10px); }
      to { opacity: 1; transform: scale(0.7) translateY(0); }
    }

    /* ---------- Header ---------- */
    .notif-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 20px 24px 16px;
      border-bottom: 1px solid #eef0f5;
    }

    .notif-head-left {
      display: flex;
      align-items: center;
      gap: 14px;
      min-width: 0;
    }

    .notif-head-icon {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: #eef0ff;
      color: #6366f1;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .notif-panel-header h3 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      color: #172033;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }

    .notif-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .notif-mark-all {
      border: none;
      background: transparent;
      color: #6366f1;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      padding: 6px 8px;
      border-radius: 8px;
      transition: background 0.15s;
    }
    .notif-mark-all:hover { background: #f1f2ff; }

    .notif-delete-all {
      display: flex;
      align-items: center;
      gap: 6px;
      border: 1px solid #fecaca;
      background: #ffffff;
      color: #dc2626;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      padding: 7px 12px;
      border-radius: 10px;
      transition: background 0.15s, border-color 0.15s;
      white-space: nowrap;
    }
    .notif-delete-all:hover { background: #fef2f2; border-color: #fca5a5; }

    .notif-selected-count {
      font-size: 13px;
      font-weight: 700;
      color: #6366f1;
      white-space: nowrap;
    }

    .notif-bulk-del {
      display: flex;
      align-items: center;
      gap: 5px;
      border: 1px solid #fecaca;
      background: #ffffff;
      color: #dc2626;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      padding: 7px 11px;
      border-radius: 10px;
      transition: background 0.15s, border-color 0.15s;
      white-space: nowrap;
    }
    .notif-bulk-del:hover { background: #fef2f2; border-color: #fca5a5; }

    .notif-bulk-cancel {
      border: none;
      background: transparent;
      color: #667085;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      padding: 7px 6px;
      border-radius: 8px;
      transition: background 0.15s;
    }
    .notif-bulk-cancel:hover { background: #f2f4f7; }

    /* ---------- Desktop config ---------- */
    .notif-desktop-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 24px;
      border-bottom: 1px solid #eef0f5;
      background: #fbfcfe;
    }

    .notif-desk-icon {
      width: 42px;
      height: 42px;
      border-radius: 13px;
      background: #f0f4ff;
      color: #6366f1;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .notif-desk-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .notif-desk-title {
      font-size: 16px;
      font-weight: 600;
      color: #172033;
    }

    .notif-desk-sub {
      font-size: 13px;
      color: #98a1b3;
    }

    .notif-toggle {
      position: relative;
      cursor: pointer;
      flex-shrink: 0;
      input { position: absolute; opacity: 0; width: 0; height: 0; }
    }

    .notif-toggle-track {
      display: block;
      width: 40px;
      height: 22px;
      border-radius: 12px;
      background: #e0e3ea;
      transition: background 0.2s;
      position: relative;
      box-shadow: inset 0 1px 2px rgba(16, 24, 40, 0.06);
    }

    .notif-toggle input:checked + .notif-toggle-track { background: #6366f1; }

    .notif-toggle-thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #fff;
      transition: transform 0.2s;
      box-shadow: 0 1px 3px rgba(16, 24, 40, 0.18);
    }

    .notif-toggle input:checked + .notif-toggle-track .notif-toggle-thumb {
      transform: translateX(18px);
    }

    /* ---------- List ---------- */
    .notif-list {
      overflow-y: auto;
      flex: 1;
      max-height: 640px;
      padding: 16px 16px 8px;
      background: #ffffff;
    }

    .notif-list::-webkit-scrollbar { width: 5px; }
    .notif-list::-webkit-scrollbar-track { background: transparent; }
    .notif-list::-webkit-scrollbar-thumb { background: #d9dde7; border-radius: 3px; }
    .notif-list::-webkit-scrollbar-thumb:hover { background: #c1c6d4; }

    .notif-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 52px 20px;
      color: #98a1b3;
      p { margin: 0; font-size: 14px; font-weight: 500; }
      svg { opacity: 0.35; }
    }

    /* ---------- Cards ---------- */
    .notif-item-wrap {
      position: relative;
      overflow: hidden;
      border-radius: 18px;
      margin-bottom: 12px;
      &.deleting {
        .notif-item {
          transform: translateX(-140%) !important;
          transition: transform 0.32s ease;
        }
        .notif-delete-bg { opacity: 1 !important; }
      }
      &.dragging {
        .notif-item { transition: none; }
        .notif-delete-bg { transition: none; }
      }
    }

    .notif-delete-bg {
      position: absolute;
      top: 0;
      right: 0;
      bottom: 0;
      width: 150px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #ef4444;
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .notif-delete-btn {
      width: 100%;
      height: 100%;
      border: none;
      background: transparent;
      color: #fff;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 5px;
      transition: background 0.15s, transform 0.15s;
    }
    .notif-delete-btn:hover { background: rgba(255, 255, 255, 0.12); }
    .notif-delete-btn:active { transform: scale(0.96); }

    .notif-delete-label {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.03em;
    }

    .notif-item {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 16px;
      cursor: pointer;
      touch-action: pan-y;
      user-select: none;
      -webkit-user-select: none;
      background: #ffffff;
      border: 1px solid #eaeef4;
      border-radius: 18px;
      box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03);
      transition: transform 0.25s ease, background 0.15s, border-color 0.15s, box-shadow 0.15s;
    }
    .notif-item:hover {
      background: #fbfcff;
      border-color: #dbe1ee;
      box-shadow: 0 4px 12px rgba(16, 24, 40, 0.06);
    }
    .notif-item.unread {
      background: #f7f8fd;
      border-color: #e4e7f5;
      box-shadow: inset 3px 0 0 #6366f1, 0 1px 2px rgba(16, 24, 40, 0.03);
    }
    .notif-item.unread:hover { background: #f1f3fc; }
    .notif-item.selected {
      background: #eef0ff;
      border-color: #b9bffb;
      box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.25), 0 4px 12px rgba(99, 102, 241, 0.08);
    }

    .notif-check {
      position: relative;
      width: 22px;
      height: 22px;
      flex-shrink: 0;
      margin-top: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      input { position: absolute; opacity: 0; width: 0; height: 0; }
    }

    .notif-checkbox {
      width: 22px;
      height: 22px;
      border-radius: 7px;
      border: 1.5px solid #c7cdd9;
      color: transparent;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.15s;
      background: #ffffff;
      box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
    }

    .notif-check input:checked + .notif-checkbox {
      background: #6366f1;
      border-color: #6366f1;
      color: #fff;
      box-shadow: 0 2px 6px rgba(99, 102, 241, 0.35);
    }
    .notif-check:hover .notif-checkbox { border-color: #6366f1; }

    .notif-icon {
      width: 62px;
      height: 62px;
      border-radius: 16px;
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
      gap: 5px;
    }

    .notif-title {
      font-size: 17px;
      font-weight: 600;
      color: #172033;
      word-break: break-word;
      line-height: 1.3;
    }
    .notif-item.unread .notif-title { font-weight: 700; }

    .notif-msg {
      font-size: 15px;
      line-height: 1.5;
      color: #667085;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .notif-tag {
      align-self: flex-start;
      margin-top: 5px;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 13.5px;
      font-weight: 700;
      white-space: nowrap;
    }

    .notif-meta {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 12px;
      flex-shrink: 0;
      padding-top: 4px;
    }

    .notif-time {
      font-size: 14px;
      color: #98a1b3;
      white-space: nowrap;
    }

    .notif-chevron {
      color: #c1c6d4;
      transition: color 0.15s, transform 0.15s;
    }
    .notif-item:hover .notif-chevron { color: #6366f1; transform: translateX(2px); }

    /* ---------- Footer ---------- */
    .notif-panel-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 16px 24px;
      background: #ffffff;
      border-top: 1px solid #eef0f5;
    }

    .notif-footer-left {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 14px;
      color: #98a1b3;
      svg { color: #16a34a; }
    }

    .notif-footer-view {
      display: flex;
      align-items: center;
      gap: 5px;
      border: none;
      background: transparent;
      color: #6366f1;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      padding: 7px 12px;
      border-radius: 8px;
      transition: background 0.15s;
    }
    .notif-footer-view:hover { background: #f1f2ff; }
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
    private readonly cdr: ChangeDetectorRef,
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
    } else {
      this.clearPanelState();
    }
  }

  closePanel(): void {
    this.panelOpen = false;
    this.clearPanelState();
  }

  private clearPanelState(): void {
    this.selectedIds.clear();
    this.offsets.clear();
    this.cdr.markForCheck();
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

  viewAll(): void {
    if (this.svc.loadedAll()) return;
    this.svc.fetchAll(50).subscribe({ error: () => undefined });
  }

  onNotifClick(notif: any): void {
    const offset = this.offsets.get(notif.id) ?? 0;
    if (offset < 0) {
      this.offsets.set(notif.id, 0);
      this.cdr.markForCheck();
      return;
    }
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
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

  deletingId: string | null = null;
  draggingId: string | null = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartOffset = 0;
  private dragVertical = false;
  private dragMoved = false;
  private suppressClick = false;
  private offsets = new Map<string, number>();
  private readonly MAX_OFFSET = 150;

  getOffset(id: string): string {
    const o = this.offsets.get(id) ?? 0;
    return o === 0 ? '' : `translateX(${o}px)`;
  }

  deleteOpacity(id: string): number {
    const o = this.offsets.get(id) ?? 0;
    return Math.max(0, Math.min(1, -o / this.MAX_OFFSET));
  }

  onPointerDown(e: PointerEvent, id: string): void {
    if (this.deletingId) return;
    this.draggingId = id;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartOffset = this.offsets.get(id) ?? 0;
    this.dragVertical = false;
    this.dragMoved = false;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore capture errors
    }
  }

  onPointerMove(e: PointerEvent): void {
    if (!this.draggingId) return;
    const dx = e.clientX - this.dragStartX;
    const dy = e.clientY - this.dragStartY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) this.dragMoved = true;
    if (!this.dragVertical && Math.abs(dy) > 8) this.dragVertical = true;
    if (this.dragVertical) return;
    const offset = Math.max(-this.MAX_OFFSET, Math.min(this.dragStartOffset + dx, 0));
    this.offsets.set(this.draggingId, offset);
    this.cdr.markForCheck();
  }

  onPointerUp(e: PointerEvent, id: string): void {
    if (this.draggingId !== id) return;
    this.draggingId = null;
    this.suppressClick = this.dragMoved;
    const offset = this.offsets.get(id) ?? 0;
    this.offsets.set(id, offset < -50 ? -this.MAX_OFFSET : 0);
    this.cdr.markForCheck();
  }

  onPointerCancel(e: PointerEvent, id: string): void {
    if (this.draggingId !== id) return;
    this.draggingId = null;
    this.suppressClick = this.dragMoved;
    const offset = this.offsets.get(id) ?? 0;
    this.offsets.set(id, offset < -50 ? -this.MAX_OFFSET : 0);
    this.cdr.markForCheck();
  }

  selectedIds = new Set<string>();

  isSelected(id: string): boolean {
    return this.selectedIds.has(id);
  }

  toggleSelect(id: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) this.selectedIds.add(id);
    else this.selectedIds.delete(id);
    this.offsets.set(id, 0);
    this.cdr.markForCheck();
  }

  clearSelection(): void {
    this.selectedIds.clear();
    this.cdr.markForCheck();
  }

  deleteSelected(): void {
    const ids = [...this.selectedIds];
    this.selectedIds.clear();
    this.cdr.markForCheck();
    this.svc.removeMany(ids).subscribe();
  }

  deleteAll(): void {
    if (!window.confirm('Borrar todas las notificaciones?')) return;
    this.selectedIds.clear();
    this.cdr.markForCheck();
    this.svc.removeMany().subscribe();
  }

  deleteNotif(notif: any): void {
    this.performDelete(notif.id);
  }

  private performDelete(id: string): void {
    this.deletingId = id;
    this.cdr.markForCheck();
    setTimeout(() => {
      this.svc.remove(id).subscribe({
        next: () => {
          this.deletingId = null;
          this.offsets.delete(id);
          this.cdr.markForCheck();
        },
        error: () => {
          this.deletingId = null;
          this.offsets.delete(id);
          this.cdr.markForCheck();
        },
      });
    }, 320);
  }

  private getTicketsRoute(): string {
    switch (this.userRole) {
      case 'admin': return '/admin/tickets';
      case 'advisor': return '/dashboard/tickets';
      case 'desarrollador': return '/developer/tickets';
      default: return '/admin/tickets';
    }
  }

  tagLabel(type: string): string {
    return TYPE_LABELS[type] ?? 'Notificaci\u00f3n';
  }

  iconBg(type: string): string {
    return TYPE_BG[type] ?? '#F3F4F6';
  }

  iconFg(type: string): string {
    return TYPE_FG[type] ?? '#6B7280';
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