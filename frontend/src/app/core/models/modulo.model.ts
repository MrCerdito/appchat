import { User } from './user.model';

export interface Modulo {
  id: string;
  nombre: string;
  descripcion: string | null;
  createdAt: string;
  desarrolladores: User[];
}
