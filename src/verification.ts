export function searchableText(value?: string): string {
  if (!value) return '';
  return value.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractVerificationCode(parts: Array<string | undefined>): string {
  const contextRe = /(?:verification|temporary|code|验证码)[^\d]{0,120}(\d{6})/i;
  const bareRe = /\b\d{6}\b/;
  for (const p of parts) {
    const text = searchableText(p);
    if (!text) continue;
    const ctxMatch = text.match(contextRe);
    if (ctxMatch) return ctxMatch[1];
  }
  for (const p of parts) {
    const text = searchableText(p);
    if (!text) continue;
    const bareMatch = text.match(bareRe);
    if (bareMatch) return bareMatch[0];
  }
  return '';
}

export function formatCMTime(value?: string): string {
  if (!value) return '';
  try {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
    if (!m) return value;
    const utc = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    if (isNaN(utc.getTime())) return value;
    const local = new Date(utc.getTime() - utc.getTimezoneOffset() * 60000);
    const pad = (n: number) => String(n).padStart(2, '0');
    return local.getFullYear() + '-' + pad(local.getMonth() + 1) + '-' + pad(local.getDate()) +
      ' ' + pad(local.getHours()) + ':' + pad(local.getMinutes()) + ':' + pad(local.getSeconds());
  } catch (_) { return value; }
}
