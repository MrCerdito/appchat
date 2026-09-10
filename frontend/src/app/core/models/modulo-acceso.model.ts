export interface ModuloAcceso {
  codigo: string;
  nombre: string;
  grupo: string;
  descripcion?: string;
  aplicaA: string[];
  activo?: boolean;
}

export interface RolAccesos {
  role: string;
  modulos: ModuloAcceso[];
}

/** El servidor devuelve la lista de accesos por perfil directamente (array). */
export type RolAccesosResponse = RolAccesos[];

export interface UsuarioAccesos {
  userId: string;
  role: string;
  name: string | null;
  modulos: ModuloAcceso[];
}

export interface MisPermisosResponse {
  user: { id: string; role: string };
  modulos: ModuloAcceso[];
}