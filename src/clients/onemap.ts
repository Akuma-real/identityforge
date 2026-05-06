import type { AddressRecord, OneMapResult, OneMapSearchResponse } from '../types';

const ONEMAP_URL = 'https://www.onemap.gov.sg/api/common/elastic/search';
const NON_RESIDENTIAL = [
  'MRT', 'BUS INTERCHANGE', 'MARKET', 'SCHOOL', 'PARK', 'MALL', 'LIBRARY',
  'POLICE', 'HOSPITAL', 'CLINIC', 'TEMPLE', 'CHURCH', 'MOSQUE', 'HOTEL',
  'COMMUNITY CLUB', 'HAWKER', 'FOOD CENTRE', 'STADIUM', 'DEPOT',
];
const QUERY_SEEDS = [
  'ANG MO KIO', 'BEDOK', 'TAMPINES', 'WOODLANDS', 'YISHUN', 'JURONG WEST',
  'HOUGANG', 'SENGKANG', 'PUNGGOL', 'CLEMENTI', 'QUEENSTOWN', 'TOA PAYOH',
];

function displayAddress(full: string): string {
  let trimmed = full.trim();
  if (!trimmed) return '';
  let parts = trimmed.split(/\s+/);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const secondLast = parts[parts.length - 2];
    if (/^\d{6}$/.test(last) && secondLast.toUpperCase() === 'SINGAPORE') {
      parts = parts.slice(0, -2);
    }
  }
  return parts.join(' ');
}

export function normalizeAddress(result: OneMapResult): AddressRecord | null {
  const block = (result.BLK_NO || '').trim();
  const road = (result.ROAD_NAME || '').trim();
  const postal = (result.POSTAL || '').trim();
  const address = (result.ADDRESS || '').trim();
  const building = (result.BUILDING || '').trim();
  const searchVal = (result.SEARCHVAL || '').trim();

  if (!block || !road || !address) return null;
  if (!/^\d{6}$/.test(postal)) return null;
  if (!/^[0-9]{1,4}[A-Z]?$/i.test(block)) return null;

  const source = [searchVal, building, address, block, road].join(' ').toUpperCase();
  for (const term of NON_RESIDENTIAL) {
    if (source.includes(term)) return null;
  }

  const roadUpper = road.toUpperCase();
  const full = displayAddress(block + ' ' + roadUpper + ' SINGAPORE ' + postal);
  return { block, road: roadUpper, postal_code: postal, full };
}

async function fetchOneMapPage(searchVal: string, pageNum: number, token: string): Promise<OneMapSearchResponse> {
  const params = new URLSearchParams({ searchVal, returnGeom: 'N', getAddrDetails: 'Y', pageNum: String(pageNum) });
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;

  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      url: ONEMAP_URL + '?' + params.toString(),
      method: 'GET',
      headers,
      timeout: 15000,
      onload: (r) => {
        try { resolve(JSON.parse(r.responseText) as OneMapSearchResponse); }
        catch (_) { reject(new Error('OneMap parse error')); }
      },
      onerror: () => reject(new Error('OneMap network error')),
      ontimeout: () => reject(new Error('OneMap timeout')),
    });
  });
}

export async function fetchAllAddresses(token: string): Promise<AddressRecord[]> {
  const all: AddressRecord[] = [];
  for (const seed of QUERY_SEEDS) {
    try {
      const first = await fetchOneMapPage(seed, 1, token);
      if (!first || first.found === 0) continue;
      for (const r of first.results || []) {
        const addr = normalizeAddress(r);
        if (addr) all.push(addr);
      }
      const totalPages = first.totalNumPages || 1;
      for (let page = 2; page <= totalPages; page++) {
        const pg = await fetchOneMapPage(seed, page, token);
        for (const r of pg.results || []) {
          const addr = normalizeAddress(r);
          if (addr) all.push(addr);
        }
      }
    } catch (_) {
      // Skip failed seeds.
    }
  }

  const seen = new Set<string>();
  const unique: AddressRecord[] = [];
  for (const a of all) {
    if (!seen.has(a.full)) {
      seen.add(a.full);
      unique.push(a);
    }
  }
  unique.sort((a, b) => a.full.localeCompare(b.full));
  return unique;
}
