import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private originalTitle = typeof document !== 'undefined' ? document.title : 'InnovaCloud';
  private lastNotificationByTag = new Map<string, number>();
  private titleBlinkTimer?: ReturnType<typeof setInterval>;

  init(): void {
    this.enableDesktopNotifications();
    this.installAudioUnlock();
  }

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  playErrorSound(): void {
    try {
      const ctx = this.getCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(400, start);
      oscillator.frequency.exponentialRampToValueAtTime(200, start + 0.25);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.05, start + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

      oscillator.start(start);
      oscillator.stop(start + 0.3);
    } catch {
      // ignore
    }
  }

  playSuccessSound(): void {
    try {
      const ctx = this.getCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523, start);
      oscillator.frequency.setValueAtTime(659, start + 0.1);
      oscillator.frequency.setValueAtTime(784, start + 0.2);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

      oscillator.start(start);
      oscillator.stop(start + 0.35);
    } catch {
      // ignore
    }
  }

  playMessage(): void {
    try {
      const ctx = this.getCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {
      // ignore
    }
  }

  playNotification(): void {
    try {
      const ctx = this.getCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(523, ctx.currentTime);
      oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.2);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.4);
    } catch {
      // ignore
    }
  }

  playAdvisorMessage(): void {
    this.playToneSequence([
      { frequency: 920, at: 0, duration: 0.08, gain: 0.16, type: 'sine' },
      { frequency: 1220, at: 0.11, duration: 0.12, gain: 0.13, type: 'triangle' },
    ]);
  }

  playClientMessage(): void {
    this.playToneSequence([
      { frequency: 740, at: 0, duration: 0.06, gain: 0.13, type: 'triangle' },
      { frequency: 980, at: 0.085, duration: 0.09, gain: 0.12, type: 'sine' },
    ]);
  }

  playCriticalMessage(): void {
    this.playToneSequence([
      { frequency: 740, at: 0, duration: 0.07, gain: 0.22, type: 'triangle' },
      { frequency: 980, at: 0.1, duration: 0.09, gain: 0.2, type: 'sine' },
      { frequency: 1240, at: 0.24, duration: 0.11, gain: 0.18, type: 'triangle' },
    ]);
  }

  playWhatsappAssignment(): void {
    try {
      const ctx = this.getCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      oscillator.type = 'sine';
      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(740, start);
      oscillator.frequency.setValueAtTime(988, start + 0.12);
      oscillator.frequency.setValueAtTime(784, start + 0.24);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.11);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.145);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);

      oscillator.start(start);
      oscillator.stop(start + 0.44);
    } catch {
      // ignore
    }
  }

  playWhatsappAssignedMessage(): void {
    try {
      const ctx = this.getCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      oscillator.type = 'triangle';
      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(660, start);
      oscillator.frequency.setValueAtTime(880, start + 0.08);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);

      oscillator.start(start);
      oscillator.stop(start + 0.26);
    } catch {
      // ignore
    }
  }

  playTicketNotification(): void {
    this.playToneSequence([
      { frequency: 660, at: 0, duration: 0.08, gain: 0.15, type: 'sine' },
      { frequency: 880, at: 0.1, duration: 0.08, gain: 0.15, type: 'sine' },
      { frequency: 1100, at: 0.2, duration: 0.12, gain: 0.12, type: 'triangle' },
    ]);
  }

  ping(): void {
    try {
      const ctx = this.getCtx();
      if (ctx.state === 'suspended') ctx.resume().catch(() => undefined);
    } catch {
      // ignore
    }
  }

  playWhatsappQueue(): void {
    try {
      const ctx = this.getCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      oscillator.type = 'sine';
      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(392, start);
      oscillator.frequency.setValueAtTime(523, start + 0.13);
      oscillator.frequency.setValueAtTime(659, start + 0.26);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.28);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.48);

      oscillator.start(start);
      oscillator.stop(start + 0.5);
    } catch {
      // ignore
    }
  }

  enableDesktopNotifications(): void {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => undefined);
    }
  }

  notify(title: string, body: string, tag = 'chat-notification'): void {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const now = Date.now();
    const lastForTag = this.lastNotificationByTag.get(tag) ?? 0;
    if (now - lastForTag < 350) return;
    this.lastNotificationByTag.set(tag, now);

    try {
      const notification = new Notification(title, {
        body,
        tag,
        silent: false,
        requireInteraction: false,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      setTimeout(() => notification.close(), 5500);
    } catch {
      // ignore
    }
  }

  setUnreadBadge(count: number): void {
    const safeCount = Math.max(0, count);
    document.title = safeCount > 0 ? `(${safeCount}) ${this.originalTitle}` : this.originalTitle;

    const nav = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    if (safeCount > 0) {
      nav.setAppBadge?.(safeCount).catch(() => undefined);
    } else {
      nav.clearAppBadge?.().catch(() => undefined);
      this.stopTitleBlink();
    }
  }

  startTitleBlink(count: number): void {
    if (count <= 0 || this.titleBlinkTimer) return;
    let showAlert = true;
    this.titleBlinkTimer = setInterval(() => {
      if (!document.hidden) {
        this.stopTitleBlink();
        this.setUnreadBadge(count);
        return;
      }
      document.title = showAlert ? `Nuevo mensaje (${count})` : this.originalTitle;
      showAlert = !showAlert;
    }, 1200);
  }

  stopTitleBlink(): void {
    if (!this.titleBlinkTimer) return;
    clearInterval(this.titleBlinkTimer);
    this.titleBlinkTimer = undefined;
  }

  private installAudioUnlock(): void {
    if (this.unlocked || typeof window === 'undefined') return;
    const unlock = () => {
      try {
        this.getCtx();
        this.unlocked = true;
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      } catch {
        // Browser will allow it after a real user gesture.
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  private playToneSequence(notes: Array<{
    frequency: number;
    at: number;
    duration: number;
    gain: number;
    type: OscillatorType;
  }>): void {
    try {
      const ctx = this.getCtx();
      const start = ctx.currentTime;

      notes.forEach(note => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.type = note.type;
        oscillator.frequency.setValueAtTime(note.frequency, start + note.at);
        oscillator.connect(gain);
        gain.connect(ctx.destination);

        gain.gain.setValueAtTime(0.001, start + note.at);
        gain.gain.exponentialRampToValueAtTime(note.gain, start + note.at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, start + note.at + note.duration);

        oscillator.start(start + note.at);
        oscillator.stop(start + note.at + note.duration + 0.02);
      });
    } catch {
      // ignore
    }
  }
}
