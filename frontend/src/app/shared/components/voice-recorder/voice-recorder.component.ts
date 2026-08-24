import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
} from '@angular/core';

export interface VoiceRecordingResult {
  file: File;
  duration: number;
}

const BAR_COUNT = 24;

@Component({
  selector: 'wa-voice-recorder',
  standalone: true,
  imports: [],
  templateUrl: './voice-recorder.component.html',
  styleUrl: './voice-recorder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRecorderComponent implements OnDestroy {
  @Input() disabled = false;

  @Output() fileReady = new EventEmitter<VoiceRecordingResult>();
  @Output() recordingChange = new EventEmitter<boolean>();
  @Output() error = new EventEmitter<string>();

  recording = false;
  paused = false;
  seconds = 0;
  bars: number[] = new Array<number>(BAR_COUNT).fill(0.18);
  canPause = false;
  barShift = 0;

  private mediaRecorder?: MediaRecorder;
  private chunks: Blob[] = [];
  private stream?: MediaStream;
  private audioCtx?: AudioContext;
  private analyser?: AnalyserNode;
  private dataArray?: Uint8Array<ArrayBuffer>;
  private rafId = 0;
  private intervalId?: ReturnType<typeof setInterval>;
  private recordingMs = 0;
  private lastTickAt = 0;
  private mimeType = '';
  private finalized = false;
  private resizeHandler?: () => void;

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly el: ElementRef<HTMLElement>,
  ) {}
  async start(): Promise<void> {
    if (this.disabled || this.recording) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.emit('Este navegador no permite grabar audio.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.stream = stream;
      this.mimeType = this.pickRecordingMimeType();
      this.mediaRecorder = new MediaRecorder(
        stream,
        this.mimeType ? { mimeType: this.mimeType } : undefined,
      );
      this.chunks = [];
      this.finalized = false;
      this.recordingMs = 0;
      this.paused = false;
      this.seconds = 0;
      this.canPause = typeof MediaRecorder.prototype.pause === 'function';

      this.mediaRecorder.ondataavailable = event => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.mediaRecorder.onstop = () => this.finalize();

      this.setupAnalyser(stream);
      this.mediaRecorder.start(250);
      this.recording = true;
      this.barShift = 0;
      this.lastTickAt = performance.now();
      this.intervalId = setInterval(() => this.updateClock(), 250);
      this.drawLoop();
      this.recordingChange.emit(true);
      this.cdr.detectChanges();
      requestAnimationFrame(() => {
        this.applyBarPlacement();
        window.addEventListener('resize', (this.resizeHandler = () => this.applyBarPlacement()));
      });
    } catch {
      this.cleanupStream();
      this.error.emit('No se pudo acceder al micrófono.');
    }
  }

  private applyBarPlacement(): void {
    if (!this.recording) return;
    const host = this.el.nativeElement;
    const bar = host.querySelector<HTMLElement>('.vr-bar');
    const container = host.parentElement ?? (host.offsetParent as HTMLElement | null);
    if (!bar || !container) return;
    bar.style.maxWidth = `${Math.max(240, container.clientWidth - 16)}px`;
    const c = container.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    const rawDelta = c.left + c.width / 2 - (b.left + b.width / 2);
    const minDelta = c.left + 8 - b.left;
    const maxDelta = c.right - 8 - b.right;
    this.barShift += Math.round(Math.max(minDelta, Math.min(maxDelta, rawDelta)));
    this.cdr.detectChanges();
  }

  togglePause(): void {
    if (!this.recording || !this.mediaRecorder || !this.canPause) return;
    if (this.paused) {
      this.mediaRecorder.resume();
      this.audioCtx?.resume().catch(() => undefined);
      this.paused = false;
      this.lastTickAt = performance.now();
    } else {
      this.recordingMs += performance.now() - this.lastTickAt;
      this.mediaRecorder.pause();
      this.audioCtx?.suspend().catch(() => undefined);
      this.paused = true;
    }
    this.cdr.detectChanges();
  }

  sendNow(): void {
    if (!this.recording || !this.mediaRecorder) return;
    this.mediaRecorder.stop();
  }

  cancel(): void {
    if (!this.recording || !this.mediaRecorder) return;
    this.finalized = true;
    this.mediaRecorder.stop();
  }

  formatTime(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }

  private finalize(): void {
    const done = this.finalized;
    this.finalized = true;
    const mime = this.mediaRecorder?.mimeType || this.mimeType || 'audio/webm';
    this.cleanupRecording();
    if (done) return;
    let type = this.normalizeMimeType(mime);
    // Solo se graba audio: si el navegador devuelve un contenedor video/*,
    // relabel como audio/mp4 para que se muestre como nota de voz (ondas).
    if (type.startsWith('video/')) {
      type = 'audio/mp4';
    }
    const blob = new Blob(this.chunks, { type });
    if (!blob.size) {
      this.error.emit('No se pudo capturar audio.');
      return;
    }
    const duration = this.seconds;
    const file = new File([blob], `nota-voz-${Date.now()}${this.extensionForMime(type)}`, { type });
    this.fileReady.emit({ file, duration });
  }

  private setupAnalyser(stream: MediaStream): void {
    try {
      const Ctor: typeof AudioContext | undefined =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.audioCtx = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      this.analyser = analyser;
      this.dataArray = new Uint8Array(analyser.fftSize);
    } catch {
      this.analyser = undefined;
    }
  }

  private drawLoop(): void {
    if (!this.recording) return;
    if (!this.paused && this.analyser && this.dataArray) {
      this.analyser.getByteTimeDomainData(this.dataArray);
      const bucket = Math.max(1, Math.floor(this.dataArray.length / BAR_COUNT));
      for (let i = 0; i < BAR_COUNT; i++) {
        const start = i * bucket;
        const end = Math.min(start + bucket, this.dataArray.length);
        let sum = 0;
        for (let j = start; j < end; j++) {
          sum += Math.abs(this.dataArray[j] - 128);
        }
        const avg = sum / Math.max(1, end - start);
        this.bars[i] = 0.12 + Math.min(1, avg / 60) * 0.88;
      }
      this.cdr.detectChanges();
    }
    this.rafId = requestAnimationFrame(() => this.drawLoop());
  }

  private updateClock(): void {
    if (!this.recording) return;
    const now = performance.now();
    const total = this.recordingMs + (this.paused ? 0 : now - this.lastTickAt);
    this.seconds = Math.floor(total / 1000);
    this.cdr.detectChanges();
  }

  private cleanupRecording(): void {
    this.recording = false;
    this.paused = false;
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = undefined;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    if (this.resizeHandler) window.removeEventListener('resize', this.resizeHandler);
    this.resizeHandler = undefined;
    this.cleanupStream();
    try {
      this.audioCtx?.close().catch(() => undefined);
    } catch {
      /* ignore */
    }
    this.audioCtx = undefined;
    this.analyser = undefined;
    this.dataArray = undefined;
    this.recordingChange.emit(false);
  }

  private cleanupStream(): void {
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
  }

  private pickRecordingMimeType(): string {
    const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return options.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  }

  private normalizeMimeType(mimeType = ''): string {
    return mimeType.toLowerCase().split(';')[0].trim();
  }

  private extensionForMime(mimeType: string): string {
    const map: Record<string, string> = {
      'audio/webm': '.webm',
      'audio/ogg': '.ogg',
      'audio/opus': '.ogg',
      'audio/mp4': '.m4a',
      'audio/mpeg': '.mp3',
      'audio/aac': '.aac',
      'audio/amr': '.amr',
      'audio/wav': '.wav',
    };
    return map[this.normalizeMimeType(mimeType)] || '.webm';
  }

  ngOnDestroy(): void {
    this.finalized = true;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    }
    this.cleanupRecording();
  }
}
