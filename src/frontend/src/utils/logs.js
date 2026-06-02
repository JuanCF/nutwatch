export function classifyLogLine(text) {
  let cls = 'log-line';
  if (/\berror\b|\bfail\b|\berr\b/i.test(text)) cls += ' error';
  else if (/\bwarn\b|\bwarning\b/i.test(text)) cls += ' warn';
  else if (/\binfo\b|\bstarted\b|\brunning\b/i.test(text)) cls += ' info';
  return cls;
}
