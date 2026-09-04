// ─────────────────────────────────────────────────────────────────────────────
// Normalización canónica de roles para documentos.
// Garantiza que upload y edición persistan SIEMPRE el mismo valor canónico
// ("administrador", "docente", "coordinador", "estudiante", "padre") independientemente de
// los sinónimos que escriba el usuario ("admin", "profesor", "alumno", ...).
// ─────────────────────────────────────────────────────────────────────────────
export const MAPA_ROLES: Record<string, string> = {
  admin: 'administrador',
  administrador: 'administrador',
  docente: 'docente',
  profesor: 'docente',
  coordinador: 'coordinador',
  estudiante: 'estudiante',
  alumno: 'estudiante',
  padre: 'padre',
  madre: 'padre',
  acudiente: 'padre',
};

export const ROLES_DEFAULT: string[] = [
  'administrador',
  'docente',
  'coordinador',
  'estudiante',
  'padre',
];

export function normalizarRolesCsv(csv?: string | null): string {
  if (!csv || !csv.trim()) return '';
  const roles = csv
    .split(',')
    .map((r) => MAPA_ROLES[r.trim().toLowerCase()] ?? r.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(roles)].join(',');
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalización de Categorías y Mapeo desde Tipo de Solicitud del Cliente
// Homologa las opciones seleccionadas en la solicitud del cliente con las
// categorías de la base de conocimiento para forzar coincidencia en el RAG.
// ─────────────────────────────────────────────────────────────────────────────
export function normalizarCategoria(cat?: string | null): string {
  if (!cat) return 'general';
  const c = cat.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (c.includes('matricul') || c.includes('inscr') || c.includes('admis')) return 'matricula';
  if (c.includes('pago') || c.includes('factur') || c.includes('pension') || c.includes('costo') || c.includes('deuda')) return 'pagos';
  if (c.includes('soport') || c.includes('contras') || c.includes('clave') || c.includes('tecnic') || c.includes('plataform')) return 'soporte';
  if (c.includes('reglam') || c.includes('manual') || c.includes('norma') || c.includes('conviven')) return 'reglamento';
  if (c.includes('academic') || c.includes('nota') || c.includes('boletin') || c.includes('materia') || c.includes('clase')) return 'academico';
  return 'general';
}

export function mapearTipoSolicitudACategoria(tipoSolicitud?: string | null): string {
  return normalizarCategoria(tipoSolicitud);
}
