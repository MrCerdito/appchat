export interface ConversationMessage {
  role: 'client' | 'advisor';
  name: string;
  content: string;
  type?: string;
  mediaUrl?: string | null;
  timestamp: string;
}

export interface TicketNote {
  id: string;
  authorId: string | null;
  authorName: string;
  content: string;
  images: string[];
  createdAt: string;
}

export interface Ticket {
  id: string;
  codigo: string;
  titulo: string;
  descripcion: string | null;
  status: 'open' | 'in_progress' | 'on_hold' | 'denied' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string | null;
  conversation: ConversationMessage[] | null;
  sourceType: 'web' | 'whatsapp' | 'internal' | 'email';
  sourceId: string | null;
  institucion: string | null;
  canal: string;
  assignedTo: { id: string; name: string } | null;
  assignedToName: string | null;
  clientName: string;
  clientInfo: Record<string, any> | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedBy: { id: string; name: string } | null;
  slaDeadline: string | null;
  pausedAt: string | null;
  totalPausedMs: number;
  notes: TicketNote[] | null;
  emailEnviado?: boolean;
}

export interface TicketCreateDto {
  titulo: string;
  descripcion?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  sourceType: 'web' | 'whatsapp' | 'internal' | 'email';
  sourceId?: string;
  clientName: string;
  clientInfo?: Record<string, any>;
  assignedToId?: string;
  institucion?: string;
  canal?: string;
}

export interface TicketUpdateDto {
  titulo?: string;
  descripcion?: string;
  status?: 'open' | 'in_progress' | 'on_hold' | 'denied' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  assignedToId?: string;
}

export interface TicketQuery {
  search?: string;
  status?: string;
  priority?: string;
  category?: string;
  sourceType?: string;
  assignedTo?: string;
  createdById?: string;
  page?: number;
  limit?: number;
}

export interface TicketListResponse {
  data: Ticket[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface TicketCountsResponse {
  total: number;
  statusCounts: Record<string, number>;
  priorityCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
}
