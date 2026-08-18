export interface Destinatario {
  email: string;
  nombre: string;
  colegio?: string;
  tipo?: string;
  sendStatus?: 'ok' | 'failed';
  sendError?: string;
}

export interface Comunicado {
  id: string;
  asunto: string;
  cuerpo: string;
  design: unknown[] | null;
  senderName: string;
  senderEmail?: string;
  status: 'sent' | 'draft' | 'failed';
  destinatarios: Destinatario[];
  createdAt: string;
  sentAt: string | null;
  totalEnviados: number;
  totalAperturas: number;
  totalClics: number;
}

export interface ComunicadoStats {
  totalEnviados: number;
  totalAperturas: number;
  totalClics: number;
  tasaApertura: number;
  tasaClics: number;
  detalle: {
    email: string;
    nombre: string;
    aperturas: number;
    clics: number;
    sendStatus?: 'ok' | 'failed';
    sendError?: string | null;
  }[];
}

export interface ComunicadoTemplate {
  id: string;
  name: string;
  asunto: string;
  cuerpo: string;
  design: unknown[] | null;
  createdAt: string;
  updatedAt: string;
}