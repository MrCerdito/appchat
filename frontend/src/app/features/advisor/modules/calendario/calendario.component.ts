import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, firstValueFrom } from 'rxjs';
import {
  WhatsappChatService,
  TeamsMeetingDto,
} from '../../../../core/services/whatsapp-chat.service';
import {
  fmtMedium,
  fmtTime,
} from '../../../../shared/utils/date';

interface CalendarCell {
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  meetings: TeamsMeetingDto[];
}

const BOG_OFFSET_MS = -5 * 3600000;
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function dayKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const b = new Date(d.getTime() - BOG_OFFSET_MS);
  return `${b.getUTCFullYear()}-${pad2(b.getUTCMonth() + 1)}-${pad2(b.getUTCDate())}`;
}

@Component({
  selector: 'app-calendario',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './calendario.component.html',
  styleUrl: './calendario.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarioComponent implements OnInit, OnDestroy {
  protected readonly fmtMedium = fmtMedium;
  protected readonly fmtTime = fmtTime;
  protected readonly weekdayLabels = WEEKDAYS;

  viewYear: number;
  viewMonth: number;
  cells: CalendarCell[] = [];
  meetings: TeamsMeetingDto[] = [];
  upcoming: TeamsMeetingDto[] = [];
  selectedKey = '';
  todayKey = dayKey(new Date().toISOString());

  loading = true;
  error = '';

  showCreate = false;
  draft = {
    subject: '',
    startDateTime: '',
    durationMinutes: 30,
    agendarCalendario: true,
  };
  creating = false;
  createError = '';
  createdMeeting: TeamsMeetingDto | null = null;
  copiedId: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly waService: WhatsappChatService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    const now = new Date();
    this.viewYear = now.getFullYear();
    this.viewMonth = now.getMonth();
    this.selectedKey = this.todayKey;
  }

  ngOnInit(): void {
    this.buildGrid();
    this.loadMeetings();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadMeetings(): Promise<void> {
    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();
    try {
      const list = await firstValueFrom(this.waService.getMeetings());
      this.meetings = list.slice().sort(
        (a, b) => a.startDateTime.localeCompare(b.startDateTime),
      );
      this.rebuildDerived();
    } catch (err: any) {
      this.error = this.errText(err, 'No se pudo cargar el calendario.');
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  private rebuildDerived(): void {
    this.upcoming = this.meetings
      .filter((m) => dayKey(m.startDateTime) >= this.todayKey)
      .slice(0, 6);
    this.buildGrid();
  }

  private buildGrid(): void {
    const prev = new Date(Date.UTC(this.viewYear, this.viewMonth, 1 - new Date(Date.UTC(this.viewYear, this.viewMonth, 1)).getUTCDay()));
    const byKey = new Map<string, TeamsMeetingDto[]>();
    for (const m of this.meetings) {
      const k = dayKey(m.startDateTime);
      const arr = byKey.get(k);
      if (arr) arr.push(m);
      else byKey.set(k, [m]);
    }
    const cells: CalendarCell[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(Date.UTC(prev.getUTCFullYear(), prev.getUTCMonth(), prev.getUTCDate() + i)); // eslint-disable-line no-plusplus
      const key = dayKey(d);
      const meetings = (byKey.get(key) ?? [])
        .slice()
        .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime));
      cells.push({
        key,
        day: d.getUTCDate(),
        inMonth: d.getUTCMonth() === this.viewMonth,
        isToday: key === this.todayKey,
        isSelected: key === this.selectedKey,
        meetings,
      });
    }
    this.cells = cells;
  }

  get monthLabel(): string {
    return `${MONTH_NAMES[this.viewMonth]} ${this.viewYear}`;
  }

  get selectedLabel(): string {
    const [y, m, d] = this.selectedKey.split('-').map(Number);
    return `${d} de ${MONTH_NAMES[m - 1]} de ${y}`;
  }

  get selectedMeetings(): TeamsMeetingDto[] {
    return this.cells.find((c) => c.key === this.selectedKey)?.meetings ?? [];
  }

  isPastMeeting(m: TeamsMeetingDto): boolean {
    return dayKey(m.endDateTime) < this.todayKey;
  }

  prevMonth(): void {
    const d = new Date(Date.UTC(this.viewYear, this.viewMonth - 1, 1));
    this.viewYear = d.getUTCFullYear();
    this.viewMonth = d.getUTCMonth();
    this.buildGrid();
    this.cdr.detectChanges();
  }

  nextMonth(): void {
    const d = new Date(Date.UTC(this.viewYear, this.viewMonth + 1, 1));
    this.viewYear = d.getUTCFullYear();
    this.viewMonth = d.getUTCMonth();
    this.buildGrid();
    this.cdr.detectChanges();
  }

  goToday(): void {
    const now = new Date();
    this.viewYear = now.getFullYear();
    this.viewMonth = now.getMonth();
    this.selectedKey = this.todayKey;
    this.buildGrid();
    this.cdr.detectChanges();
  }

  selectDay(key: string): void {
    this.selectedKey = key;
    this.buildGrid();
    this.cdr.detectChanges();
  }

  openCreate(): void {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
    this.draft = {
      subject: '',
      startDateTime: `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}T${pad2(start.getHours())}:${pad2(start.getMinutes())}`,
      durationMinutes: 30,
      agendarCalendario: true,
    };
    this.createError = '';
    this.createdMeeting = null;
    this.showCreate = true;
    this.cdr.detectChanges();
  }

  closeCreate(): void {
    if (this.creating) return;
    this.showCreate = false;
    this.createError = '';
    this.createdMeeting = null;
    this.cdr.detectChanges();
  }

  async createMeeting(): Promise<void> {
    if (this.creating) return;
    const subject = this.draft.subject.trim();
    if (!subject || !this.draft.startDateTime) {
      this.createError = 'Escribe un nombre y una fecha valida.';
      return;
    }
    this.creating = true;
    this.createError = '';
    this.cdr.detectChanges();
    try {
      const created = await firstValueFrom(
        this.waService.createStandaloneMeeting({
          subject,
          startDateTime: new Date(this.draft.startDateTime).toISOString(),
          durationMinutes: this.draft.durationMinutes,
          calendarTarget: this.draft.agendarCalendario ? 'shared' : 'none',
        }),
      );
      this.createdMeeting = created;
      this.meetings = [...this.meetings, created].sort(
        (a, b) => a.startDateTime.localeCompare(b.startDateTime),
      );
      this.selectedKey = dayKey(created.startDateTime);
      this.viewYear = Number(this.selectedKey.slice(0, 4));
      this.viewMonth = Number(this.selectedKey.slice(5, 7)) - 1;
      this.rebuildDerived();
    } catch (err: any) {
      this.createError = this.errText(err, 'No se pudo crear la reunion.');
    } finally {
      this.creating = false;
      this.cdr.detectChanges();
    }
  }

  async copyLink(m: TeamsMeetingDto): Promise<void> {
    try {
      await navigator.clipboard.writeText(m.joinUrl);
      this.copiedId = m.id;
    } catch {
      this.error = 'No se pudo copiar el enlace.';
    }
    this.cdr.detectChanges();
    setTimeout(() => {
      this.copiedId = null;
      this.cdr.detectChanges();
    }, 2000);
  }

  openLink(m: TeamsMeetingDto): void {
    window.open(m.joinUrl, '_blank', 'noopener');
  }

  private errText(err: any, fallback: string): string {
    const msg = err?.error?.message;
    const raw = typeof err?.error === 'string' ? err.error : undefined;
    return String(msg || raw || fallback);
  }
}