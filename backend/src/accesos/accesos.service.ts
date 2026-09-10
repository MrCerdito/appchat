import { Injectable, OnModuleInit, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ModuloAcceso } from './entities/modulo-acceso.entity';
import { AccesoRol } from './entities/acceso-rol.entity';
import { AccesoUsuario } from './entities/acceso-usuario.entity';
import { User } from '../auth/entities/user.entity';
import { CATALOGO_MODULOS } from './constants/catalogo';

export interface AccesoItem {
  codigo: string;
  activo: boolean;
}

export interface RolAccesosResult {
  role: string;
  modulos: AccesoItem[];
}

export interface UsuarioAccesosResult {
  userId: string;
  role: string;
  name: string | null;
  modulos: AccesoItem[];
}

export interface MisPermisosResult {
  user: { id: string; role: string };
  modulos: AccesoItem[];
}

/** Roles existentes en la aplicación. */
export const ROLES = ['admin', 'advisor', 'desarrollador', 'interno'] as const;

const ROL_ADMIN = 'admin';

@Injectable()
export class AccesosService implements OnModuleInit {
  constructor(
    @InjectRepository(ModuloAcceso)
    private readonly modulosRepo: Repository<ModuloAcceso>,
    @InjectRepository(AccesoRol)
    private readonly rolRepo: Repository<AccesoRol>,
    @InjectRepository(AccesoUsuario)
    private readonly usuarioRepo: Repository<AccesoUsuario>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSchema();
    await this.seedCatalogo();
  }

