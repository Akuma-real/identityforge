import type { RNG } from './random';

const EMAIL_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomEmailSuffix(rng: RNG, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += EMAIL_ALPHABET[rng.intn(36)];
  return s;
}

export function nameSlug(name: string): string {
  let slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) slug = 'user';
  if (slug.length > 32) slug = slug.slice(0, 32).replace(/-+$/, '') || 'user';
  return slug;
}

export function generateUniqueEmail(name: string, domain: string, minPrefix: number, used: Set<string>, rng: RNG): string {
  domain = domain.trim().toLowerCase();
  if (!domain.startsWith('@')) domain = '@' + domain;
  if (!domain || domain === '@') throw new Error('Invalid email domain');
  if (minPrefix < 1) minPrefix = 1;

  let base = 'sg-' + nameSlug(name);
  while (base.length < minPrefix) base += '-x';

  for (let i = 0; i < 500; i++) {
    const email = base + '-' + randomEmailSuffix(rng, 6) + domain;
    if (!used.has(email)) return email;
  }
  throw new Error('Failed to generate unique email');
}
