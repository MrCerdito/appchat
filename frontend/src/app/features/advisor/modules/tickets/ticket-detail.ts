import { Component, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { TicketService } from '../../../../core/services/ticket.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Ticket } from '../../../../core/models/ticket.model';
import { User } from '../../../../core/models/user.model';
import {
  priorityLabel, priorityColor, statusLabel, statusColor,
  TICKET_PRIORITIES, TICKET_STATUSES,
} from '../../../../shared/utils/ticket-categories';
import { SessionService } from '../../../../core/services/session.service';
import { trackByIndex } from '../../../../shared/utils/track-by';

@Component({
  selector: 'app-ticket-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './ticket-detail.html',
  styleUrl: './ticket-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TicketDetailComponent implements OnInit, OnDestroy {
  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityColor = priorityColor;
  protected readonly statusLabel = statusLabel;
  protected readonly statusColor = statusColor;
  protected readonly priorities = TICKET_PRIORITIES;
  protected readonly statuses = TICKET_STATUSES;
  protected readonly trackByIndex = trackByIndex;

  ticket: Ticket | null = null;
  advisors: User[] = [];
  categories: string[] = [];
  loading = true;
  editing = false;
  editDto = { titulo: '', descripcion: '', status: '', priority: '', category: '', assignedToId: '' };

  private destroy$ = new Subject<void>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private ticketService: TicketService,
    private auth: AuthService,
    private sessionService: SessionService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadAdvisors();
    this.loadCategories();
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe(params => {
      const id = params.get('id');
      if (id) this.load(id);
    });
  }

  load(id: string): void {
    this.loading = true;
    this.ticketService.findById(id).subscribe({
      next: (t) => {
        this.ticket = t;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
    });
  }

  loadAdvisors(): void {
    this.sessionService.findAdvisors().subscribe(a => {
      this.advisors = a;
      this.cdr.detectChanges();
    });
  }

  loadCategories(): void {
    this.ticketService.getCategories().subscribe(cats => {
      this.categories = cats;
      this.cdr.detectChanges();
    });
  }

  startEditing(): void {
    if (!this.ticket) return;
    this.editDto = {
      titulo: this.ticket.titulo,
      descripcion: this.ticket.descripcion || '',
      status: this.ticket.status,
      priority: this.ticket.priority,
      category: this.ticket.category || '',
      assignedToId: this.ticket.assignedTo?.id || '',
    };
    this.editing = true;
  }

  cancelEditing(): void {
    this.editing = false;
  }

  save(): void {
    if (!this.ticket || !this.editDto.titulo.trim()) return;
    const dto: any = {};
    if (this.editDto.titulo !== this.ticket.titulo) dto.titulo = this.editDto.titulo.trim();
    if (this.editDto.descripcion !== (this.ticket.descripcion || '')) dto.descripcion = this.editDto.descripcion || null;
    if (this.editDto.status !== this.ticket.status) dto.status = this.editDto.status;
    if (this.editDto.priority !== this.ticket.priority) dto.priority = this.editDto.priority;
    if (this.editDto.category !== (this.ticket.category || '')) dto.category = this.editDto.category || null;
    if (this.editDto.assignedToId !== (this.ticket.assignedTo?.id || '')) dto.assignedToId = this.editDto.assignedToId || null;

    if (Object.keys(dto).length === 0) { this.editing = false; return; }

    this.ticketService.update(this.ticket.id, dto).subscribe({
      next: (t) => {
        this.ticket = t;
        this.editing = false;
        this.cdr.detectChanges();
      },
      error: () => {},
    });
  }

  goBack(): void {
    this.router.navigate(['/dashboard/tickets']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
