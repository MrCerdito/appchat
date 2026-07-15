import { User } from './user.model';

export interface Session {
  id:            string;
  codigo?:       string;
  clientName:    string;
  identificacion?: string;
  apellido?:     string;
  rol?:          string;
  colegio?:      string;
  colegioLink?: string;
  tipoSolicitud?: string;
  status:        string;
  advisor?:      { id?: string; name: string } | null;
  createdAt?:    string;
  closedAt?:     string | null;
}