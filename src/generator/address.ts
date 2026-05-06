import type { AddressRecord } from '../types';
import type { RNG } from './random';
import { saveUsedAddresses } from '../storage';

export function pickUnusedAddress(rng: RNG, addressPool: AddressRecord[], usedAddresses: Set<string>): AddressRecord | null {
  const available = addressPool.filter(a => !usedAddresses.has(a.full));
  if (available.length === 0) {
    usedAddresses.clear();
    saveUsedAddresses(usedAddresses);
    return addressPool.length ? addressPool[rng.intn(addressPool.length)] : null;
  }
  return available[rng.intn(available.length)];
}
