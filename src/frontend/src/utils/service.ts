import type { ServiceInfo } from '../types';

export function statusToBadgeClass(info: ServiceInfo): string {
  return info.active ? 'online' : (info.state === 'failed' ? 'offline' : 'unknown');
}
