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
import { WaChat } from '../../../../../core/models/whatsapp.models';
import { InternalConversation } from '../../../../../core/models/internal-chat.models';
import { trackByIndex, trackById } from '../../../../../shared/utils/track-by';
import { priorityLabel, priorityColor } from '../../../../../shared/utils/ticket-categories';

export type WaFilter = 'all' | 'mine' | 'queue' | 'groups' | 'unread' | 'closed' | 'advisor';

@Component({
  selector: 'app-whatsapp-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, WaIconComponent],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WhatsappSidebarComponent {
  protected readonly trackByIndex = trackByIndex;
  protected readonly trackById = trackById;
  protected readonly priorityLabel = priorityLabel;
  protected readonly priorityColor = priorityColor;

  @Input() chatMode: 'clients' | 'advisors' = 'clients';
  @Input() contacts: WaChat[] = [];
  @Input() activeContact?: WaChat;
  @Input() currentUserId = '';
  @Input() compactList = false;
  @Input() showCompactFilter = false;
  @Input() compactFilterTop = 0;
  @Input() compactFilterLeft = 0;
  @Input() showMoreFilter = false;
  @Input() activeFilter: WaFilter = 'mine';
  @Input() searchQuery = '';
  @Input() filterOptions: { id: WaFilter; label: string }[] = [];
  @Input() moreFilterOptions: { id: WaFilter; label: string }[] = [];
  @Input() hasMoreChats = false;
  @Input() isLoadingMoreChats = false;
  @Input() internalUnreadTotal = 0;
  @Input() internalConversations: InternalConversation[] = [];
  @Input() internalFilteredConversations: InternalConversation[] = [];
  @Input() internalIsLoadingConversations = true;
  @Input() internalActiveConversationId: string | null = null;
  @Input() internalSearchQuery = '';
  @Input() internalConversationNameFn?: (conv: InternalConversation) => string;
  @Input() internalConversationAvatarFn?: (conv: InternalConversation) => string;
  @Input() internalConversationPhotoUrlFn?: (conv: InternalConversation) => string | null;

  @Output() modeChange = new EventEmitter<'clients' | 'advisors'>();
  @Output() contactSelect = new EventEmitter<WaChat>();
  @Output() filterChange = new EventEmitter<WaFilter>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() compactFilterToggle = new EventEmitter<MouseEvent>();
  @Output() moreFilterToggle = new EventEmitter<void>();
  @Output() loadMore = new EventEmitter<void>();
  @Output() profilePhotoOpen = new EventEmitter<{ contact: WaChat; event: Event }>();
  @Output() internalSearchChange = new EventEmitter<string>();
  @Output() internalConversationSelect = new EventEmitter<InternalConversation>();
  @Output() internalNewChatOpen = new EventEmitter<void>();

  // ── Filtering ───────────────────────────────────────────────────────────
  get filteredContacts(): WaChat[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.contacts.filter(contact => {
      const haystack = [
        contact.name,
        contact.role,
        contact.institution,
        contact.city,
        contact.phone,
        contact.email,
        contact.preview,
        contact.assignedToName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch = !q || haystack.includes(q);
      const matchesFilter = this.matchesFilter(contact);
      return matchesSearch && matchesFilter;
    });
  }

  get activeFilterLabel(): string {
    const all = [...this.filterOptions, ...this.moreFilterOptions];
    return all.find(f => f.id === this.activeFilter)?.label ?? '';
  }

  private matchesFilter(contact: WaChat): boolean {
    switch (this.activeFilter) {
      case 'mine':
        return contact.assignedTo === this.currentUserId && !this.isChatClosed(contact);
      case 'queue':
        return this.isChatWaiting(contact);
      case 'groups':
        return !!contact.isGroup;
      case 'unread':
        return contact.unread > 0;
      case 'closed':
        return this.isChatClosed(contact);
      case 'advisor':
        return !!contact.assignedTo && !this.isChatClosed(contact);
      case 'all':
      default:
        return true;
    }
  }

  private isChatWaiting(contact?: WaChat): boolean {
    return !contact?.isGroup &&
      (this.getAssignmentStatus(contact) === 'waiting' || contact?.tag === 'pendiente');
  }

  private getAssignmentStatus(contact?: WaChat): 'waiting' | 'active' | 'closed' {
    if (contact?.isGroup) return 'active';
    if (contact?.assignmentStatus) return contact.assignmentStatus;
    if (contact?.tag === 'cerrado') return 'closed';
    if (contact?.tag === 'pendiente') return 'waiting';
    return contact?.assignedTo ? 'active' : 'waiting';
  }

  // ── Filter counts ───────────────────────────────────────────────────────
  getFilterCount(filter: WaFilter): number {
    switch (filter) {
      case 'mine':
        return this.contacts.filter(c => c.assignedTo === this.currentUserId && !this.isChatClosed(c)).length;
      case 'queue':
        return this.contacts.filter(c => this.isChatWaiting(c)).length;
      case 'groups':
        return this.contacts.filter(c => !!c.isGroup).length;
      case 'unread':
        return this.contacts.filter(c => c.unread > 0).length;
      case 'closed':
        return this.contacts.filter(c => this.isChatClosed(c)).length;
      case 'advisor':
        return this.contacts.filter(c => !!c.assignedTo && !this.isChatClosed(c)).length;
      case 'all':
      default:
        return this.contacts.length;
    }
  }

  // ── Contact helpers ─────────────────────────────────────────────────────
  isChatClosed(contact?: WaChat): boolean {
    return this.getAssignmentStatus(contact) === 'closed' || contact?.tag === 'cerrado';
  }

  isRecentChat(contact: WaChat): boolean {
    if (!contact.lastClientMsg) return false;
    const diffMs = Date.now() - new Date(contact.lastClientMsg).getTime();
    return diffMs <= 5 * 60 * 1000;
  }

  operationalStatusClass(contact: WaChat): string {
    return contact.operationalStatus || contact.assignmentStatus || 'new';
  }

  getAssignmentLabel(contact?: WaChat): string {
    if (contact?.isGroup) return 'Grupo compartido';
    if (this.isChatClosed(contact)) return 'Atencion cerrada';
    if (contact?.fixedAdvisorId) return 'ASESOR FIJADO';
    if (!contact?.assignedTo) return 'En cola';
    if (contact.assignedTo === this.currentUserId) return 'Mi chat';
    return contact.assignedToName ? `Asignado a ${contact.assignedToName}` : 'Asignado';
  }

  avatarSrc(contact?: WaChat): string {
    return contact?.avatar || this.fallbackAvatar(contact?.name || contact?.phone || 'WhatsApp');
  }

  useFallbackAvatar(event: Event, contact?: WaChat): void {
    const img = event.target as HTMLImageElement;
    img.src = this.fallbackAvatar(contact?.name || contact?.phone || 'WhatsApp');
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

  displayPreview(contact: WaChat): string {
    const preview = this.cleanLegacyMediaFallback(contact.preview);
    return preview || 'Sin mensajes recientes';
  }

  private fallbackAvatar(name: string): string {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=25D366&color=fff`;
  }

  private cleanLegacyMediaFallback(value = ''): string {
    const clean = value.trim();
    if (!clean) return '';
    const match = clean.match(/^\[(Imagen|Video|Audio|Documento|Sticker)(?::[^\]]+|\srecibido)?\]$/i);
    if (!match) return clean;
    const type = match[1].toLowerCase();
    if (type === 'sticker') return 'Sticker';
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  // ── Event handlers ──────────────────────────────────────────────────────
  onSetChatMode(mode: 'clients' | 'advisors'): void {
    this.modeChange.emit(mode);
  }

  onSelectContact(contact: WaChat): void {
    this.contactSelect.emit(contact);
  }

  onSetFilter(filter: WaFilter): void {
    this.filterChange.emit(filter);
  }

  onSearchChange(value: string): void {
    this.searchChange.emit(value);
  }

  onToggleCompactFilter(event: MouseEvent): void {
    this.compactFilterToggle.emit(event);
  }

  onToggleMoreFilter(): void {
    this.moreFilterToggle.emit();
  }

  onLoadMore(): void {
    this.loadMore.emit();
  }

  onOpenProfilePhoto(contact: WaChat, event: Event): void {
    this.profilePhotoOpen.emit({ contact, event });
  }

  onInternalSearchChange(value: string): void {
    this.internalSearchChange.emit(value);
  }

  onSelectInternalConversation(conv: InternalConversation): void {
    this.internalConversationSelect.emit(conv);
  }

  onOpenInternalNewChat(): void {
    this.internalNewChatOpen.emit();
  }

  private otherMember(conv: InternalConversation) {
    if (conv.type === 'group') return null;
    return conv.members.find(m => m.id !== this.currentUserId) ?? null;
  }

  resolveConversationName(conv: InternalConversation): string {
    if (this.internalConversationNameFn) return this.internalConversationNameFn(conv);
    if (conv.type === 'group') return conv.name || 'Grupo';
    return this.otherMember(conv)?.name || 'Chat directo';
  }

  resolveConversationPhotoUrl(conv: InternalConversation): string | null {
    if (this.internalConversationPhotoUrlFn) return this.internalConversationPhotoUrlFn(conv);
    if (conv.type === 'group') return conv.photoUrl || null;
    return this.otherMember(conv)?.profilePhotoUrl || null;
  }

  resolveConversationAvatar(conv: InternalConversation): string {
    if (this.internalConversationAvatarFn) return this.internalConversationAvatarFn(conv);
    return (this.resolveConversationName(conv).charAt(0) || '?').toUpperCase();
  }
}
