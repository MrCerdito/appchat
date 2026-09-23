const CONTROL_KEYS = new Set([
  'controlacademic',
  'controlacademico',
  'control_academico',
  'control-academico',
  'control',
  'ctrl',
  'ctl',
  'korvixcontrol',
]);

const SIAN_KEYS = new Set([
  'sian365',
  'sian',
  'korvixsian',
]);

export function normalizarTipoColegio(
  value: string | null | undefined,
): string | null | undefined {
  if (value == null) return value;
  const text = String(value).trim();
  if (!text) return text;
  const key = text.toLowerCase().replace(/[\s_-]+/g, '');
  if (CONTROL_KEYS.has(key)) return 'ControlAcademic';
  if (SIAN_KEYS.has(key)) return 'Sian365';
  return text;
}