import { Component, OnInit, OnDestroy, ViewChild, ElementRef, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScrollingModule, CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { SocketService } from '../../../../core/services/socket.service';
import { SessionService } from '../../../../core/services/session.service';
import { Message } from '../../../../core/models/message.model';
import { Session } from '../../../../core/models/session.model';
import { trackByIndex, trackById } from '../../../../shared/utils/track-by';
import { scrollToBottom } from '../../../../shared/utils/scroll';

@Component({
  selector: 'app-history-global',
  standalone: true,
  imports: [CommonModule, FormsModule, ScrollingModule],
  templateUrl: './history.html',
  styleUrl: './history.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HistoryGlobalComponent implements OnInit, OnDestroy {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;

  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild(CdkVirtualScrollViewport) viewport?: CdkVirtualScrollViewport;

  sessions: Session[] = [];
  activeSession: Session | null = null;
  messages: Message[] = [];
  filter: 'all' | 'active' | 'closed' = 'all';
  search = '';
  loading = false;
  loadingMore = false;

  currentPage = 1;
  totalPages = 1;
  pageSize = 20;

  unreadCounts = new Map<string, number>();

  private destroy$ = new Subject<void>();
  private sessionUpdatedTrigger = new Subject<void>();

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
    this.loadSessions(1);

    this.sessionUpdatedTrigger.pipe(
      debounceTime(300),
      takeUntil(this.destroy$),
    ).subscribe(() => this.loadSessions(1));

    this.listenSocketEvents();
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.viewport?.elementScrolled().pipe(
        debounceTime(100),
        takeUntil(this.destroy$),
      ).subscribe(() => {
        const offset = this.viewport!.measureScrollOffset('bottom');
        if (offset < 120) this.loadMore();
      });
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private listenSocketEvents(): void {
    this.socket.on<{ sessionId: string }>('session_updated')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.sessionUpdatedTrigger.next());

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
        if (!this.activeSession || msg.sessionId !== this.activeSession.id) {
          const current = this.unreadCounts.get(msg.sessionId) ?? 0;
          this.unreadCounts.set(msg.sessionId, current + 1);
          this.cdr.detectChanges();
        }
      });
  }

  loadSessions(page: number): void {
    if (page === 1) this.loading = true;
    this.cdr.detectChanges();

    this.sessionService.findAllAdminPaginated(page, this.pageSize).subscribe({
      next: res => {
        if (page === 1) {
          const existingIds = new Set(res.data.map(s => s.id));
          const olderSessions = this.sessions.filter(s => !existingIds.has(s.id));
          this.sessions = [...res.data, ...olderSessions];
        } else {
          const existingIds = new Set(this.sessions.map(s => s.id));
          const newSessions = res.data.filter(s => !existingIds.has(s.id));
          this.sessions = [...this.sessions, ...newSessions];
        }
        this.currentPage = res.page;
        this.totalPages = res.pages;
        this.loading = false;
        this.loadingMore = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.loadingMore = false;
        this.cdr.detectChanges();
      },
    });
  }

  loadMore(): void {
    if (this.loadingMore || this.currentPage >= this.totalPages) return;
    this.loadingMore = true;
    this.loadSessions(this.currentPage + 1);
  }

  selectSession(session: Session): void {
    this.activeSession = session;
    this.messages = [];
    this.loading = true;
    this.unreadCounts.set(session.id, 0);
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

  unreadFor(sessionId: string): number {
    return this.unreadCounts.get(sessionId) ?? 0;
  }

  trackSession(_: number, session: Session): string {
    return session.id;
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer) {
        scrollToBottom(this.messagesContainer.nativeElement);
      }
    }, 50);
  }
}
