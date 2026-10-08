import {
  Component,
  ChangeDetectorRef,
  EventEmitter,
  HostBinding,
  Input,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ThemeService } from '../../../../../../core/services/theme.service';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-modal.component.html',
  styleUrl: './confirm-modal.component.scss',
})
export class ConfirmModalComponent implements OnInit, OnDestroy {
  @HostBinding('class.theme-dark') protected themeDark = false;

  @Input() title = '¿Confirmar?';
  @Input() message = '';
  @Input() confirmLabel = 'Confirmar';
  @Input() cancelLabel = 'Cancelar';
  @Input() danger = false;
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly themeService: ThemeService,
  ) {}

  ngOnInit(): void {
    this.themeDark = this.themeService.currentTheme === 'dark';
    this.themeService.currentTheme$.pipe(takeUntil(this.destroy$)).subscribe((t) => {
      this.themeDark = t === 'dark';
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onConfirm(): void {
    this.confirm.emit();
  }

  onCancel(): void {
    this.cancel.emit();
  }
}
