import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { SocketService } from './socket.service';
import { MisPermisosResponse } from '../models/modulo-acceso.model';

const STORAGE_KEY = 'chat_permisos';
const TTL_MS = 60_000;

/**
 * Permisos de módulos del usuario logueado (efectivos: usuario > perfil > todo visible).
 * Si no hay datos cargados, `tieneAcceso` devuelve true (comportamiento actual) para
 * no bloquear a sesiones antiguas ni al primer arranque.
 */
@Injectable({ providedIn: 'root' })
export class PermisosService {
  private permisos?: Record<string, boolean>;
  private loadedAt = 0;
  private inflight?: Promise<void>;
  private currentUserId?: string;

  /** Se emite tras cada carga/refresco de permisos (para que UI y menús se redibujen). */
  readonly permisosChanged$ = new Subject<void>();

  constructor(
    private http: HttpClient,
    private auth: AuthService,
    private socket: SocketService,
  ) {
    this.socket.on<any>('permisos_actualizados').subscribe(() => {
      this.invalidate();
      void this.asegurarCargados();
    });
    this.auth.user$.subscribe((user) => {
      if (user?.id && user.id !== this.currentUserId) {
        this.currentUserId = user.id;
        this.invalidate();
      } else if (!user) {
        this.currentUserId = undefined;
        this.invalidate();
      }
    });
  }

  private readCache(): Record<string, boolean> | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : null;
    } catch {
      return null;
    }
  }

  invalidate(): void {
    this.permisos = undefined;
    this.loadedAt = 0;
    this.inflight = undefined;
  }

  async asegurarCargados(): Promise<void> {
    if (this.permisos && Date.now() - this.loadedAt < TTL_MS) return;
    if (this.inflight) return this.inflight;
    const user = this.auth.getUser();
    if (!user) {
      this.permisos = {};
      this.loadedAt = Date.now();
      this.permisosChanged$.next();
      return;
    }

    this.inflight = firstValueFrom(
      this.http.get<MisPermisosResponse>(
        `${environment.apiUrl}/accesos/mis-permisos`,
      ),
    )
      .then((res) => {
        const map: Record<string, boolean> = {};
        for (const m of res.modulos) map[m.codigo] = m.activo ?? true;
        this.permisos = map;
        this.loadedAt = Date.now();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      })
      .catch(() => {
        this.permisos = this.readCache() ?? {};
        this.loadedAt = Date.now();
      })
      .finally(() => {
        this.inflight = undefined;
      });

    await this.inflight;
    this.permisosChanged$.next();
  }

  async refresh(): Promise<void> {
    this.invalidate();
    return this.asegurarCargados();
  }

  tieneAcceso(codigo: string): boolean {
    if (!this.permisos) return true;
    return this.permisos[codigo] !== false;
  }

  getPermisos(): Readonly<Record<string, boolean>> {
    return this.permisos ?? {};
  }
}