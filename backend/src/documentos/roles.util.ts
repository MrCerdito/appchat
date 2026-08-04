// ─────────────────────────────────────────────────────────────────────────────
// Normalización canónica de roles para documentos.
// Garantiza que upload y edición persistan SIEMPRE el mismo valor canónico
// ("administrador", "docente", "estudiante", "padre") independientemente de
// los sinónimos que escriba el usuario ("admin", "profesor", "alumno", ...).
// ─────────────────────────────────────────────────────────────────────────────
export const MAPA_ROLES: Record<string, string> = {
  admin: 'administrador',
  administrador: 'administrador',
  docente: 'docente',
  profesor: 'docente',
  estudiante: 'estudiante',
  alumno: 'estudiante',
  padre: 'padre',
  madre: 'padre',
  acudiente: 'padre',
};

export const ROLES_DEFAULT: string[] = [
  'administrador',
  'docente',
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
