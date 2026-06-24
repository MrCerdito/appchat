import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { SocketService } from '../../../../core/services/socket.service';
import { SessionService } from '../../../../core/services/session.service';
import { Message } from '../../../../core/models/message.model';
import { Session } from '../../../../core/models/session.model';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';

@Component({
  selector: 'app-history-global',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './history.html',
  styleUrl: './history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryGlobalComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  sessions: Session[] = [];
  activeSession: Session | null = null;
  messages: Message[] = [];
  filter: 'all' | 'active' | 'closed' = 'all';
  search = '';
  loading = false;

  private destroy$ = new Subject<void>();

  constructor(
    private sessionService: SessionService,
    private socket: SocketService,
    private cdr: ChangeDetectorRef,
  ) {}

  get filteredSessions(): Session[] {
    return this.sessions.filter(s => {
      const matchFilter =
        this.filter === 'all' ||
        (this.filter === 'active' && s.status !== 'closed') ||
        (this.filter === 'closed' && s.status === 'closed');
      const matchSearch = !this.search ||
        s.clientName.toLowerCase().includes(this.search.toLowerCase()) ||
        s.advisor?.name?.toLowerCase().includes(this.search.toLowerCase());
      return matchFilter && matchSearch;
    });
  }

  ngOnInit(): void {
    this.loadSessions();
    this.listenSocketEvents();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private listenSocketEvents(): void {
    this.socket.on<{ sessionId: string }>('session_updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadSessions();
      });

    this.socket.on<any>('new_message')
      .pipe(takeUntil(this.destroy$))
      .subscribe((msg) => {
        if (this.activeSession && msg.sessionId === this.activeSession.id) {
          if (!this.messages.some(m => m.id === msg.id)) {
            this.messages = [...this.messages, msg];
            this.cdr.detectChanges();
            this.scrollToBottom();
          }
        }
      });
  }

  loadSessions(): void {
    this.sessionService.findAllAdmin().subscribe({
      next: (s) => { this.sessions = s; this.cdr.detectChanges(); },
    });
  }

  selectSession(session: Session): void {
    this.activeSession = session;
    this.messages = [];
    this.loading = true;
    this.socket.emit('join_session', { sessionId: session.id });

    this.sessionService.getMessages(session.id).subscribe({
      next: (msgs) => {
        this.messages = msgs;
        this.loading = false;
        this.cdr.detectChanges();
        this.scrollToBottom();
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
    });
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = { waiting: 'Esperando', active: 'Activo', closed: 'Cerrado' };
    return map[status] ?? status;
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      }
    }, 50);
  }
}