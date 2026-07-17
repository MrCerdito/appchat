export function getInitials(name: string): string {
  if (!name) return '?';
  return name.split(' ').map(s => s.charAt(0)).join('').toUpperCase().slice(0, 2);
}

export function getAvatarColor(name: string): string {
  if (!name) return '#6b7280';
  const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
  let hash = 0;
  for (const ch of name) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
