export function formatTimestampWithOffset(now = new Date()): string {
  const pad2 = (n: number) => String(Math.abs(n)).padStart(2, '0');
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absOffset = Math.abs(offsetMinutes);
  return now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) +
    'T' + pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds()) +
    sign + pad2(Math.floor(absOffset / 60)) + ':' + pad2(absOffset % 60);
}
