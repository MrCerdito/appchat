import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { VoicePlaybackService } from '../../../core/services/voice-playback.service';

const BARS = 36;
const BARS_COMPACT = 24;

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (!audioCtx) {
    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    } catch {
      audioCtx = null;
    }
  }
  return audioCtx;
}

let peaksCache: Map<string, number[]> | null = null;

function getPeaksCache(): Map<string, number[]> {
  if (!peaksCache) peaksCache = new Map<string, number[]>();
  return peaksCache;
}

let durationCache: Map<string, number> | null = null;

function getDurationCache(): Map<string, number> {
  if (!durationCache) durationCache = new Map<string, number>();
  return durationCache;
}

const HEARD_KEY = 'vp-heard-srcs';

let heardSrcs: Set<string> | null = null;

function getHeardSet(): Set<string> {
  if (!heardSrcs) {
    try {
      const raw = sessionStorage.getItem(HEARD_KEY);
      heardSrcs = new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      heardSrcs = new Set();
    }
  }
  return heardSrcs;
}

function computePeaks(channel: Float32Array, count: number): number[] {
  const peaks: number[] = [];
  const block = Math.max(1, Math.floor(channel.length / count));
  for (let i = 0; i < count; i++) {
    const start = i * block;
    let sum = 0;
    let len = 0;
    for (let j = start; j < start + block && j < channel.length; j++) {
      sum += channel[j] * channel[j];
      len++;
    }
    peaks.push(len ? Math.sqrt(sum / len) : 0);
  }
  const max = Math.max(...peaks, 1e-6);
  const min = Math.min(...peaks);
  const range = max - min || 1;
  return peaks.map(p => 0.18 + ((p - min) / range) * 0.82);
}

