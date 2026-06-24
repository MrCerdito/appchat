export const trackByIndex = (i: number): number => i;

export const trackById = (_: number, item: any): any =>
  item?.id ?? item?._id ?? item?.phone ?? item?.jid ?? _;

export const trackByValue = (_: number, item: any): any =>
  typeof item === 'string' || typeof item === 'number' ? item : _;
