import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private _sidebarForcedVisible = new BehaviorSubject<boolean>(false);

  sidebarForcedVisible$ = this._sidebarForcedVisible.asObservable();

  get sidebarForcedVisible(): boolean {
    return this._sidebarForcedVisible.value;
  }

  setSidebarForcedVisible(value: boolean): void {
    this._sidebarForcedVisible.next(value);
  }
}
