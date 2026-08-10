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
  attachments?: Attachment[];
  documentos?: { nombre: string; pdfUrl: string | null; categoria: string | null }[];
}
