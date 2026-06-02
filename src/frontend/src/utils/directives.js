export function parseDirectives(text) {
  const map = {};
  text.split('\n').forEach(line => {
    const idx = line.indexOf('=');
    if (idx > 0) map[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  });
  return map;
}

export function formatDirectives(map) {
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('\n');
}
