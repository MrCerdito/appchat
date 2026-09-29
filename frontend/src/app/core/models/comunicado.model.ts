export interface Destinatario {
  email: string;
  nombre: string;
  colegio?: string;
  tipo?: string;
  sendStatus?: 'ok' | 'failed' | 'bounced';
  sendError?: string;
  bouncedAt?: string;
}

export interface Comunicado {
  id: string;
  asunto: string;
  cuerpo: string;
  design: unknown[] | null;
  senderName: string;
  senderEmail?: string;
  status: 'sent' | 'draft' | 'failed' | 'sending';
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
    sendStatus?: 'ok' | 'failed' | 'bounced';
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
  createdBy?: { id: string; name: string; email: string } | null;
  updatedBy?: { id: string; name: string; email: string } | null;
}

export interface ComunicadoTemplateLog {
  id: string;
  templateId: string | null;
  templateName: string | null;
  accion: 'crear' | 'editar' | 'eliminar';
  cambios: Record<string, { antes: string | null; nuevo: string | null }> | null;
  createdAt: string;
  usuario: { id: string; name: string; email: string } | null;
}