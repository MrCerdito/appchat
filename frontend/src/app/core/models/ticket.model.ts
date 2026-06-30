export interface ConversationMessage {
  role: 'client' | 'advisor';
  name: string;
  content: string;
  type?: string;
  mediaUrl?: string | null;
  timestamp: string;
}

export interface Ticket {
  id: string;
  codigo: string;
  titulo: string;
  descripcion: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  category: string | null;
  conversation: ConversationMessage[] | null;
  sourceType: 'web' | 'whatsapp';
  sourceId: string | null;
  assignedTo: { id: string; name: string } | null;
  assignedToName: string | null;
  clientName: string;
  clientInfo: Record<string, any> | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedBy: { id: string; name: string } | null;
}

export interface TicketCreateDto {
  titulo: string;
  descripcion?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  category?: string;
  sourceType: 'web' | 'whatsapp';
  sourceId: string;
  clientName: string;
  clientInfo?: Record<string, any>;
}

export interface TicketUpdateDto {
  titulo?: string;
  descripcion?: string;
  status?: 'open' | 'in_progress' | 'resolved' | 'closed';
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
