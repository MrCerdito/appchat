import { CalendarioGrupoService } from './calendario-grupo.service';

describe('CalendarioGrupoService event subjects', () => {
  const service = new CalendarioGrupoService({} as any, {} as any, {} as any);

  const event = (subject: string, categories: string[]) => ({
    id: 'graph-event-id',
    subject,
    start: { dateTime: '2026-10-08T14:00:00' },
    end: { dateTime: '2026-10-08T15:00:00' },
    categories,
  });

  it.each([['Purple category'], ['Green category'], ['Reunion equipo'], ['Cumpleaños']])(
    'hides the creator prefix for team and birthday events (%s)',
    (category) => {
      const mapped = (service as any).mapear(
        event('(Jean Munoz) Actividad del equipo', [category]),
        undefined,
        'grupo',
      );

      expect(mapped.subject).toBe('Actividad del equipo');
    },
  );

  it.each([['Yellow category'], ['Blue category']])(
    'keeps the creator prefix for in-person and virtual meetings (%s)',
    (category) => {
      const mapped = (service as any).mapear(
        event('(Jean Munoz) Reunion con el cliente', [category]),
        undefined,
        'grupo',
      );

      expect(mapped.subject).toBe('(Jean Munoz) Reunion con el cliente');
    },
  );
});
