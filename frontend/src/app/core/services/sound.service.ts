import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SoundService {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  private originalTitle = typeof document !== 'undefined' ? document.title : 'InnovaCloud';
  private lastNotificationByTag = new Map<string, number>();
  private titleBlinkTimer?: ReturnType<typeof setInterval>;
  soundEnabled = true;
  soundWhatsapp = 'whatsapp1';
  soundAsesor = 'asesor1';
  soundCliente = 'cliente1';
  soundAsignacion = 'asignacion1';

  init(): void {
    this.enableDesktopNotifications();
    this.installAudioUnlock();
    this.loadSoundConfig();
  }

  loadSoundConfig(): void {
    try {
      const saved = localStorage.getItem('soundConfig');
      if (saved) {
        const cfg = JSON.parse(saved);
        this.soundEnabled = cfg.enabled !== false;
        this.soundWhatsapp = cfg.whatsapp || 'whatsapp1';
        this.soundAsesor = cfg.asesor || 'asesor1';
        this.soundCliente = cfg.cliente || 'cliente1';
        this.soundAsignacion = cfg.asignacion || 'asignacion1';
      }
    } catch {
      // ignore
    }
  }

  setSoundConfig(enabled: boolean, whatsapp: string, asesor: string, cliente: string, asignacion: string): void {
    this.soundEnabled = enabled;
    this.soundWhatsapp = whatsapp;
    this.soundAsesor = asesor;
    this.soundCliente = cliente;
    this.soundAsignacion = asignacion;
    try {
      localStorage.setItem('soundConfig', JSON.stringify({ enabled, whatsapp, asesor, cliente, asignacion }));
    } catch {
      // ignore
    }
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
    if (!this.soundEnabled) return;
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
    if (!this.soundEnabled) return;
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
    if (!this.soundEnabled) return;
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
    if (!this.soundEnabled) return;
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

  /** Dispara el sonido de mensaje de asesor según el tipo configurado */
  playAdvisorMessage(): void {
    if (!this.soundEnabled) return;
    this.dispatchAsesor(this.soundAsesor);
  }

  /** Dispara el sonido de mensaje de cliente según el tipo configurado */
  playClientMessage(): void {
    if (!this.soundEnabled) return;
    this.dispatchCliente(this.soundCliente);
  }

  playCriticalMessage(): void {
    if (!this.soundEnabled) return;
    this.playToneSequence([
      { frequency: 740, at: 0, duration: 0.07, gain: 0.22, type: 'triangle' },
      { frequency: 980, at: 0.1, duration: 0.09, gain: 0.2, type: 'sine' },
      { frequency: 1240, at: 0.24, duration: 0.11, gain: 0.18, type: 'triangle' },
    ]);
  }

  /** Dispara el sonido de WhatsApp según el tipo configurado */
  playWhatsappAssignment(): void {
    if (!this.soundEnabled) return;
    this.dispatchWhatsapp(this.soundWhatsapp);
  }

  playWhatsappAssignedMessage(): void {
    if (!this.soundEnabled) return;
    this.dispatchWhatsapp(this.soundWhatsapp);
  }

  playTicketNotification(): void {
    if (!this.soundEnabled) return;
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

  /** Dispara el sonido de cola WhatsApp según el tipo configurado */
  playWhatsappQueue(): void {
    if (!this.soundEnabled) return;
    this.dispatchWhatsapp(this.soundWhatsapp);
  }

  /** Dispara el sonido de asignación según el tipo configurado */
  playAssignmentSound(): void {
    if (!this.soundEnabled) return;
    this.dispatchAsignacion(this.soundAsignacion);
  }

  /** Reproduce sonido de prueba para una categoría y tipo específicos */
  playTestSound(category: string, type: string): void {
    const wasEnabled = this.soundEnabled;
    this.soundEnabled = true;
    switch (category) {
      case 'whatsapp': this.dispatchWhatsapp(type); break;
      case 'asesor': this.dispatchAsesor(type); break;
      case 'cliente': this.dispatchCliente(type); break;
      case 'asignacion': this.dispatchAsignacion(type); break;
      default: this.dispatchWhatsapp(type); break;
    }
    this.soundEnabled = wasEnabled;
  }

  // ── Dispachers por categoría ─────────────────────────────────────────

  private dispatchWhatsapp(type: string): void {
    switch (type) {
      case 'whatsapp1': this.playWsp1(); break;
      case 'whatsapp2': this.playWsp2(); break;
      case 'whatsapp3': this.playWsp3(); break;
      case 'whatsapp4': this.playWsp4(); break;
      case 'whatsapp5': this.playWsp5(); break;
      case 'whatsapp6': this.playWsp6(); break;
      case 'fuerte': this.playFuerte(); break;
      case 'alerta': this.playAlerta(); break;
      case 'timbre': this.playTimbre(); break;
      case 'campana': this.playCampana(); break;
      default: this.playNotification(); break;
    }
  }

  private dispatchAsesor(type: string): void {
    switch (type) {
      case 'asesor1': this.playAsesor1(); break;
      case 'asesor2': this.playAsesor2(); break;
      case 'asesor3': this.playAsesor3(); break;
      case 'asesor4': this.playAsesor4(); break;
      case 'asesor5': this.playAsesor5(); break;
      case 'fuerte': this.playFuerte(); break;
      case 'alerta': this.playAlerta(); break;
      case 'timbre': this.playTimbre(); break;
      case 'campana': this.playCampana(); break;
      default: this.playAsesor1(); break;
    }
  }

  private dispatchCliente(type: string): void {
    switch (type) {
      case 'cliente1': this.playCliente1(); break;
      case 'cliente2': this.playCliente2(); break;
      case 'cliente3': this.playCliente3(); break;
      case 'cliente4': this.playCliente4(); break;
      case 'cliente5': this.playCliente5(); break;
      case 'fuerte': this.playFuerte(); break;
      case 'alerta': this.playAlerta(); break;
      case 'timbre': this.playTimbre(); break;
      case 'campana': this.playCampana(); break;
      default: this.playCliente1(); break;
    }
  }

  private dispatchAsignacion(type: string): void {
    switch (type) {
      case 'asignacion1': this.playAsignacion1(); break;
      case 'asignacion2': this.playAsignacion2(); break;
      case 'asignacion3': this.playAsignacion3(); break;
      case 'asignacion4': this.playAsignacion4(); break;
      case 'fuerte': this.playFuerte(); break;
      case 'alerta': this.playAlerta(); break;
      case 'timbre': this.playTimbre(); break;
      case 'campana': this.playCampana(); break;
      default: this.playAsignacion1(); break;
    }
  }

  private playWsp1(): void {
    try {
      const ctx = this.getCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(784, start);
      osc1.frequency.setValueAtTime(1047, start + 0.08);
      osc1.connect(gain);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(988, start + 0.12);
      osc2.frequency.setValueAtTime(1319, start + 0.2);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
      gain.gain.setValueAtTime(0.001, start + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.3, start + 0.135);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);

      osc1.start(start); osc1.stop(start + 0.1);
      osc2.start(start + 0.12); osc2.stop(start + 0.22);
    } catch { /* ignore */ }
  }

  private playWsp2(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(660, start);
      osc.frequency.setValueAtTime(880, start + 0.06);
      osc.frequency.setValueAtTime(588, start + 0.14);
      osc.frequency.setValueAtTime(784, start + 0.2);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
      gain.gain.setValueAtTime(0.001, start + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.155);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

      osc.start(start); osc.stop(start + 0.35);
    } catch { /* ignore */ }
  }

  private playWsp3(): void {
    try {
      const ctx = this.getCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(523, start);
      osc1.frequency.setValueAtTime(659, start + 0.06);
      osc1.frequency.setValueAtTime(784, start + 0.12);
      osc1.connect(gain);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1047, start + 0.06);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
      gain.gain.setValueAtTime(0.001, start + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.135);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);

      osc1.start(start); osc1.stop(start + 0.3);
      osc2.start(start + 0.06); osc2.stop(start + 0.2);
    } catch { /* ignore */ }
  }

  private playWsp4(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(880, start);
      osc.frequency.setValueAtTime(1320, start + 0.07);
      osc.frequency.setValueAtTime(880, start + 0.15);
      osc.frequency.setValueAtTime(1320, start + 0.22);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.07);
      gain.gain.setValueAtTime(0.001, start + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.165);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
      gain.gain.setValueAtTime(0.001, start + 0.28);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.295);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.34);

      osc.start(start); osc.stop(start + 0.38);
    } catch { /* ignore */ }
  }

  private playWsp5(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(440, start);
      osc.frequency.setValueAtTime(554, start + 0.08);
      osc.frequency.setValueAtTime(659, start + 0.16);
      osc.frequency.setValueAtTime(880, start + 0.24);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);
      gain.gain.setValueAtTime(0.001, start + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.175);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      gain.gain.setValueAtTime(0.001, start + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.315);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.38);

      osc.start(start); osc.stop(start + 0.42);
    } catch { /* ignore */ }
  }

  private playWsp6(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(600, start);
      osc.frequency.setValueAtTime(800, start + 0.05);
      osc.frequency.setValueAtTime(600, start + 0.1);
      osc.frequency.setValueAtTime(800, start + 0.15);
      osc.frequency.setValueAtTime(600, start + 0.2);
      osc.frequency.setValueAtTime(800, start + 0.25);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.05);
      gain.gain.setValueAtTime(0.001, start + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.11);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
      gain.gain.setValueAtTime(0.001, start + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.21);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
      gain.gain.setValueAtTime(0.001, start + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.31);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);

      osc.start(start); osc.stop(start + 0.4);
    } catch { /* ignore */ }
  }

  // ── Sonidos para Asesor ───────────────────────────────────────────

  private playAsesor1(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(920, start);
      osc.frequency.setValueAtTime(1220, start + 0.11);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

      osc.start(start); osc.stop(start + 0.27);
    } catch { /* ignore */ }
  }

  private playAsesor2(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(880, start);
      osc.frequency.setValueAtTime(1100, start + 0.08);
      osc.frequency.setValueAtTime(1320, start + 0.16);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
      gain.gain.setValueAtTime(0.001, start + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.14, start + 0.175);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

      osc.start(start); osc.stop(start + 0.32);
    } catch { /* ignore */ }
  }

  private playAsesor3(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(740, start);
      osc.frequency.setValueAtTime(988, start + 0.06);
      osc.frequency.setValueAtTime(740, start + 0.14);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.07);
      gain.gain.setValueAtTime(0.001, start + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.155);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

      osc.start(start); osc.stop(start + 0.32);
    } catch { /* ignore */ }
  }

  private playAsesor4(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(1047, start);
      osc.frequency.setValueAtTime(784, start + 0.08);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);

      osc.start(start); osc.stop(start + 0.22);
    } catch { /* ignore */ }
  }

  private playAsesor5(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(660, start);
      osc.frequency.setValueAtTime(880, start + 0.06);
      osc.frequency.setValueAtTime(1047, start + 0.12);
      osc.frequency.setValueAtTime(880, start + 0.18);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
      gain.gain.setValueAtTime(0.001, start + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.135);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      gain.gain.setValueAtTime(0.001, start + 0.24);
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.255);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);

      osc.start(start); osc.stop(start + 0.35);
    } catch { /* ignore */ }
  }

  // ── Sonidos para Cliente ──────────────────────────────────────────

  private playCliente1(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(740, start);
      osc.frequency.setValueAtTime(980, start + 0.085);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.13, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);

      osc.start(start); osc.stop(start + 0.2);
    } catch { /* ignore */ }
  }

  private playCliente2(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(587, start);
      osc.frequency.setValueAtTime(880, start + 0.07);
      osc.frequency.setValueAtTime(587, start + 0.14);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.07);
      gain.gain.setValueAtTime(0.001, start + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.155);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);

      osc.start(start); osc.stop(start + 0.3);
    } catch { /* ignore */ }
  }

  private playCliente3(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(440, start);
      osc.frequency.setValueAtTime(554, start + 0.06);
      osc.frequency.setValueAtTime(440, start + 0.12);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
      gain.gain.setValueAtTime(0.001, start + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.135);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);

      osc.start(start); osc.stop(start + 0.25);
    } catch { /* ignore */ }
  }

  private playCliente4(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(1047, start);
      osc.frequency.setValueAtTime(784, start + 0.06);
      osc.frequency.setValueAtTime(1047, start + 0.12);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.1, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
      gain.gain.setValueAtTime(0.001, start + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.1, start + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

      osc.start(start); osc.stop(start + 0.28);
    } catch { /* ignore */ }
  }

  private playCliente5(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(523, start);
      osc.frequency.setValueAtTime(659, start + 0.05);
      osc.frequency.setValueAtTime(784, start + 0.1);
      osc.frequency.setValueAtTime(659, start + 0.15);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.05);
      gain.gain.setValueAtTime(0.001, start + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.115);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);
      gain.gain.setValueAtTime(0.001, start + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.215);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);

      osc.start(start); osc.stop(start + 0.3);
    } catch { /* ignore */ }
  }

  // ── Sonidos para Asignación ───────────────────────────────────────

  private playAsignacion1(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(740, start);
      osc.frequency.setValueAtTime(988, start + 0.12);
      osc.frequency.setValueAtTime(784, start + 0.24);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.055, start + 0.11);
      gain.gain.exponentialRampToValueAtTime(0.2, start + 0.145);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);

      osc.start(start); osc.stop(start + 0.44);
    } catch { /* ignore */ }
  }

  private playAsignacion2(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(660, start);
      osc.frequency.setValueAtTime(880, start + 0.08);
      osc.frequency.setValueAtTime(1100, start + 0.16);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
      gain.gain.setValueAtTime(0.001, start + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.175);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);

      osc.start(start); osc.stop(start + 0.34);
    } catch { /* ignore */ }
  }

  private playAsignacion3(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(784, start);
      osc.frequency.setValueAtTime(1047, start + 0.08);
      osc.frequency.setValueAtTime(1175, start + 0.16);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.08);
      gain.gain.setValueAtTime(0.001, start + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.175);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

      osc.start(start); osc.stop(start + 0.32);
    } catch { /* ignore */ }
  }

  private playAsignacion4(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(392, start);
      osc.frequency.setValueAtTime(523, start + 0.13);
      osc.frequency.setValueAtTime(659, start + 0.26);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.28);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.48);

      osc.start(start); osc.stop(start + 0.5);
    } catch { /* ignore */ }
  }

  private playFuerte(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(280, start);
      osc.frequency.setValueAtTime(440, start + 0.08);
      osc.frequency.setValueAtTime(350, start + 0.18);
      osc.frequency.setValueAtTime(550, start + 0.26);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
      gain.gain.setValueAtTime(0.001, start + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.45, start + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.38);

      osc.start(start); osc.stop(start + 0.42);
    } catch { /* ignore */ }
  }

  private playSuave(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(1047, start);
      osc.frequency.setValueAtTime(1319, start + 0.08);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);

      osc.start(start); osc.stop(start + 0.28);
    } catch { /* ignore */ }
  }

  private playTimbre(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(800, start);
      osc.frequency.setValueAtTime(800, start + 0.22);
      osc.frequency.setValueAtTime(800, start + 0.44);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      gain.gain.setValueAtTime(0.001, start + 0.22);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.235);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.42);
      gain.gain.setValueAtTime(0.001, start + 0.44);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.455);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.64);

      osc.start(start); osc.stop(start + 0.68);
    } catch { /* ignore */ }
  }

  private playAlerta(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'square';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(660, start);
      osc.frequency.setValueAtTime(880, start + 0.06);
      osc.frequency.setValueAtTime(660, start + 0.12);
      osc.frequency.setValueAtTime(880, start + 0.18);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
      gain.gain.setValueAtTime(0.001, start + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.135);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      gain.gain.setValueAtTime(0.001, start + 0.24);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.255);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

      osc.start(start); osc.stop(start + 0.35);
    } catch { /* ignore */ }
  }

  private playCampana(): void {
    try {
      const ctx = this.getCtx();
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(988, start);
      osc1.connect(gain);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1976, start);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.8);

      osc1.start(start); osc1.stop(start + 0.85);
      osc2.start(start); osc2.stop(start + 0.85);
    } catch { /* ignore */ }
  }

  private playDigital(): void {
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = ctx.currentTime;

      osc.type = 'square';
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(1200, start);
      osc.frequency.setValueAtTime(1000, start + 0.04);
      osc.frequency.setValueAtTime(1400, start + 0.08);
      osc.frequency.setValueAtTime(1000, start + 0.12);

      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.04);
      gain.gain.setValueAtTime(0.001, start + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
      gain.gain.setValueAtTime(0.001, start + 0.16);
      gain.gain.exponentialRampToValueAtTime(0.15, start + 0.17);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);

      osc.start(start); osc.stop(start + 0.25);
    } catch { /* ignore */ }
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
      const notification = new Notification('\u{1F514} ' + title, {
        body,
        tag,
        silent: false,
        requireInteraction: false,
        icon: '/icon.jpg',
        badge: '/icon.jpg',
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
