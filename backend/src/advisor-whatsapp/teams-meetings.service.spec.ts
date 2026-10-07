import { TeamsMeetingsService } from './teams-meetings.service';

describe('TeamsMeetingsService subject creator prefix', () => {
  let service: TeamsMeetingsService;

  beforeEach(() => {
    service = new TeamsMeetingsService({} as any, {} as any, {} as any);
  });

  it.each([
    ['Reunion presencial'],
    ['Reunion virtual'],
    ['Yellow category'],
    ['Blue category'],
  ])('adds the creator name to in-person/virtual category %s', (category) => {
    const result = (service as any).subjectConAsesor(
      'Reunion con tal persona',
      { name: 'Jean Munoz' },
      [category],
    );

    expect(result).toBe('(Jean Munoz) Reunion con tal persona');
  });

  it.each([
    ['Cumpleanos'],
    ['Green category'],
    ['Reunion equipo'],
    ['Purple category'],
  ])('does not add the creator name to birthdays/team events in %s', (category) => {
    const result = (service as any).subjectConAsesor(
      'Cumpleaños de Ana',
      { name: 'Jean Munoz' },
      [category],
    );

    expect(result).toBe('Cumpleaños de Ana');
  });

  it('removes a pre-existing creator prefix from birthdays and team events', () => {
    const result = (service as any).subjectConAsesor(
      '(Jean Munoz) Reunion de equipo',
      { name: 'Jean Munoz' },
      ['Purple category'],
    );

    expect(result).toBe('Reunion de equipo');
  });
});
