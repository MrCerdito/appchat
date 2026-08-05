import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

@ValidatorConstraint({ name: 'validTimeRange', async: false })
export class ValidTimeRangeConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as Record<string, unknown>;
    const inicio = obj['inicio'];
    const fin = obj['fin'];
    if (
      typeof inicio !== 'string' ||
      typeof fin !== 'string' ||
      !HHMM_RE.test(inicio) ||
      !HHMM_RE.test(fin)
    ) {
      return false;
    }
    const [h1, m1] = inicio.split(':').map(Number);
    const [h2, m2] = fin.split(':').map(Number);
    return h1 * 60 + m1 < h2 * 60 + m2;
  }

  defaultMessage(): string {
    return 'El inicio debe ser menor que el fin y ambos deben ser HH:MM válidos';
  }
}
