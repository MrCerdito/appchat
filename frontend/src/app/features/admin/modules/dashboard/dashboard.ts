import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  LucideAngularModule,
  LucideIconData,
  MessageSquare,
  UsersRound,
  ChartNoAxesColumn,
  MessageCircle,
  MessagesSquare,
  FileChartColumn,
  Ticket,
  CalendarDays,
  Mail,
  FolderOpen,
  Building2,
  CircleHelp,
  AppWindow,
  Settings,
  School,
  ArrowRight,
  Lock,
} from 'lucide-angular';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { PermisosService } from '../../../../core/services/permisos.service';
import { AdminSearchService } from '../../admin-search.service';
import { User } from '../../../../core/models/user.model';

export type ModuloIcono =
  | 'chat'
  | 'whatsapp'
  | 'reportes'
  | 'advisors'
  | 'metrics'
  | 'chat_interno'
  | 'tickets'
  | 'calendario'
  | 'correos'
  | 'sharepoint'
  | 'perfil_institucional'
  | 'faq'
  | 'widget'
  | 'configuracion'
  | 'colegios';

interface ModuloTarjeta {
  codigo: string;
  ruta: string;
  titulo: string;
  descripcion: string;
  icono: ModuloIcono;
  deshabilitado: boolean;
  categoria: string;
}

interface SeccionModulos {
  label: string;
  subtitulo: string;
  modulos: ModuloTarjeta[];
}

const SECCIONES: { label: string; subtitulo: string }[] = [
  { label: 'Comunicación', subtitulo: 'Canales y herramientas de atención' },
  { label: 'Gestión', subtitulo: 'Herramientas operativas y de soporte' },
  { label: 'Configuración', subtitulo: 'Parámetros y ajustes del sistema' },
];

const MODULOS: ModuloTarjeta[] = [
  // ── Comunicación ────────────────────────────────────────
  {
    codigo: 'history',
    categoria: 'Comunicación',
    ruta: 'history',
    titulo: 'Historial Chat',
    descripcion: 'Chat en línea por asesor y día',
    icono: 'chat',
    deshabilitado: false,
  },
  {
    codigo: 'whatsapp',
    categoria: 'Comunicación',
    ruta: 'operaciones',
    titulo: 'WhatsApp',
    descripcion: 'Panel de operaciones y conversaciones',
    icono: 'whatsapp',
    deshabilitado: true,
  },
  {
    codigo: 'reportes',
    categoria: 'Comunicación',
    ruta: 'operaciones/reportes',
    titulo: 'Reportes',
    descripcion: 'Reportes y exportación de WhatsApp',
    icono: 'reportes',
    deshabilitado: true,
  },
  {
    codigo: 'advisors',
    categoria: 'Comunicación',
    ruta: 'advisors',
    titulo: 'Agentes',
    descripcion: 'Gestiona asesores, roles y conectividad',
    icono: 'advisors',
    deshabilitado: false,
  },
  {
    codigo: 'metrics',
    categoria: 'Comunicación',
    ruta: 'metrics',
    titulo: 'Métricas',
    descripcion: 'Indicadores, rankings y actividad de la IA',
    icono: 'metrics',
    deshabilitado: false,
  },
  {
    codigo: 'chat_interno',
    categoria: 'Comunicación',
    ruta: 'operaciones/chats',
    titulo: 'Chat interno',
    descripcion: 'Mensajería entre agentes y administradores',
    icono: 'chat_interno',
    deshabilitado: true,
  },

  // ── Gestión ─────────────────────────────────────────────
  {
    codigo: 'tickets',
    categoria: 'Gestión',
    ruta: 'tickets',
    titulo: 'Tickets',
    descripcion: 'Solicitudes y casos de soporte',
    icono: 'tickets',
    deshabilitado: false,
  },
  {
    codigo: 'calendario',
    categoria: 'Gestión',
    ruta: 'calendario',
    titulo: 'Calendario',
    descripcion: 'Reuniones de Teams',
    icono: 'calendario',
    deshabilitado: false,
  },
  {
    codigo: 'correos',
    categoria: 'Gestión',
    ruta: 'correos',
    titulo: 'Correos',
    descripcion: 'SLA por agente',
    icono: 'correos',
    deshabilitado: false,
  },
  {
    codigo: 'sharepoint',
    categoria: 'Gestión',
    ruta: 'sharepoint',
    titulo: 'SharePoint',
    descripcion: 'Archivos del sitio de Soporte',
    icono: 'sharepoint',
    deshabilitado: false,
  },
  {
    codigo: 'perfil_institucional',
    categoria: 'Gestión',
    ruta: 'perfil-institucional',
    titulo: 'Perfil Institucional',
    descripcion: 'Instituciones, comunicados y agenda',
    icono: 'perfil_institucional',
    deshabilitado: false,
  },
  {
    codigo: 'widget',
    categoria: 'Gestión',
    ruta: 'widget',
    titulo: 'Widget',
    descripcion: 'Configura el botón flotante de chat',
    icono: 'widget',
    deshabilitado: false,
  },
  {
    codigo: 'faq',
    categoria: 'Gestión',
    ruta: 'faq',
    titulo: 'FAQ',
    descripcion: 'Preguntas frecuentes del asistente',
    icono: 'faq',
    deshabilitado: false,
  },

  // ── Configuración ───────────────────────────────────────
  {
    codigo: 'configuracion',
    categoria: 'Configuración',
    ruta: 'configuracion',
    titulo: 'Configuración',
    descripcion: 'Parámetros generales del sistema',
    icono: 'configuracion',
    deshabilitado: false,
  },
  {
    codigo: 'colegios',
    categoria: 'Configuración',
    ruta: 'colegios',
    titulo: 'Colegios',
    descripcion: 'Gestiona colegios, categorías y asesor principal',
    icono: 'colegios',
    deshabilitado: false,
  },
];

