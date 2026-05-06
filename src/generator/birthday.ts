import type { RNG } from './random';

export function randomAge(rng: RNG): number {
  return 18 + rng.intn(33);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function randomBirthday(rng: RNG, age: number, now = new Date()): string {
  const year = now.getFullYear() - age;
  const month = 1 + rng.intn(12);
  const day = 1 + rng.intn(daysInMonth(year, month));
  return String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
}