  /** Crea las tablas en entornos sin synchronize (producción). */
  private async ensureSchema(): Promise<void> {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS modulo_acceso (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          codigo varchar(60) NOT NULL UNIQUE,
          nombre varchar(120) NOT NULL,
          grupo varchar(80) NOT NULL,
          descripcion varchar(300),
          aplica_a text,
          created_at timestamptz NOT NULL DEFAULT now()
        )`);
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS acceso_rol (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          role varchar(20) NOT NULL,
          modulo_codigo varchar(60) NOT NULL,
          activo boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now()
        )`);
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS acceso_usuario (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          modulo_codigo varchar(60) NOT NULL,
          activo boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now()
        )`);
      await this.dataSource.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_acceso_rol_role_modulo
         ON acceso_rol(role, modulo_codigo)`,
      );
      await this.dataSource.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_acceso_usuario_user_modulo
         ON acceso_usuario(user_id, modulo_codigo)`,
      );
      await this.dataSource.query(
        `CREATE INDEX IF NOT EXISTS idx_acceso_usuario_user ON acceso_usuario(user_id)`,
      );
    } catch (error: any) {
      console.error(
        `[Accesos] No se pudo asegurar el esquema: ${error?.message ?? error}`,
      );
    }
  }

  /** Siembra/actualiza el catálogo de módulos sin borrar los existentes. */
  private async seedCatalogo(): Promise<void> {
    for (const def of CATALOGO_MODULOS) {
      const existente = await this.modulosRepo.findOne({
        where: { codigo: def.codigo },
      });
      if (existente) {
        existente.nombre = def.nombre;
        existente.grupo = def.grupo;
        existente.descripcion = def.descripcion;
        existente.aplicaA = def.aplicaA;
        await this.modulosRepo.save(existente);
      } else {
        await this.modulosRepo.save(this.modulosRepo.create(def));
      }
    }
  }

  // ── Catálogo ────────────────────────────────────────────────
  async getModulos(): Promise<ModuloAcceso[]> {
    return this.modulosRepo.find({ order: { grupo: 'ASC', nombre: 'ASC' } });
  }

  /** Módulos del catálogo que aplican a un rol dado. */
  async getModulosDeRol(role: string): Promise<ModuloAcceso[]> {
    const all = await this.getModulos();
    return all.filter((m) => (m.aplicaA ?? []).includes(role));
  }

  // ── Por rol (perfil) ────────────────────────────────────────
  async getAccesosTodosLosRoles(): Promise<RolAccesosResult[]> {
    const rolesRows = await this.rolRepo.find();
    const byKey = new Map<string, AccesoRol>(
      rolesRows.map((r) => [`${r.role}|${r.moduloCodigo}`, r]),
    );
    const result: RolAccesosResult[] = [];
    for (const role of ROLES) {
      const modulos = await this.getModulosDeRol(role);
      result.push({
        role,
        modulos: modulos.map((m) => {
          const row = byKey.get(`${role}|${m.codigo}`);
          return { codigo: m.codigo, activo: row ? row.activo : true };
        }),
      });
    }
    return result;
  }

  async getAccesosRol(role: string): Promise<RolAccesosResult> {
    this.validarRol(role);
    const modulos = await this.getModulosDeRol(role);
    const rows = await this.rolRepo.find({ where: { role } });
    const map = new Map(rows.map((r) => [r.moduloCodigo, r.activo]));
    return {
      role,
      modulos: modulos.map((m) => ({
        codigo: m.codigo,
        activo: map.get(m.codigo) ?? true,
      })),
    };
  }

  async setAccesosRol(role: string, items: AccesoItem[]): Promise<void> {
    this.validarRol(role);
    if (role === ROL_ADMIN) {
      const accesosItem = items.find((i) => i.codigo === 'accesos');
      if (accesosItem && accesosItem.activo === false) {
        throw new BadRequestException(
          'El módulo de Accesos no se puede desactivar para el perfil Administrador.',
        );
      }
    }
    const validos = await this.getModulosDeRol(role);
    const validosMap = new Map(validos.map((m) => [m.codigo, true]));
    const porGuardar = items.filter(
      (i) => validosMap.has(i.codigo) && typeof i.activo === 'boolean',
    );
    await this.rolRepo.delete({ role });
    if (porGuardar.length > 0) {
      await this.rolRepo.insert(
        porGuardar.map((i) => ({
          role,
          moduloCodigo: i.codigo,
          activo: i.activo,
        })),
      );
    }
  }

  // ── Por usuario ─────────────────────────────────────────────
  async getAccesosUsuario(userId: string): Promise<UsuarioAccesosResult> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('El usuario no existe.');
    }
    const modulos = await this.getModulosDeRol(user.role);
    const overrides = await this.usuarioRepo.find({ where: { userId } });
    const overrideMap = new Map(
      overrides.map((o) => [o.moduloCodigo, o.activo]),
    );
    const defaultMap = await this.getRolDefaultMap(user.role);

    return {
      userId,
      role: user.role,
      name: user.name,
      modulos: modulos.map((m) => ({
        codigo: m.codigo,
        activo:
          overrideMap.get(m.codigo) ?? defaultMap.get(m.codigo) ?? true,
      })),
    };
  }

  async setAccesosUsuario(userId: string, items: AccesoItem[]): Promise<void> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('El usuario no existe.');
    }
    if (user.role === ROL_ADMIN) {
      const accesosItem = items.find((i) => i.codigo === 'accesos');
      if (accesosItem && accesosItem.activo === false) {
        await this.assertNotLastAdminWithoutAccesos(userId);
      }
    }
    const validos = await this.getModulosDeRol(user.role);
    const validosMap = new Map(validos.map((m) => [m.codigo, true]));
    const defaultMap = await this.getRolDefaultMap(user.role);

    // Solo se guardan overrides (diferencias vs el perfil del rol)
    const diffs = items.filter(
      (i) =>
        validosMap.has(i.codigo) &&
        typeof i.activo === 'boolean' &&
        (i.activo ?? true) !== (defaultMap.get(i.codigo) ?? true),
    );

    await this.usuarioRepo.delete({ userId });
    if (diffs.length > 0) {
      await this.usuarioRepo.insert(
        diffs.map((i) => ({ userId, moduloCodigo: i.codigo, activo: i.activo })),
      );
    }
  }

  // ── Mis permisos (efectivos) ────────────────────────────────
  async misPermisos(
    user: { id: string; role: string },
  ): Promise<MisPermisosResult> {
    const catalogoCompleto = await this.getModulos();
    const defaultMap = await this.getRolDefaultMap(user.role);
    const overrides = await this.usuarioRepo.find({
      where: { userId: user.id },
    });
    const overrideMap = new Map(
      overrides.map((o) => [o.moduloCodigo, o.activo]),
    );
    const aplicables = await this.getModulosDeRol(user.role);
    const aplicablesSet = new Set(aplicables.map((m) => m.codigo));

    return {
      user: { id: user.id, role: user.role },
      modulos: catalogoCompleto.map((m) => ({
        codigo: m.codigo,
        activo: aplicablesSet.has(m.codigo)
          ? overrideMap.get(m.codigo) ?? defaultMap.get(m.codigo) ?? true
          : false,
      })),
    };
  }

  /** ¿El usuario tiene activo el módulo? (para el guard de módulo). */
  async permisoActivo(
    user: { id: string; role: string },
    codigo: string,
  ): Promise<boolean> {
    const aplicables = await this.getModulosDeRol(user.role);
    if (!aplicables.some((m) => m.codigo === codigo)) return false;
    const defaultMap = await this.getRolDefaultMap(user.role);
    const override = await this.usuarioRepo.findOne({
      where: { userId: user.id, moduloCodigo: codigo },
    });
    return override
      ? override.activo
      : defaultMap.get(codigo) ?? true;
  }

  // ── Helpers ─────────────────────────────────────────────────
  private async getRolDefaultMap(role: string): Promise<Map<string, boolean>> {
    const rows = await this.rolRepo.find({ where: { role } });
    return new Map(rows.map((r) => [r.moduloCodigo, r.activo]));
  }

  /** Evita que el último admin con Accesos pierda el módulo. */
  private async assertNotLastAdminWithoutAccesos(
    userId: string,
  ): Promise<void> {
    const admins = await this.usersRepo.find({
      where: { role: ROL_ADMIN, active: true },
    });
    const overrides = await this.usuarioRepo.find({
      where: { moduloCodigo: 'accesos' },
    });
    const sinAcceso = new Set(
      overrides.filter((o) => o.activo === false).map((o) => String(o.userId)),
    );
    const otrosConAcceso = admins.filter(
      (a) =>
        String(a.id) !== String(userId) && !sinAcceso.has(String(a.id)),
    );
    if (otrosConAcceso.length === 0) {
      throw new BadRequestException(
        'Al menos un Administrador debe conservar el módulo de Accesos.',
      );
    }
  }

  private validarRol(role: string): void {
    if (!ROLES.includes(role as (typeof ROLES)[number])) {
      throw new BadRequestException(`Rol inválido: ${role}`);
    }
  }
}