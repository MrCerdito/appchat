import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
    :host { display: block; }
    .toast-container {
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      max-width: 380px;
      width: 100%;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      border-radius: var(--radius-md, 8px);
      background: var(--surface, #ffffff);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
      border-left: 4px solid var(--text-muted, #6b6560);
      cursor: pointer;
      animation: toast-in 0.3s ease;
      transition: opacity 0.2s, transform 0.2s;
    }
    .toast:hover {
      opacity: 0.9;
      transform: translateX(-2px);
    }
    .toast-success { border-left-color: var(--success, #10b981); }
    .toast-error   { border-left-color: var(--danger, #ef4444); }
    .toast-warning { border-left-color: var(--warning, #f59e0b); }
    .toast-info    { border-left-color: var(--info, #3b82f6); }
    .toast-icon {
      flex-shrink: 0;
      width: 22px;
      height: 22px;
      margin-top: 1px;
    }
    .toast-icon svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    .toast-success .toast-icon { color: var(--success, #10b981); }
    .toast-error   .toast-icon { color: var(--danger, #ef4444); }
    .toast-warning .toast-icon { color: var(--warning, #f59e0b); }
    .toast-info    .toast-icon { color: var(--info, #3b82f6); }
    .toast-body { flex: 1; min-width: 0; }
    .toast-title {
      font-weight: 600;
      font-size: 0.9rem;
      color: var(--text, #181614);
      line-height: 1.3;
    }
    .toast-message {
      font-size: 0.8rem;
      color: var(--text-muted, #6b6560);
      margin-top: 2px;
      line-height: 1.4;
    }
    .toast-close {
      flex-shrink: 0;
      background: none;
      border: none;
      font-size: 1.2rem;
      color: var(--text-faint, #9e9890);
      cursor: pointer;
      padding: 0 2px;
      line-height: 1;
    }
    .toast-close:hover { color: var(--text, #181614); }
    @keyframes toast-in {
      from { opacity: 0; transform: translateX(40px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    `,
  ],
  template: `
    <div class="toast-container" aria-live="polite">
      @for (toast of notification.toasts(); track toast.id) {
        <div class="toast toast-{{ toast.type }}" (click)="notification.remove(toast.id)">
          <div class="toast-icon">
            @switch (toast.type) {
              @case ('success') {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              }
              @case ('error') {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              }
              @case ('warning') {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              }
              @case ('info') {
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              }
            }
          </div>
          <div class="toast-body">
            <div class="toast-title">{{ toast.title }}</div>
            @if (toast.message) {
              <div class="toast-message">{{ toast.message }}</div>
            }
          </div>
          <button class="toast-close" (click)="notification.remove(toast.id); $event.stopPropagation()">&times;</button>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  constructor(public notification: NotificationService) {}
}
