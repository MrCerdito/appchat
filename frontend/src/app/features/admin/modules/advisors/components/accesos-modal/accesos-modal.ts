import {
  Component,
  EventEmitter,
  HostListener,
  OnDestroy,
  OnInit,
  Output,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, firstValueFrom } from 'rxjs';
import { AccesosService } from '../../../../../../core/services/accesos.service';
import { AdminService } from '../../../../../../core/services/admin.service';
import { PermisosService } from '../../../../../../core/services/permisos.service';
import { User } from '../../../../../../core/models/user.model';
import { ModuloAcceso } from '../../../../../../core/models/modulo-acceso.model';

interface RolOption {
  role: string;
  label: string;
  sub: string;
  icon: string;
}

interface ModuloRow {
  codigo: string;
  nombre: string;
  grupo: string;
  descripcion?: string;
  activo: boolean;
  esAdmin: boolean;
}

const ROLES: RolOption[] = [
  {
    role: 'advisor',
    label: 'Agentes',
    sub: 'Asesores que atienden chats',
    icon: 'M17 20h5v-2a4 4 0 0 0-3-3.87M9 20H4v-2a4 4 0 0 1 3-3.87M16 3.13a4 4 0 0 1 0 7.75M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  },
  {
    role: 'admin',
    label: 'Administradores',
    sub: 'Gestión, reportes y configuración',
    icon: 'M12 14v6m0-6a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-4 6h8',
  },
  {
    role: 'desarrollador',
    label: 'Desarrolladores',
    sub: 'Soporte técnico y tickets',
    icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  },
  {
    role: 'interno',
    label: 'Internos',
    sub: 'Operación interna: tickets, historial, reportes',
    icon: 'M9 12l2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
];

const ROL_LABEL: Record<string, string> = {
  advisor: 'Agente',
  admin: 'Administrador',
  desarrollador: 'Desarrollador',
  interno: 'Interno',
};

@Component({
  selector: 'app-accesos-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './accesos-modal.html',
  styleUrl: './accesos-modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccesosModalComponent implements OnInit, OnDestroy {
  @Output() cerrar = new EventEmitter<void>();

  tab: 'perfiles' | 'usuarios' = 'perfiles';
  readonly roles = ROLES;

  // ── Perfiles ────────────────────────────────────────────────
  rolSeleccionado = 'advisor';
  filasRol: ModuloRow[] = [];
  rolCargando = false;
  rolGuardando = false;
  rolMap = new Map<string, Map<string, boolean>>();

  // ── Usuarios ────────────────────────────────────────────────
  busqueda = '';
  buscando = false;
  resultados: User[] = [];
  usuarioSeleccionado: User | null = null;
  filasUsuario: ModuloRow[] = [];
  usuarioCargando = false;
  usuarioGuardando = false;
  usuarioEsAdmin = false;
  roleDefaultMap = new Map<string, boolean>();

  // ── Comunes ─────────────────────────────────────────────────
  error = '';
  success = '';
  cargando = false;
  catModulos: { codigo: string; nombre: string; grupo: string }[] = [];

  private searchSubject = new Subject<string>();
  private catalogPromise?: Promise<ModuloAcceso[]>;

  constructor(
    private accesos: AccesosService,
    private admin: AdminService,
    private permisos: PermisosService,
    private cdr: ChangeDetectorRef,
  ) {}

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.rolGuardando && !this.usuarioGuardando) this.cerrar.emit();
  }

  ngOnInit(): void {
    this.searchSubject
      .pipe(debounceTime(300))
      .subscribe((termino) => void this.buscarUsuarios(termino));
    void this.inicializar();
  }

  ngOnDestroy(): void {
    this.searchSubject.complete();
  }

  // ── Helpers de plantilla ────────────────────────────────────
  rolLabel(role: string): string {
    return ROL_LABEL[role] ?? role;
  }

  rolActivos(role: string): number {
    const m = this.rolMap.get(role);
    if (!m) return 0;
    let n = 0;
    for (const v of m.values()) if (v) n++;
    return n;
  }

  rolTotal(role: string): number {
    return this.rolMap.get(role)?.size ?? 0;
  }

  filasActuales(): ModuloRow[] {
    return this.tab === 'usuarios' ? this.filasUsuario : this.filasRol;
  }

  activosCuenta(): number {
    return this.filasActuales().filter((f) => f.activo).length;
  }

  totalCuenta(): number {
    return this.filasActuales().length;
  }

  grupos(): string[] {
    return [...new Set(this.filasActuales().map((f) => f.grupo))];
  }

  filasDeGrupo(grupo: string): ModuloRow[] {
    return this.filasActuales().filter((f) => f.grupo === grupo);
  }

  activosDeGrupo(grupo: string): number {
    return this.filasDeGrupo(grupo).filter((f) => f.activo).length;
  }

  // ── Navegación ──────────────────────────────────────────────
  cambiarTab(tab: 'perfiles' | 'usuarios'): void {
    this.tab = tab;
    this.error = '';
    this.success = '';
    if (tab === 'perfiles') {
      if (this.filasRol.length === 0) {
        void this.cargarFilasRol(this.rolSeleccionado);
      }
    } else {
      void this.precargarUsuarios();
    }
    this.cdr.detectChanges();
  }

  cambiarRol(role: string): void {
    if (role === this.rolSeleccionado) return;
    this.rolSeleccionado = role;
    this.error = '';
    this.success = '';
    void this.cargarFilasRol(role);
    this.cdr.detectChanges();
  }

  deseleccionarUsuario(): void {
    this.usuarioSeleccionado = null;
    this.filasUsuario = [];
    this.error = '';
    this.success = '';
    this.cdr.detectChanges();
  }

  // ── Inicialización ──────────────────────────────────────────
  private async inicializar(): Promise<void> {
    this.cargando = true;
    this.error = '';
    this.cdr.detectChanges();
    try {
      const catalogo = await this.getCatalogo();
      await this.cargarRolMap();
      this.catModulos = catalogo.map((m) => ({
        codigo: m.codigo,
        nombre: m.nombre,
        grupo: m.grupo,
      }));
      await this.cargarFilasRol(this.rolSeleccionado);
    } catch {
      this.error = 'No se pudieron cargar los módulos.';
    } finally {
      this.cargando = false;
      this.cdr.detectChanges();
    }
    void this.precargarUsuarios();
  }

  /** Catálogo de módulos con single-flight: evita recargar con cada clic. */
  private async getCatalogo(): Promise<ModuloAcceso[]> {
    if (!this.catalogPromise) {
      this.catalogPromise = firstValueFrom(this.accesos.getModulos()).finally(
        () => {
          this.catalogPromise = undefined;
        },
      );
    }
    return this.catalogPromise;
  }

  private async cargarRolMap(): Promise<void> {
    try {
      const res = await firstValueFrom(this.accesos.getRolAccesos());
      const map = new Map<string, Map<string, boolean>>();
      for (const r of res) {
        map.set(
          r.role,
          new Map(
            r.modulos.map(
              (m): [string, boolean] => [m.codigo, m.activo ?? true],
            ),
          ),
        );
      }
      this.rolMap = map;
    } catch {
      this.error = this.error || 'No se pudieron cargar los accesos por perfil.';
    }
    this.cdr.detectChanges();
  }

  /** Columnas del perfil por defecto (para comparar overrides de usuario). */
  private async cargarRolDefault(role: string): Promise<Map<string, boolean>> {
    if (!this.rolMap.has(role)) {
      try {
        const res = await firstValueFrom(this.accesos.getRolAccesos());
        const found = res.find((r) => r.role === role);
        if (found) {
          this.rolMap.set(
            role,
            new Map(
              found.modulos.map(
                (m): [string, boolean] => [m.codigo, m.activo ?? true],
              ),
            ),
          );
        }
      } catch {
        /* se usa vacío */
      }
    }
    return this.rolMap.get(role) ?? new Map<string, boolean>();
  }

  private async cargarFilasRol(role: string): Promise<void> {
    this.rolCargando = true;
    this.filasRol = [];
    this.error = '';
    this.cdr.detectChanges();
    try {
      const defaultMap = await this.cargarRolDefault(role);
      const catalogo = await this.getCatalogo();
      this.filasRol = catalogo
        .filter((m) => (m.aplicaA ?? []).includes(role))
        .map((m) => ({
          codigo: m.codigo,
          nombre: m.nombre,
          grupo: m.grupo,
          descripcion: m.descripcion,
          activo: defaultMap.get(m.codigo) ?? true,
          esAdmin: role === 'admin' && m.codigo === 'accesos',
        }));
    } catch {
      this.error = 'No se pudieron cargar los módulos del perfil.';
    } finally {
      this.rolCargando = false;
      this.cdr.detectChanges();
    }
  }

  // ── Acciones perfil ─────────────────────────────────────────
  async guardarRol(): Promise<void> {
    this.rolGuardando = true;
    this.error = '';
    this.success = '';
    this.cdr.detectChanges();
    try {
      await firstValueFrom(
        this.accesos.setRolAccesos(
          this.rolSeleccionado,
          this.filasRol.map((f) => ({ codigo: f.codigo, activo: f.activo })),
        ),
      );
      this.success = `Accesos del perfil "${this.rolLabel(
        this.rolSeleccionado,
      )}" guardados correctamente.`;
      this.rolMap.set(
        this.rolSeleccionado,
        new Map(this.filasRol.map((f) => [f.codigo, f.activo])),
      );
      await this.permisos.refresh();
    } catch {
      this.error = 'No se pudieron guardar los accesos del perfil.';
    } finally {
      this.rolGuardando = false;
      this.cdr.detectChanges();
    }
  }

  verTodos(invertir: boolean): void {
    const fuente = this.filasActuales();
    for (const f of fuente) {
      if (!f.esAdmin) f.activo = invertir ? false : true;
    }
    this.cdr.detectChanges();
  }

  // ── Usuarios ────────────────────────────────────────────────
  onBusquedaChange(nuevo: string): void {
    this.busqueda = nuevo;
    this.searchSubject.next(nuevo);
    if (!nuevo.trim()) {
      this.resultados = [];
      void this.precargarUsuarios();
    }
    this.cdr.detectChanges();
  }

  private async buscarUsuarios(termino: string): Promise<void> {
    if (!termino.trim()) {
      this.resultados = [];
      this.cdr.detectChanges();
      return;
    }
    this.buscando = true;
    this.cdr.detectChanges();
    try {
      const res = await firstValueFrom(
        this.admin.getAdvisors(1, 20, termino.trim(), 'todos'),
      );
      this.resultados = Array.isArray(res) ? res : (res.data ?? []);
    } catch {
      this.resultados = [];
    } finally {
      this.buscando = false;
      this.cdr.detectChanges();
    }
  }

  /** Precarga una lista inicial de usuarios para que no haya que escribir la búsqueda. */
  private async precargarUsuarios(): Promise<void> {
    if (this.buscando || this.busqueda.trim()) return;
    this.buscando = true;
    this.cdr.detectChanges();
    try {
      const res = await firstValueFrom(this.admin.getAdvisors(1, 100, '', 'todos'));
      if (this.busqueda.trim()) return;
      this.resultados = Array.isArray(res) ? res : (res.data ?? []);
    } catch {
      /* silencioso: el usuario puede escribir la búsqueda */
    } finally {
      this.buscando = false;
      this.cdr.detectChanges();
    }
  }

  async seleccionarUsuario(user: User): Promise<void> {
    this.usuarioSeleccionado = user;
    this.error = '';
    this.success = '';
    this.usuarioCargando = true;
    this.filasUsuario = [];
    this.cdr.detectChanges();
    try {
      const [res, catalogo] = await Promise.all([
        firstValueFrom(this.accesos.getUsuarioAccesos(user.id)),
        this.getCatalogo(),
      ]);
      const activos = new Map(
        res.modulos.map((m): [string, boolean] => [m.codigo, m.activo ?? true]),
      );
      this.usuarioEsAdmin = user.role === 'admin';
      this.roleDefaultMap = await this.cargarRolDefault(user.role);
      this.filasUsuario = catalogo
        .filter((m) => (m.aplicaA ?? []).includes(user.role))
        .map((m) => ({
          codigo: m.codigo,
          nombre: m.nombre,
          grupo: m.grupo,
          descripcion: m.descripcion,
          activo: activos.get(m.codigo) ?? true,
          esAdmin: this.usuarioEsAdmin && m.codigo === 'accesos',
        }));
    } catch {
      this.error = 'No se pudo cargar el acceso del usuario.';
    } finally {
      this.usuarioCargando = false;
      this.cdr.detectChanges();
    }
  }

  async guardarUsuario(): Promise<void> {
    if (!this.usuarioSeleccionado) return;
    this.usuarioGuardando = true;
    this.error = '';
    this.success = '';
    this.cdr.detectChanges();
    try {
      await firstValueFrom(
        this.accesos.setUsuarioAccesos(
          this.usuarioSeleccionado.id,
          this.filasUsuario.map((f) => ({ codigo: f.codigo, activo: f.activo })),
        ),
      );
      this.success = `Accesos de "${this.usuarioSeleccionado.name}" guardados correctamente.`;
      await this.permisos.refresh();
    } catch {
      this.error = 'No se pudieron guardar los accesos del usuario.';
    } finally {
      this.usuarioGuardando = false;
      this.cdr.detectChanges();
    }
  }

  async restablecerUsuario(): Promise<void> {
    if (!this.usuarioSeleccionado) return;
    for (const f of this.filasUsuario) {
      f.activo = this.roleDefaultMap.get(f.codigo) ?? true;
    }
    await this.guardarUsuario();
  }
}