@Component({
  selector: 'wa-voice-player',
  standalone: true,
  imports: [],
  templateUrl: './voice-player.component.html',
  styleUrl: './voice-player.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.compact-mode]': 'compact' },
})
export class VoicePlayerComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() src = '';
  @Input() out = false;
  @Input() compact = false;
  @Input() avatar = '';

  @ViewChild('audio') audioRef?: ElementRef<HTMLAudioElement>;
  @ViewChild('track') trackRef?: ElementRef<HTMLElement>;

  peaks: number[] = [];
  playing = false;
  elapsed = 0;
  duration = 0;
  progress = 0;
  avatarFailed = false;
  dragging = false;
  heard = false;

  private audio?: HTMLAudioElement;
  private rafId = 0;
  private destroyed = false;
  private dragPointerId = -1;

  constructor(
    private readonly playback: VoicePlaybackService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.heard = getHeardSet().has(this.src);
    const cached = getPeaksCache().get(this.src);
    if (cached) {
      this.peaks = cached;
    } else {
      this.peaks = this.syntheticPeaks(this.src, this.compact ? BARS_COMPACT : BARS);
      this.decodePeaks();
    }
    this.resolveDuration();
  }

  ngAfterViewInit(): void {
    this.audio = this.audioRef?.nativeElement;
  }

  onLoadedMetadata(): void {
    const d = this.audio?.duration ?? 0;
    if (isFinite(d) && d > 0) {
      this.duration = d;
      getDurationCache().set(this.src, d);
    } else {
      this.resolveDuration();
    }
    this.cdr.detectChanges();
  }

  onTimeUpdate(): void {
    this.syncProgress();
  }

  onEnded(): void {
    this.playing = false;
    this.dragging = false;
    this.dragPointerId = -1;
    this.elapsed = 0;
    this.progress = 0;
    this.cdr.detectChanges();
  }

  toggle(): void {
    if (!this.audio) return;
    if (this.playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  play(): void {
    if (!this.audio) return;
    getAudioContext()?.resume().catch(() => undefined);
    this.playback.play(this);
    void this.audio.play()
      .then(() => {
        this.playing = true;
        this.markHeard();
        this.cdr.detectChanges();
        this.tick();
      })
      .catch(() => undefined);
  }

  pause(): void {
    this.audio?.pause();
    this.playing = false;
    this.cancelTick();
    this.cdr.detectChanges();
  }

  formatTime(sec: number): string {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  get timeLabel(): string {
    if (this.playing || this.progress > 0) {
      return `${this.formatTime(this.elapsed)} / ${this.formatTime(this.duration)}`;
    }
    return this.formatTime(this.duration);
  }

  onAvatarError(): void {
    this.avatarFailed = true;
    this.cdr.detectChanges();
  }

  onSeekStart(event: PointerEvent): void {
    if (this.duration <= 0) return;
    event.preventDefault();
    this.dragging = true;
    this.dragPointerId = event.pointerId;
    this.trackRef?.nativeElement.setPointerCapture?.(event.pointerId);
    this.seekFromEvent(event);
  }

  onSeekMove(event: PointerEvent): void {
    if (!this.dragging || event.pointerId !== this.dragPointerId) return;
    event.preventDefault();
    this.seekFromEvent(event);
  }

  onSeekEnd(event: PointerEvent): void {
    if (event.pointerId !== this.dragPointerId) return;
    this.dragging = false;
    this.dragPointerId = -1;
    this.trackRef?.nativeElement.releasePointerCapture?.(event.pointerId);
  }

  private markHeard(): void {
    if (this.heard || !this.src) return;
    this.heard = true;
    const set = getHeardSet();
    set.add(this.src);
    try {
      sessionStorage.setItem(HEARD_KEY, JSON.stringify([...set]));
    } catch {
      /* storage lleno o no disponible: el estado vive en memoria */
    }
  }

  private seekFromEvent(event: PointerEvent): void {
    const el = this.trackRef?.nativeElement;
    if (!el || this.duration <= 0) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    this.seekTo(fraction);
  }

  private seekTo(fraction: number): void {
    if (this.duration <= 0) return;
    const target = fraction * this.duration;
    if (this.audio) {
      try {
        this.audio.currentTime = target;
      } catch {
        /* keep UI position even if seek fails */
      }
    }
    this.elapsed = target;
    this.progress = fraction;
    this.cdr.detectChanges();
  }

  private async resolveDuration(): Promise<void> {
    const cached = getDurationCache().get(this.src);
    if (cached && cached > 0) {
      this.duration = cached;
      this.cdr.detectChanges();
      return;
    }
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      const res = await fetch(this.src);
      const buf = await res.arrayBuffer();
      const audioData = await ctx.decodeAudioData(buf.slice(0));
      const d = audioData.duration;
      if (isFinite(d) && d > 0) {
        this.duration = d;
        getDurationCache().set(this.src, d);
        this.cdr.detectChanges();
      }
    } catch {
      // keep whatever the audio element reported
    }
  }

  private tick(): void {
    this.syncProgress();
    if (this.playing && !this.destroyed) {
      this.rafId = requestAnimationFrame(() => this.tick());
    }
  }

  private syncProgress(): void {
    if (!this.audio || this.dragging) return;
    this.elapsed = this.audio.currentTime || 0;
    this.progress = this.duration > 0 ? Math.min(1, this.elapsed / this.duration) : 0;
    this.cdr.detectChanges();
  }

  private cancelTick(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private async decodePeaks(): Promise<void> {
    const count = this.compact ? BARS_COMPACT : BARS;
    try {
      const res = await fetch(this.src);
      const buf = await res.arrayBuffer();
      const ctx = getAudioContext();
      if (!ctx) return;
      const audioData = await ctx.decodeAudioData(buf.slice(0));
      const channel = audioData.getChannelData(0);
      const peaks = computePeaks(channel, count);
      this.peaks = peaks;
      getPeaksCache().set(this.src, peaks);
    } catch {
      // keep synthetic bars
    }
    this.cdr.detectChanges();
  }

  private syntheticPeaks(src: string, count: number): number[] {
    let h = 0;
    for (let i = 0; i < src.length; i++) {
      h = (h * 31 + src.charCodeAt(i)) >>> 0;
    }
    const rnd = (): number => {
      h = (h * 1103515245 + 12345) >>> 0;
      return h / 4294967296;
    };
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      out.push(0.3 + rnd() * 0.55);
    }
    return out;
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.cancelTick();
    this.playback.release(this);
    this.audio?.pause();
  }
}
