import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  icon?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private nextId = 0;
  toasts = signal<Toast[]>([]);

  show(type: Toast['type'], title: string, message = '', duration = 4000, icon?: string): void {
    const toast: Toast = { id: ++this.nextId, type, title, message, icon };
    this.toasts.update(t => [...t, toast]);
    setTimeout(() => this.remove(toast.id), duration);
  }

  success(title: string, message?: string): void { this.show('success', title, message ?? ''); }
  error(title: string, message?: string): void { this.show('error', title, message ?? ''); }
  info(title: string, message?: string, icon?: string): void { this.show('info', title, message ?? '', 4000, icon); }
  warning(title: string, message?: string): void { this.show('warning', title, message ?? ''); }

  remove(id: number): void {
    this.toasts.update(t => t.filter(t => t.id !== id));
  }
}
