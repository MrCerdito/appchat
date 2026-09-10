import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import { permisoGuard } from './core/guards/permiso.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'chat', pathMatch: 'full' },
  {
    path: 'chat',
    loadComponent: () =>
      import('./features/client/chat/chat.component').then(m => m.ChatComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/advisor/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard, roleGuard('advisor')],
    loadComponent: () =>
      import('./features/advisor/dashboard/dashboard.component').then(m => m.DashboardComponent),
    children: [
      { path: '', redirectTo: 'chats', pathMatch: 'full' },
      {
        path: 'chats',
        canActivate: [permisoGuard('chats')],
        loadComponent: () =>
          import('./features/advisor/modules/chat-advisor/chat-advisor').then(m => m.ChatAdvisorComponent),
      },
      {
        path: 'history',
        canActivate: [permisoGuard('history')],
        loadComponent: () =>
          import('./features/advisor/modules/history/history').then(m => m.HistoryGlobalComponent),
      },
    

      {
    path: 'comunicados',
    canActivate: [permisoGuard('comunicados')],
    loadComponent: () =>
      import('./features/advisor/modules/comunicados/comunicados').then(m => m.ComunicadosComponent),
  },{
        path: 'metrics',
        canActivate: [permisoGuard('metrics')],
        loadComponent: () =>
          import('./features/advisor/modules/metrics/metrics').then(m => m.AdvisorMetricsComponent),
      },

      {
        path: 'documentos',
        canActivate: [permisoGuard('documentos')],
        loadComponent: () =>
          import('./features/advisor/modules/documentos/documentos.component').then(m => m.DocumentosComponent),
      },
      {
        path: 'perfil-institucional',
        canActivate: [permisoGuard('perfil_institucional')],
        loadComponent: () =>
          import('./features/advisor/modules/perfil-institucional/perfil-institucional.component').then(m => m.PerfilInstitucionalComponent),
      },
      {
        path: 'perfil-institucional/campos',
        canActivate: [permisoGuard('perfil_institucional')],
        loadComponent: () =>
          import('./features/advisor/modules/perfil-institucional/gestionar-campos.component').then(m => m.GestionarCamposComponent),
      },
      {
        path: 'perfil-institucional/:id',
        canActivate: [permisoGuard('perfil_institucional')],
        loadComponent: () =>
          import('./features/advisor/modules/perfil-institucional/perfil-detalle.component').then(m => m.PerfilDetalleComponent),
      },
      {
        path: 'configuracion',
        canActivate: [permisoGuard('configuracion')],
        loadComponent: () =>
          import('./features/advisor/modules/configuracion/configuracion').then(m => m.ConfiguracionComponent),
      },      {
        path: 'whatsapp',
        canActivate: [permisoGuard('whatsapp')],
        loadComponent: () =>
          import('./features/advisor/modules/whatsapp/whatsapp').then(m => m.WhatsappChatComponent),
      },
      {
        path: 'tickets',
        canActivate: [permisoGuard('tickets')],
        loadComponent: () =>
          import('./shared/tickets/tickets.component').then(m => m.TicketsComponent),
      },
    ],
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard('admin')],
    loadComponent: () =>
      import('./features/admin/admin-shell/admin-shell').then(m => m.AdminShellComponent),
    children: [
      { path: '', redirectTo: 'advisors', pathMatch: 'full' },
      {
        path: 'advisors',
        canActivate: [permisoGuard('advisors')],
        loadComponent: () =>
          import('./features/admin/modules/advisors/advisors').then(m => m.AdvisorsComponent),
      },
      {
        path: 'metrics',
        canActivate: [permisoGuard('metrics')],
        loadComponent: () =>
          import('./features/admin/modules/metrics/metrics').then(m => m.MetricsComponent),
      },
      {
        path: 'history',
        canActivate: [permisoGuard('history')],
        loadComponent: () =>
          import('./features/advisor/modules/history/history').then(m => m.HistoryGlobalComponent),
      },
      {
        path: 'operaciones',
        canActivate: [permisoGuard('whatsapp')],
        loadComponent: () =>
          import('./features/admin/modules/operaciones/operaciones').then(m => m.OperacionesComponent),
      },
      {
        path: 'operaciones/chats',
        canActivate: [permisoGuard('chat_interno')],
        loadComponent: () =>
          import('./features/admin/modules/operaciones/pages/chats/operaciones-chats').then(m => m.OperacionesChatsComponent),
      },
      {
        path: 'operaciones/asignar',
        canActivate: [permisoGuard('whatsapp')],
        loadComponent: () =>
          import('./features/admin/modules/operaciones/pages/asignar/operaciones-asignar').then(m => m.OperacionesAsignarComponent),
      },
      {
        path: 'operaciones/asesores',
        canActivate: [permisoGuard('whatsapp')],
        loadComponent: () =>
          import('./features/admin/modules/operaciones/pages/asesores/operaciones-asesores').then(m => m.OperacionesAsesoresComponent),
      },
      {
        path: 'operaciones/reportes',
        canActivate: [permisoGuard('reportes')],
        loadComponent: () =>
          import('./features/admin/modules/operaciones/pages/reportes/operaciones-reportes').then(m => m.OperacionesReportesComponent),
      },
      {
        path: 'operaciones/fijar',
        canActivate: [permisoGuard('whatsapp')],
        loadComponent: () =>
          import('./features/admin/modules/operaciones/pages/fijar/operaciones-fijar').then(m => m.OperacionesFijarComponent),
      },
      {
        path: 'configuracion',
        canActivate: [permisoGuard('configuracion')],
        loadComponent: () =>
          import('./features/admin/modules/configuracion/admin-configuracion.component')
            .then(m => m.AdminConfiguracionComponent),
      },
      {
        path: 'cambios',
        canActivate: [permisoGuard('changelog')],
        loadComponent: () =>
          import('./features/admin/modules/changelog/changelog-admin.component')
            .then(m => m.ChangelogAdminComponent),
      },
      {
        path: 'widget',
        canActivate: [permisoGuard('widget')],
        loadComponent: () =>
          import('./features/admin/modules/widget/widget').then(m => m.WidgetComponent),
      },
      {
        path: 'faq',
        canActivate: [permisoGuard('faq')],
        loadComponent: () =>
          import('./features/admin/modules/faq/faq-admin.component').then(m => m.FaqAdminComponent),
      },
      {
        path: 'tickets',
        canActivate: [permisoGuard('tickets')],
        loadComponent: () =>
          import('./shared/tickets/tickets.component').then(m => m.TicketsComponent),
      },
      {
        path: 'perfil-institucional',
        canActivate: [permisoGuard('perfil_institucional')],
        loadComponent: () =>
          import('./features/advisor/modules/perfil-institucional/perfil-institucional.component').then(m => m.PerfilInstitucionalComponent),
      },
      {
        path: 'perfil-institucional/campos',
        canActivate: [permisoGuard('perfil_institucional')],
        loadComponent: () =>
          import('./features/advisor/modules/perfil-institucional/gestionar-campos.component').then(m => m.GestionarCamposComponent),
      },
      {
        path: 'perfil-institucional/:id',
        canActivate: [permisoGuard('perfil_institucional')],
        loadComponent: () =>
          import('./features/advisor/modules/perfil-institucional/perfil-detalle.component').then(m => m.PerfilDetalleComponent),
      },
    ],
  },
  {
    path: 'developer',
    canActivate: [authGuard, roleGuard('desarrollador')],
    loadComponent: () =>
      import('./features/developer/developer-shell').then(m => m.DeveloperShellComponent),
    children: [
      { path: '', redirectTo: 'tickets', pathMatch: 'full' },
      {
        path: 'tickets',
        canActivate: [permisoGuard('tickets')],
        loadComponent: () =>
          import('./shared/tickets/tickets.component').then(m => m.TicketsComponent),
      },
    ],
  },
  {
    path: 'interno',
    canActivate: [authGuard, roleGuard('interno')],
    loadComponent: () =>
      import('./features/interno/interno-shell').then(m => m.InternoShellComponent),
    children: [
      { path: '', redirectTo: 'tickets', pathMatch: 'full' },
      {
        path: 'tickets',
        canActivate: [permisoGuard('tickets')],
        loadComponent: () =>
          import('./shared/tickets/tickets.component').then(m => m.TicketsComponent),
      },
      {
        path: 'history',
        canActivate: [permisoGuard('history')],
        loadComponent: () =>
          import('./features/advisor/modules/history/history').then(m => m.HistoryGlobalComponent),
      },
      {
        path: 'comunicados',
        canActivate: [permisoGuard('comunicados')],
        loadComponent: () =>
          import('./features/advisor/modules/comunicados/comunicados').then(m => m.ComunicadosComponent),
      },
      {
        path: 'documentos',
        canActivate: [permisoGuard('documentos')],
        loadComponent: () =>
          import('./features/advisor/modules/documentos/documentos.component').then(m => m.DocumentosComponent),
      },
      {
        path: 'perfil-institucional',
        canActivate: [permisoGuard('perfil_institucional')],
        loadComponent: () =>
          import('./features/advisor/modules/perfil-institucional/perfil-institucional.component').then(m => m.PerfilInstitucionalComponent),
      },
      {
        path: 'perfil-institucional/campos',
        canActivate: [permisoGuard('perfil_institucional')],
        loadComponent: () =>
          import('./features/advisor/modules/perfil-institucional/gestionar-campos.component').then(m => m.GestionarCamposComponent),
      },
      {
        path: 'perfil-institucional/:id',
        canActivate: [permisoGuard('perfil_institucional')],
        loadComponent: () =>
          import('./features/advisor/modules/perfil-institucional/perfil-detalle.component').then(m => m.PerfilDetalleComponent),
      },
      {
        path: 'metrics',
        canActivate: [permisoGuard('metrics')],
        loadComponent: () =>
          import('./features/admin/modules/metrics/metrics').then(m => m.MetricsComponent),
      },
      {
        path: 'configuracion',
        canActivate: [permisoGuard('configuracion')],
        loadComponent: () =>
          import('./features/advisor/modules/configuracion/configuracion').then(m => m.ConfiguracionComponent),
      },
      {
        path: 'reportes',
        canActivate: [permisoGuard('reportes')],
        loadComponent: () =>
          import('./features/admin/modules/operaciones/pages/reportes/operaciones-reportes').then(m => m.OperacionesReportesComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'chat' },
];