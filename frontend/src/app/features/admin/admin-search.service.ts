import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AdminSearchService {
  private readonly query$ = new BehaviorSubject<string>('');

  get queryStream$(): Observable<string> {
    return this.query$.asObservable();
  }

  get snapshot(): string {
    return this.query$.value;
  }

  setQuery(q: string): void {
    if (this.query$.value === q) return;
    this.query$.next(q);
  }
}
