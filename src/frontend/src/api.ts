async function fetchWithRetry(url: string, opts: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok || (res.status < 429 && (res.status < 500 || res.status >= 600))) return res;
      if (i === retries) return res;
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      if (i === retries) throw e;
    }
    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
  throw new Error('fetchWithRetry exhausted retries');
}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const normalizedMethod = (opts.method ?? 'GET').toUpperCase();
  const fetchFn = normalizedMethod === 'GET' ? fetchWithRetry : fetch;
  const res = await fetchFn('/api' + path, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt);
  }
  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json() as Promise<T>;
  }
  return res.text() as Promise<T>;
}
