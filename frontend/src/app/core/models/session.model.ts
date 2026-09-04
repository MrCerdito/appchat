import { User } from './user.model';

export interface LastMessagePreview {
  id        : string;
  content   : string;
  senderType: string;
  senderName: string;
  createdAt : string;
  attachments?: { id: string; originalName?: string; url?: string }[] | null;
}

export interface Session {
  id:            string;
  codigo?:       string;
  clientName:    string;
  identificacion?: string;
  apellido?:     string;
  rol?:          string;
  colegio?:      string;
  colegioLink?: string;
  colegioAdvisorName?: string;
  colegioAdvisorPhotoUrl?: string | null;
  colegioAdvisorId?: string;
  colegioAdvisorStatus?: string;
  colegioAdvisorActiveChats?: number;
  email?:        string;
  celular?:      string;
  tipoSolicitud?: string;
  tratamientoDatosAt?: string | null;
  status:        string;
  unreadCount?:  number;
  advisor?:      { id?: string; name: string } | null;
  createdAt?:    string;
  closedAt?:     string | null;
  lastMessage?:  LastMessagePreview | null;
}