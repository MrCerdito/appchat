export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  activeChats?: number;
  active?: boolean;
  createdAt?: string;
  profilePhotoUrl?: string;
}
