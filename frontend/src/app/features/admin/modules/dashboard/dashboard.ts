import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../../core/services/auth.service';
import { PermisosService } from '../../../../core/services/permisos.service';
import { User } from '../../../../core/models/user.model';

export type ModuloIcono =
  | 'history'
  | 'advisors'
  | 'metrics'
  | 'whatsapp'
  | 'chat_interno'
  | 'reportes'
  | 'tickets'
  | 'calendario'
  | 'perfil_institucional'
  | 'faq'
  | 'widget'
  | 'configuracion';

interface ModuloTarjeta {
  codigo: string;
  ruta: string;
  titulo: string;
  descripcion: string;
  color: string;
  icono: ModuloIcono;
  deshabilitado: boolean;
}

const MODULOS: ModuloTarjeta[] = [
  {
    codigo: 'history',
    ruta: 'history',
    titulo: 'Historial',
    descripcion: 'Chat en línea por asesor y día',
    color: '#3b82f6',
    icono: 'history',
    deshabilitado: false,
  },
  {
    codigo: 'advisors',
    ruta: 'advisors',
    titulo: 'Agentes',
    descripcion: 'Gestiona asesores, roles y conectividad',
    color: '#8b5cf6',
    icono: 'advisors',
    deshabilitado: false,
  },
  {
    codigo: 'metrics',
    ruta: 'metrics',
    titulo: 'Métricas',
    descripcion: 'Indicadores, rankings y actividad de la IA',
    color: '#10b981',
    icono: 'metrics',
    deshabilitado: false,
  },
  {
    codigo: 'whatsapp',
    ruta: 'operaciones',
    titulo: 'WhatsApp',
    descripcion: 'Panel de operaciones y conversaciones',
    color: '#22c55e',
    icono: 'whatsapp',
    deshabilitado: true,
  },
  {
    codigo: 'chat_interno',
    ruta: 'operaciones/chats',
    titulo: 'Chat interno',
    descripcion: 'Mensajería entre agentes y administradores',
    color: '#ef4444',
    icono: 'chat_interno',
    deshabilitado: true,
  },
  {
    codigo: 'reportes',
    ruta: 'operaciones/reportes',
    titulo: 'Reporte',
    descripcion: 'Reportes y exportación de WhatsApp',
    color: '#f59e0b',
    icono: 'reportes',
    deshabilitado: true,
  },
  {
    codigo: 'tickets',
    ruta: 'tickets',
    titulo: 'Tickets',
    descripcion: 'Solicitudes y casos de soporte',
    color: '#ec4899',
    icono: 'tickets',
    deshabilitado: false,
  },
  {
    codigo: 'calendario',
    ruta: 'calendario',
    titulo: 'Calendario',
    descripcion: 'Reuniones de Teams',
    color: '#0ea5e9',
    icono: 'calendario',
    deshabilitado: false,
  },
  {
    codigo: 'perfil_institucional',
    ruta: 'perfil-institucional',
    titulo: 'Perfil Institucional',
    descripcion: 'Instituciones, comunicados y agenda',
    color: '#6366f1',
    icono: 'perfil_institucional',
    deshabilitado: false,
  },
  {
    codigo: 'faq',
    ruta: 'faq',
    titulo: 'FAQ',
    descripcion: 'Preguntas frecuentes del asistente',
    color: '#f43f5e',
    icono: 'faq',
    deshabilitado: false,
  },
  {
    codigo: 'widget',
    ruta: 'widget',
    titulo: 'Widget',
    descripcion: 'Configura el botón flotante de chat',
    color: '#14b8a6',
    icono: 'widget',
    deshabilitado: false,
  },
  {
    codigo: 'configuracion',
    ruta: 'configuracion',
    titulo: 'Configuración',
    descripcion: 'Parámetros generales del sistema',
    color: '#64748b',
    icono: 'configuracion',
    deshabilitado: false,
  },
];

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  currentAdmin: User | null = null;
  fechaHoy = '';

  private destroy$ = new Subject<void>();

  constructor(
    private auth: AuthService,
    private permisos: PermisosService,
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
    return MODULOS.filter((m) => this.permisos.tieneAcceso(m.codigo));
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
      return new Intl.DateTimeFormat('es-CO', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
    } catch {
      return new Date().toLocaleDateString('es-CO');
    }
  }
}