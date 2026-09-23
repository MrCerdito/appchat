import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { SessionService } from '../../../../core/services/session.service';
import { ColegiosConfigComponent } from '../configuracion/components/colegios-config/colegios-config.component';

@Component({
  selector: 'app-colegios-page',
  standalone: true,
  imports: [CommonModule, ColegiosConfigComponent],
  templateUrl: './colegios-page.html',
  styleUrl: './colegios-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColegiosPageComponent implements OnInit, OnDestroy {
  advisorsList: { id: string; name: string }[] = [];

  private destroy$ = new Subject<void>();

  constructor(
    private sessionService: SessionService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.sessionService
      .findAdvisors()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (advisors) => {
          this.advisorsList = advisors.map((a) => ({ id: a.id, name: a.name }));
          this.cdr.detectChanges();
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}