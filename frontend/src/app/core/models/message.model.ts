export interface Attachment {
  id          : string;
  fileName    : string;
  originalName: string;
  mimeType    : string;
  size        : number;
  url         : string;
}

export interface Message {
  id        : string;
  content   : string;
  senderType: 'client' | 'advisor';
  senderName?: string;
  createdAt : string;
  readAt    : string | null;
  deliveredAt?: string | null;
  editedAt  : string | null;
  replyToMessageId?: string | null;
  attachments?: Attachment[];
  documentos?: {
    nombre: string;
    pdfUrl: string | null;
    categoria: string | null;
    descripcion?: string | null;
    instructivo?: boolean | null;
  }[];
}

/** Hito registrado durante la sesión (solicitud de asesor, clic en FAQ, ...). */
export interface TimelineEvento {
  kind: 'evento';
  id: string;
  tipo: string;
  detalle: Record<string, any> | null;
  createdAt: string;
}

export type TimelineItem =
  | ({ kind: 'message' } & Message)
  | TimelineEvento;

export interface TimelineResp {
  items: TimelineItem[];
  nextBefore: string | null;
  hasMore: boolean;
}
