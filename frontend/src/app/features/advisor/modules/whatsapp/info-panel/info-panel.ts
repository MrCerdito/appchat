import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WaIconComponent } from '../../../../../shared/components/wa-icon/wa-icon.component';
import { WaChat, WaColegioOption } from '../../../../../core/models/whatsapp.models';
import { trackByIndex } from '../../../../../shared/utils/track-by';

interface ContactDraft {
  name: string;
  role: string;
  institution: string;
  institutionUrl: string;
  city: string;
  phone: string;
  email: string;
  plan: string;
  modulesText: string;
}

@Component({
  selector: 'app-whatsapp-info-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, WaIconComponent],
  templateUrl: './info-panel.html',
  styleUrl: './info-panel.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappInfoPanelComponent {
  protected readonly trackByIndex = trackByIndex;

  @Input() contact!: WaChat;
  @Input() currentUserId = '';
  @Input() isClosingChat = false;
  @Input() isEditingContact = false;
  @Input() contactDraft: ContactDraft = {
    name: '', role: '', institution: '', institutionUrl: '',
    city: '', phone: '', email: '', plan: '', modulesText: '',
  };
  @Input() isSavingContact = false;
  @Input() contactSaveMessage = '';
  @Input() operationalStatusOptions: { id: string; label: string; hint: string }[] = [];
  @Input() isUpdatingOperationalStatus = false;
  @Input() isAssignedToSomeoneElse = false;
  @Input() creatingTicket = false;
  @Input() canReply = true;
  @Input() isAiInsightLoading = false;
  @Input() aiInsightPreview = '';
  @Input() newNote = '';
  @Input() colegios: WaColegioOption[] = [];
  @Input() colegioLoading = false;

  @Output() closeChat = new EventEmitter<void>();
  @Output() toggleEdit = new EventEmitter<void>();
  @Output() saveContact = new EventEmitter<void>();
  @Output() cancelEdit = new EventEmitter<void>();
  @Output() updateStatus = new EventEmitter<string>();
  @Output() openTicket = new EventEmitter<void>();
  @Output() openTeamsMeeting = new EventEmitter<void>();
  @Output() runAiInsight = new EventEmitter<void>();
  @Output() addNote = new EventEmitter<void>();
  @Output() removeNote = new EventEmitter<number>();
  @Output() newNoteChange = new EventEmitter<string>();
  @Output() profilePhotoOpen = new EventEmitter<Event>();
  @Output() changeColegio = new EventEmitter<string>();

  isFixedToOther(): boolean {
    if (!this.contact?.fixedAdvisorId) return false;
    if (this.contact.assignedTo === this.currentUserId) return false;
    return true;
  }

  operationalStatusClass(): string {
    return this.contact?.operationalStatus || this.contact?.assignmentStatus || 'new';
  }

  getAssignmentLabel(): string {
    const c = this.contact;
    if (c?.isGroup) return 'Grupo compartido';
    if (this.isChatClosed()) return 'Atencion cerrada';
    if (c?.fixedAdvisorId) return 'ASESOR FIJADO';
    if (!c?.assignedTo) return 'En cola';
    if (c.assignedTo === this.currentUserId) return 'Mi chat';
    return c.assignedToName ? `Asignado a ${c.assignedToName}` : 'Asignado';
  }

  isChatClosed(): boolean {
    const c = this.contact;
    if (!c) return false;
    if (c.isGroup) return false;
    if (c.assignmentStatus === 'closed') return true;
    if (c.tag === 'cerrado') return true;
    return false;
  }

  avatarSrc(): string {
    return this.contact?.avatar || this.fallbackAvatar(this.contact?.name || this.contact?.phone || 'WhatsApp');
  }

  useFallbackAvatar(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = this.fallbackAvatar(this.contact?.name || this.contact?.phone || 'WhatsApp');
  }

  formatDisplayName(name?: string): string {
    if (!name) return 'Desconocido';
    const digits = name.replace(/\D/g, '');
    if (digits.length >= 10 && /^\d+$/.test(digits))
      return this.formatPhoneDisplay(name);
    return name;
  }

  formatPhoneDisplay(phone?: string): string {
    if (!phone) return '';
    const d = phone.replace(/\D/g, '');
    if (d.length >= 12 && d.startsWith('57'))
      return `+${d.slice(0,2)} ${d.slice(2,5)} ${d.slice(5,8)} ${d.slice(8)}`;
    if (d.length >= 10)
      return `+${d.slice(0,d.length-10)} ${d.slice(d.length-10,d.length-7)} ${d.slice(d.length-7,d.length-4)} ${d.slice(d.length-4)}`;
    return `+${d}`;
  }

  getInstitutionHref(): string {
    const url = this.contact?.institutionUrl || '';
    if (!url || !/^https?:\/\//i.test(url)) return '';
    return url;
  }

  getPhoneHref(): string {
    const phone = (this.contact?.phone || '').replace(/[^\d+]/g, '');
    return phone ? `tel:${phone}` : '';
  }

  getEmailHref(): string {
    const email = (this.contact?.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
    return `mailto:${encodeURIComponent(email)}`;
  }

  private fallbackAvatar(name: string): string {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=25D366&color=fff`;
  }

  onDraftFieldChange(field: keyof ContactDraft, value: string): void {
    (this.contactDraft as unknown as Record<string, string>)[field] = value;
  }

  onNewNoteInput(value: string): void {
    this.newNoteChange.emit(value);
  }

  selectedColegio(): WaColegioOption | undefined {
    const name = (this.contact?.institution || '').trim();
    if (!name) return undefined;
    return this.colegios.find(c => c.nombre.trim().toLowerCase() === name.toLowerCase());
  }

  currentColegioId(): string {
    return this.selectedColegio()?.id || '';
  }

  onColegioChange(id: string): void {
    this.changeColegio.emit(id);
  }

  assignedAdvisorName(): string {
    const col = this.selectedColegio();
    if (col?.advisorName) return col.advisorName;
    if (this.contact?.assignedToName) return this.contact.assignedToName;
    return '';
  }

  assignedAdvisorPhoto(): string {
    const col = this.selectedColegio();
    if (col?.advisorPhotoUrl) return col.advisorPhotoUrl;
    return this.fallbackAvatar(this.assignedAdvisorName() || 'Asesor');
  }

  assignedAdvisorPhotoError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = this.fallbackAvatar(this.assignedAdvisorName() || 'Asesor');
  }
}
