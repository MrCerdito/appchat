import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private _sidebarForcedVisible = new BehaviorSubject<boolean>(false);
  private _sidebarForcedCollapsed = new BehaviorSubject<boolean>(false);
  private _toggleSidebarRequested = new Subject<void>();

  sidebarForcedVisible$ = this._sidebarForcedVisible.asObservable();
  sidebarForcedCollapsed$ = this._sidebarForcedCollapsed.asObservable();
  toggleSidebarRequested$ = this._toggleSidebarRequested.asObservable();

  get sidebarForcedVisible(): boolean {
    return this._sidebarForcedVisible.value;
  }

  get sidebarForcedCollapsed(): boolean {
    return this._sidebarForcedCollapsed.value;
  }

  setSidebarForcedVisible(value: boolean): void {
    this._sidebarForcedVisible.next(value);
  }

  setSidebarForcedCollapsed(value: boolean): void {
    this._sidebarForcedCollapsed.next(value);
  }

  requestSidebarToggle(): void {
    this._toggleSidebarRequested.next();
  }
}
