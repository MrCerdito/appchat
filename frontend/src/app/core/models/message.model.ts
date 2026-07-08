export interface Message {
  id        : string;
  content   : string;
  senderType: 'client' | 'advisor';
  senderName?: string;
  createdAt : string;
  readAt    : string | null;
  documentos?: { nombre: string; pdfUrl: string | null; categoria: string | null }[];
}
