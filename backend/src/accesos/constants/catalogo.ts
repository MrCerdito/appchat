export interface ModuloDef {
  codigo: string;
  nombre: string;
  grupo: string;
  descripcion: string;
  aplicaA: string[];
}

/**
 * Catálogo de módulos de la aplicación (para el control de accesos por
 * perfil/rol y por usuario). El campo `aplicaA` indica a qué perfiles
 * (admin | advisor | desarrollador | interno) aplica ese módulo.
 */
export const CATALOGO_MODULOS: ModuloDef[] = [
  // ── Atención ────────────────────────────────────────────────
  {
    codigo: 'chats',
    nombre: 'Chats',
    grupo: 'Atención',
    descripcion: 'Atención de chats en línea con clientes',
    aplicaA: ['advisor'],
  },
  {
    codigo: 'whatsapp',
    nombre: 'WhatsApp',
    grupo: 'Atención',
    descripcion: 'Conversaciones de WhatsApp con clientes',
    aplicaA: ['advisor', 'admin'],
  },
  {
    codigo: 'chat_interno',
    nombre: 'Chat interno',
    grupo: 'Atención',
    descripcion: 'Chat entre asesores y administradores',
    aplicaA: ['advisor', 'admin'],
  },

  // ── Gestión ─────────────────────────────────────────────────
  {
    codigo: 'tickets',
    nombre: 'Tickets',
    grupo: 'Gestión',
    descripcion: 'Solicitudes, PQRS y tickets de soporte',
    aplicaA: ['advisor', 'admin', 'desarrollador', 'interno'],
  },
  {
    codigo: 'history',
    nombre: 'Historial',
    grupo: 'Gestión',
    descripcion: 'Historial de sesiones y conversaciones',
    aplicaA: ['advisor', 'admin', 'interno'],
  },
  {
    codigo: 'comunicados',
    nombre: 'Comunicados',
    grupo: 'Gestión',
    descripcion: 'Correos masivos a colegios (envíos y plantillas)',
    aplicaA: ['advisor', 'interno'],
  },
  {
    codigo: 'documentos',
    nombre: 'Documentos',
    grupo: 'Gestión',
    descripcion: 'Documentos del colegio',
    aplicaA: ['advisor', 'interno'],
  },
  {
    codigo: 'perfil_institucional',
    nombre: 'Perfil institucional',
    grupo: 'Gestión',
    descripcion: 'Información institucional del colegio',
    aplicaA: ['advisor', 'admin', 'interno'],
  },
  {
    codigo: 'calendario',
    nombre: 'Calendario',
    grupo: 'Gestión',
    descripcion: 'Agenda de reuniones de Teams de la cuenta general',
    aplicaA: ['advisor', 'admin', 'interno'],
  },

  // ── Análisis ────────────────────────────────────────────────
  {
    codigo: 'metrics',
    nombre: 'Métricas',
    grupo: 'Análisis',
    descripcion: 'Indicadores y métricas de atención',
    aplicaA: ['advisor', 'admin', 'interno'],
  },

  // ── Configuración ───────────────────────────────────────────
  {
    codigo: 'configuracion',
    nombre: 'Configuración',
    grupo: 'Configuración',
    descripcion: 'Ajustes generales de la cuenta',
    aplicaA: ['advisor', 'admin', 'interno'],
  },

  // ── Administración ──────────────────────────────────────────
  {
    codigo: 'advisors',
    nombre: 'Agentes',
    grupo: 'Administración',
    descripcion: 'Gestión de usuarios y agentes',
    aplicaA: ['admin'],
  },
  {
    codigo: 'reportes',
    nombre: 'Reporte de WhatsApp',
    grupo: 'Administración',
    descripcion: 'Reportes de operación de WhatsApp',
    aplicaA: ['admin', 'interno'],
  },
  {
    codigo: 'faq',
    nombre: 'FAQ',
    grupo: 'Administración',
    descripcion: 'Preguntas frecuentes y asistentes de IA',
    aplicaA: ['admin'],
  },
  {
    codigo: 'widget',
    nombre: 'Widget',
    grupo: 'Administración',
    descripcion: 'Personalización del widget de chat',
    aplicaA: ['admin'],
  },
  {
    codigo: 'accesos',
    nombre: 'Accesos',
    grupo: 'Administración',
    descripcion: 'Control de módulos por perfil y por usuario',
    aplicaA: ['admin'],
  },
  {
    codigo: 'changelog',
    nombre: 'Cambios y actualizaciones',
    grupo: 'Administración',
    descripcion: 'Notas de actualización publicadas por el superadmin',
    aplicaA: ['admin'],
  },
];