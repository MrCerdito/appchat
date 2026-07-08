import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type ThemeMode = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService implements OnDestroy {
  private theme$ = new BehaviorSubject<'light' | 'dark'>('light');
  private mode$ = new BehaviorSubject<ThemeMode>('light');
  private mode: ThemeMode = 'light';
  private systemMedia: MediaQueryList;
  private systemHandler: ((e: MediaQueryListEvent) => void) | null = null;

  constructor() {
    this.systemMedia = window.matchMedia('(prefers-color-scheme: dark)');
    const saved = localStorage.getItem('theme') as ThemeMode | null;
    this.setMode(saved || 'light');
  }

  get currentTheme(): 'light' | 'dark' {
    return this.theme$.value;
  }

  get currentTheme$(): Observable<'light' | 'dark'> {
    return this.theme$.asObservable();
  }

  get currentMode$(): Observable<ThemeMode> {
    return this.mode$.asObservable();
  }

  get currentMode(): ThemeMode {
    return this.mode;
  }

  setMode(mode: ThemeMode): void {
    this.mode = mode;
    this.mode$.next(mode);
    localStorage.setItem('theme', mode);
    this.detachSystemListener();
    if (mode === 'system') {
      this.applyTheme(this.systemMedia.matches ? 'dark' : 'light');
      this.systemHandler = (e: MediaQueryListEvent) => {
        this.applyTheme(e.matches ? 'dark' : 'light');
      };
      this.systemMedia.addEventListener('change', this.systemHandler);
    } else {
      this.applyTheme(mode);
    }
  }

  private applyTheme(theme: 'light' | 'dark'): void {
    document.documentElement.setAttribute('data-theme', theme);
    this.theme$.next(theme);
  }

  private detachSystemListener(): void {
    if (this.systemHandler) {
      this.systemMedia.removeEventListener('change', this.systemHandler);
      this.systemHandler = null;
    }
  }

  ngOnDestroy(): void {
    this.detachSystemListener();
  }
}
