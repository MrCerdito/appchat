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
  replyToMessageId?: string;
  quotedBody?: string;
  quotedSender?: string;
  isForwarded?: boolean;
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
  fixedAdvisorId?: string | null;
  fixedAdvisorName?: string | null;
  unread: number;
  preview: string;
  time: string;
  status: 'online' | 'away' | 'offline';
  notes: string[];
  quickReplies: Array<{ name: string; content: string }> | string[];
  lastClientMsg: Date;
  clientWrote?: boolean;
  messages: WaMessage[];
  priority?: 'low' | 'normal' | 'high' | 'critical';
  slaState?: 'in_time' | 'por_vencer' | 'vencido';
  slaBreached?: boolean;
  slaMinutesWaiting?: number;
  slaWaitingSince?: string;
  slaDeadlineMinutes?: number;
  slaRemainingMinutes?: number;
  frozen?: boolean;
  frozenMinutes?: number;
  categoria?: WaCategoria;
  categoriaLabel?: string;
}

export type WaCategoria =
  | 'cola'
  | 'gestion'
  | 'espera_respuesta'
  | 'sla_vencido'
  | 'esperando_cliente'
  | 'soporte'
  | 'resuelto'
  | 'cerrado'
  | 'grupo';

export type WaOperationalStatus =
  | 'new'
  | 'queued'
  | 'assigned'
  | 'in_progress'
  | 'waiting_customer'
  | 'waiting_technical'
  | 'resolved'
  | 'released'
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
  slaBreachedChats: number;
  frozenChats: number;
  lastActivity?: string;
}

export interface WaAdminAlert {
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  chatId?: string;
  advisorId?: string;
  timestamp?: string;
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
    porVencer: number;
    frozenChats: number;
    avgResponseMinutes: number;
    slaCompliancePercent: number;
    slaComplianceDenominator: number;
    enGestion: number;
    esperandoRespuesta: number;
    soporteChats: number;
    closedToday: number;
    uniqueClientsToday: number;
  };
  advisors: WaAdvisorStats[];
  chats: WaChat[];
  alerts: WaAdminAlert[];
  wsTimestamp?: string;
}

export interface WaReportSeries {
  periodo: string;
  recibidos: number;
  asignados: number;
  cerrados: number;
}

export interface WaReportAdvisor {
  id: string;
  name: string;
  chatsAsignados: number;
  cerrados: number;
  mensajesEnviados: number;
  promRespuestaMin: number;
}

export interface WaReportCategory {
  categoria: string;
  label: string;
  total: number;
}

export interface WaReportChat {
  id: string;
  name: string;
  phone: string;
  advisor: string;
  priority: string;
  categoria: string;
  estado: string;
  creado: string;
  cerrado: string | null;
  mensajes: number;
}

export interface WaReportData {
  from: string;
  to: string;
  granularity: 'day' | 'month' | 'year';
  summary: {
    chatsRecibidos: number;
    clientesUnicos: number;
    asignados: number;
    cerrados: number;
    mensajesTotales: number;
    mensajesAsesor: number;
    tiempoPromedioRespuestaMin: number;
    slaCumplimiento: number;
    slaDenominador: number;
  };
  series: WaReportSeries[];
  perAdvisor: WaReportAdvisor[];
  porCategoria: WaReportCategory[];
  chats: WaReportChat[];
}

export interface QuickReply {
  id: string;
  name: string;
  content: string;
  shortcut: string;
}

export interface QuickReplyItem {
  name: string;
  content: string;
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
