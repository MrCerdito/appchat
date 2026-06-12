import { Component, OnInit, ViewChild, ElementRef, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../../../../core/services/session.service';
import { Message } from '../../../../core/models/message.model';
import { Session } from '../../../../core/models/session.model';

@Component({
  selector: 'app-history-global',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class HistoryGlobalComponent implements OnInit {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;

  sessions: Session[] = [];
  activeSession: Session | null = null;
  messages: Message[] = [];
  filter: 'all' | 'active' | 'closed' = 'all';
  search = '';
  loading = false;

  constructor(private sessionService: SessionService, private cdr: ChangeDetectorRef) {}

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

    this.sessionService.getMessages(session.id).subscribe({
      next: (msgs) => {
        this.messages = msgs;
        this.loading = false;
        this.cdr.detectChanges();
        setTimeout(() => {
          if (this.messagesContainer) {
            this.messagesContainer.nativeElement.scrollTop =
              this.messagesContainer.nativeElement.scrollHeight;
          }
        }, 50);
      },
      error: () => { this.loading = false; this.cdr.detectChanges(); },
    });
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = { waiting: 'Esperando', active: 'Activo', closed: 'Cerrado' };
    return map[status] ?? status;
  }
}