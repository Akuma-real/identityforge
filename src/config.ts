export const DEFAULTS = {
  CLIPROXYAPI_BASE: 'https://api.example.com',
  CLIPROXYAPI_MANAGEMENT_KEY: '',
  CLOUDMAIL_BASE: 'https://mail.example.com',
  CLOUDMAIL_LOGIN: '',
  CLOUDMAIL_PASSWORD: '',
  CLOUDMAIL_DOMAIN: '@example.com',
  CLOUDMAIL_POLL_INTERVAL: 5,
  CLOUDMAIL_POLL_TIMEOUT: 600,
} as const;

export type ConfigKey = keyof typeof DEFAULTS;

export function cfg<K extends ConfigKey>(key: K): (typeof DEFAULTS)[K] {
  return GM_getValue('gha_' + key, DEFAULTS[key]);
}

export function setCfg<K extends ConfigKey>(key: K, val: (typeof DEFAULTS)[K] | string | number): void {
  GM_setValue('gha_' + key, val);
}
