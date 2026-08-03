export const environment = {
  production: true,
  apiUrl: (globalThis as any).__ENV__?.apiUrl ?? '/korvix',
  wsUrl : (globalThis as any).__ENV__?.wsUrl ?? '',
  apiKey: (globalThis as any).__ENV__?.apiKey ?? '',
};