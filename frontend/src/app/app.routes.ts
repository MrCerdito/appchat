import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';

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
        loadComponent: () =>
          import('./features/advisor/modules/chat-advisor/chat-advisor').then(m => m.ChatAdvisorComponent),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./features/advisor/modules/history/history').then(m => m.HistoryGlobalComponent),
      },
    

      {
    path: 'comunicados',
    loadComponent: () =>
      import('./features/advisor/modules/comunicados/comunicados').then(m => m.ComunicadosComponent),
  },{
        path: 'metrics',
        loadComponent: () =>
          import('./features/advisor/modules/metrics/metrics').then(m => m.AdvisorMetricsComponent),
      },

      {
        path: 'documentos',
        loadComponent: () =>
          import('./features/advisor/modules/documentos/documentos.component').then(m => m.DocumentosComponent),
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./features/advisor/modules/configuracion/configuracion').then(m => m.ConfiguracionComponent),
      },      {
        path: 'whatsapp',
        loadComponent: () =>
          import('./features/advisor/modules/whatsapp/whatsapp').then(m => m.WhatsappChatComponent),
      },
      {
        path: 'tickets',
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
        loadComponent: () =>
          import('./features/admin/modules/advisors/advisors').then(m => m.AdvisorsComponent),
      },
      {
        path: 'metrics',
        loadComponent: () =>
          import('./features/admin/modules/metrics/metrics').then(m => m.MetricsComponent),
      },
      {
        path: 'history',
        loadComponent: () =>
          import('./features/admin/modules/history/history').then(m => m.HistoryGlobalComponent),
      },
      {
        path: 'operaciones',
        loadComponent: () =>
          import('./features/admin/modules/operaciones/operaciones').then(m => m.OperacionesComponent),
      },
      {
        path: 'operaciones/chats',
        loadComponent: () =>
          import('./features/admin/modules/operaciones/pages/chats/operaciones-chats').then(m => m.OperacionesChatsComponent),
      },
      {
        path: 'operaciones/asignar',
        loadComponent: () =>
          import('./features/admin/modules/operaciones/pages/asignar/operaciones-asignar').then(m => m.OperacionesAsignarComponent),
      },
      {
        path: 'operaciones/asesores',
        loadComponent: () =>
          import('./features/admin/modules/operaciones/pages/asesores/operaciones-asesores').then(m => m.OperacionesAsesoresComponent),
      },
      {
        path: 'operaciones/alertas',
        loadComponent: () =>
          import('./features/admin/modules/operaciones/pages/alertas/operaciones-alertas').then(m => m.OperacionesAlertasComponent),
      },
      {
        path: 'operaciones/fijar',
        loadComponent: () =>
          import('./features/admin/modules/operaciones/pages/fijar/operaciones-fijar').then(m => m.OperacionesFijarComponent),
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./features/admin/modules/configuracion/admin-configuracion.component')
            .then(m => m.AdminConfiguracionComponent),
      },
      {
        path: 'widget',
        loadComponent: () =>
          import('./features/admin/modules/widget/widget').then(m => m.WidgetComponent),
      },
      {
        path: 'faq',
        loadComponent: () =>
          import('./features/admin/modules/faq/faq-admin.component').then(m => m.FaqAdminComponent),
      },
      {
        path: 'tickets',
        loadComponent: () =>
          import('./shared/tickets/tickets.component').then(m => m.TicketsComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'chat' },
];