const ICONOS_LUCIDE: Record<ModuloIcono, LucideIconData> = {
  chat: MessageSquare,
  whatsapp: MessageCircle,
  reportes: FileChartColumn,
  advisors: UsersRound,
  metrics: ChartNoAxesColumn,
  chat_interno: MessagesSquare,
  tickets: Ticket,
  calendario: CalendarDays,
  correos: Mail,
  sharepoint: FolderOpen,
  perfil_institucional: Building2,
  faq: CircleHelp,
  widget: AppWindow,
  configuracion: Settings,
  colegios: School,
};

function normalizar(txt: string): string {
  return txt
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Título del módulo para el breadcrumb del shell (Korvix/Ruta). */
export function tituloDeRuta(url: string): string {
  const limpio = url.split('?')[0].replace(/^\/admin\/?/, '');
  if (!limpio || limpio === 'dashboard') return 'Administración';
  const segmento = limpio.split('/')[0];
  const exacto = MODULOS.find((m) => m.ruta === limpio);
  if (exacto) return exacto.titulo;
  const prefijo = MODULOS.find((m) => limpio.startsWith(m.ruta + '/'));
  if (prefijo) return prefijo.titulo;
  return segmento.charAt(0).toUpperCase() + segmento.slice(1);
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  protected readonly icons = { ArrowRight, Lock, CalendarDays };
  currentAdmin: User | null = null;
  fechaHoy = '';
  searchQuery = '';

  private destroy$ = new Subject<void>();

  constructor(
    private auth: AuthService,
    private permisos: PermisosService,
    private searchSvc: AdminSearchService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.auth.user$.subscribe({
      next: (user) => {
        this.currentAdmin = user;
        this.cdr.markForCheck();
      },
      error: (err) => console.error('HTTP Error:', err),
    });
    this.fechaHoy = this.fechaLarga();
    this.searchQuery = this.searchSvc.snapshot;
    this.searchSvc.queryStream$
      .pipe(takeUntil(this.destroy$))
      .subscribe((q) => {
        this.searchQuery = q;
        this.cdr.markForCheck();
      });
    void this.permisos.asegurarCargados().then(() => this.cdr.markForCheck());
    this.permisos.permisosChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get modulos(): ModuloTarjeta[] {
    const base = MODULOS.filter((m) => this.permisos.tieneAcceso(m.codigo));
    const q = normalizar(this.searchQuery);
    if (!q) return base;
    return base.filter((m) =>
      normalizar(`${m.titulo} ${m.descripcion} ${m.categoria}`).includes(q),
    );
  }

  iconoDe(codigo: ModuloIcono): LucideIconData {
    return ICONOS_LUCIDE[codigo];
  }

  get secciones(): SeccionModulos[] {
    const mods = this.modulos;
    return SECCIONES.map((s) => ({
      ...s,
      modulos: mods.filter((m) => m.categoria === s.label),
    })).filter((s) => s.modulos.length > 0);
  }

  esSuperadmin(): boolean {
    return this.currentAdmin?.role === 'superadmin';
  }

  roleLabel(): string {
    return this.currentAdmin?.role === 'superadmin'
      ? 'Superadministrador'
      : 'Administrador';
  }

  private fechaLarga(): string {
    try {
      const f = new Intl.DateTimeFormat('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
      return f.charAt(0).toUpperCase() + f.slice(1);
    } catch {
      return new Date().toLocaleDateString('es-CO');
    }
  }
}
