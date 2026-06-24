export interface User {
  id: string;
  name: string;
  identificacion: string;
  email: string;
  role: string;
  status?: string;
  activeChats?: number;
  active?: boolean;
}