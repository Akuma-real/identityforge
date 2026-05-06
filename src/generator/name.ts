import type { RNG } from './random';
import { pick } from './random';

const englishGivenNames = [
  'Adrian', 'Alicia', 'Brandon', 'Cheryl', 'Darren', 'Evelyn', 'Felicia',
  'Gerald', 'Hannah', 'Isaac', 'Jasmine', 'Kenneth', 'Lydia', 'Marcus',
  'Nadia', 'Pravin', 'Rina', 'Suresh', 'Terence', 'Vanessa', 'Wei Jie', 'Xin Yi',
];
const chineseSurnames = [
  'Tan', 'Lim', 'Lee', 'Ng', 'Ong', 'Wong', 'Chua', 'Koh', 'Goh', 'Teo', 'Yeo', 'Low',
];
const chineseGivenParts = [
  'Wei', 'Jun', 'Ming', 'Kai', 'Jie', 'Hui', 'Xuan', 'Yi', 'Ling', 'Mei',
];
const malayGivenNames = [
  'Nur', 'Aisyah', 'Farhan', 'Hafiz', 'Irfan', 'Siti', 'Amirah', 'Hakim',
  'Zul', 'Danish', 'Nadia', 'Rafiq',
];
const malaySurnames = [
  'Rahman', 'Hassan', 'Ismail', 'Yusof', 'Salleh', 'Ibrahim', 'Osman',
];
const indianGivenNames = [
  'Arjun', 'Priya', 'Kavitha', 'Ravi', 'Anjali', 'Vikram', 'Meena',
  'Devan', 'Lakshmi', 'Kiran', 'Nisha', 'Sanjay',
];
const indianSurnames = [
  'Menon', 'Pillai', 'Nair', 'Rajan', 'Krishnan', 'Kumar', 'Singh',
];

function mustPick(rng: RNG, arr: string[]): string {
  return pick(rng, arr) || '';
}

export function generateName(rng: RNG): string {
  switch (rng.intn(4)) {
    case 0: return mustPick(rng, englishGivenNames) + ' ' + mustPick(rng, chineseSurnames);
    case 1: return mustPick(rng, chineseSurnames) + ' ' + mustPick(rng, chineseGivenParts) + ' ' + mustPick(rng, chineseGivenParts);
    case 2: return mustPick(rng, malayGivenNames) + ' bin ' + mustPick(rng, malaySurnames);
    default: return mustPick(rng, indianGivenNames) + ' ' + mustPick(rng, indianSurnames);
  }
}

export function uniqueName(rng: RNG, usedNames: Set<string>): string {
  for (let i = 0; i < 100; i++) {
    const n = generateName(rng);
    if (!usedNames.has(n)) return n;
  }
  for (let i = 100; i < 1000; i++) {
    const n = generateName(rng) + ' ' + String(i).padStart(3, '0');
    if (!usedNames.has(n)) return n;
  }
  return generateName(rng) + ' ' + Date.now();
}
