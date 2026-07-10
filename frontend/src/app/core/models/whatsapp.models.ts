export interface WaMessage {
  id: string;
  chatId: string;
  body: string;
  fromMe: boolean;
  timestamp: Date;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  isAuto: boolean;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | string;
  senderName?: string;
  advisorId?: string;
  participantJid?: string;
  mediaId?: string;
  mediaUrl?: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  editedAt?: Date;
  metaMessageId?: string;
  reactionToMessageId?: string;
  reactionByName?: string;
  reactionRemoved?: boolean;
}

export interface WaChat {
  id: string;
  name: string;
  role: string;
  institution: string;
  institutionUrl: string;
  city: string;
  avatar: string;
  phone: string;
  jid?: string;
  isGroup?: boolean;
  email: string;
  plan: string;
  modules: string[];
  stage: string;
  stageIdx: number;
  tag: 'pendiente' | 'asignado' | 'cerrado';
  assignmentStatus?: 'waiting' | 'active' | 'closed';
  operationalStatus?: WaOperationalStatus;
  operationalStatusLabel?: string;
  assignmentMode?: 'auto' | 'manual' | 'admin' | 'fixed' | 'temporary';
  assignedTo?: string;
  assignedToName?: string;
  fixedAdvisorId?: string;
  fixedAdvisorName?: string;
  unread: number;
  preview: string;
  time: string;
  status: 'online' | 'away' | 'offline';
  notes: string[];
  quickReplies: string[];
  lastClientMsg: Date;
  messages: WaMessage[];
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

export type WaOperationalStatus =
  | 'new'
  | 'queued'
  | 'assigned'
  | 'in_progress'
  | 'waiting_customer'
  | 'waiting_technical'
  | 'resolved'
  | 'closed';

export interface WaAdvisorStats {
  id: string;
  name: string;
  email: string;
  status: string;
  active: boolean;
  activeChats: number;
  closedChats: number;
  waitingCustomerChats: number;
  manualChats: number;
  fixedClients: number;
  avgResponseMinutes: number;
  idleMinutes: number;
  connectedMinutes: number;
  pauseMinutes: number;
  slaPercent: number;
  lastActivity?: string;
}

export interface WaAdminAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  chatId?: string;
  advisorId?: string;
}

export interface WaAdminDashboard {
  summary: {
    totalChats: number;
    activeChats: number;
    queuedChats: number;
    waitingCustomerChats: number;
    waitingTechnicalChats: number;
    closedChats: number;
    fixedClients: number;
    manualChats: number;
    slaBreached: number;
    frozenChats: number;
    avgResponseMinutes: number;
    slaCompliancePercent: number;
    closedToday: number;
    uniqueClientsToday: number;
  };
  advisors: WaAdvisorStats[];
  chats: WaChat[];
  alerts: WaAdminAlert[];
}

export interface QuickReply {
  id: string;
  shortcut: string;
  text: string;
}

export interface AwNewMessage extends WaMessage {}

export interface AwChatAssigned {
  advisorId: string;
  advisorName: string;
  chat: WaChat;
}

export interface AwQueueUpdated {
  chat?: WaChat;
}

export interface AwMessageStatus {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  chatId?: string;
  timestamp?: string;
}

export interface WaConnectionStatus {
  status: 'disconnected' | 'connecting' | 'qr' | 'connected' | 'error';
  qr?: string;
  qrDataUrl?: string;
  connectedJid?: string;
  connectedName?: string;
  lastError?: string;
  updatedAt: string;
}

export interface WaContactUpdate {
  name: string;
  role: string;
  institution: string;
  institutionUrl: string;
  city: string;
  phone: string;
  email: string;
  plan: string;
  modules: string[];
}
