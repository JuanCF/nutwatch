async function fetchWithRetry(url, opts, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok || (res.status < 429 && (res.status < 500 || res.status >= 600))) return res;
      if (i === retries) return res;
    } catch (e) {
      if (i === retries) throw e;
    }
    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
}

export async function api(path, opts = {}) {
  const normalizedMethod = (opts.method || 'GET').toUpperCase();
  const fetchFn = normalizedMethod === 'GET' ? fetchWithRetry : fetch;
  const res = await fetchFn('/api' + path, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt);
  }
  if (res.headers.get('content-type')?.includes('application/json')) {
    return res.json();
  }
  return res.text();
}