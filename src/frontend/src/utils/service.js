export function statusToBadgeClass(info) {
  return info.active ? 'online' : (info.state === 'failed' ? 'offline' : 'unknown');
}
