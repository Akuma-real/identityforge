export function gmFetch<T = unknown>(url: string, opts: { method?: string; headers?: Record<string, string>; body?: unknown; timeout?: number } = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      url,
      method: opts.method || 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
      data: opts.body ? JSON.stringify(opts.body) : undefined,
      timeout: opts.timeout || 30000,
      onload(r) {
        try {
          const data = JSON.parse(r.responseText) as T & { error?: string; message?: string };
          if (r.status >= 200 && r.status < 300) resolve(data);
          else reject(new Error(data.error || data.message || 'HTTP ' + r.status));
        } catch (_) {
          if (r.status >= 200 && r.status < 300) resolve(r.responseText as T);
          else reject(new Error('HTTP ' + r.status + ': ' + r.responseText));
        }
      },
      onerror() { reject(new Error('Network error')); },
      ontimeout() { reject(new Error('Request timeout')); },
    });
  });
}
