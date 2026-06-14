export function getBatteryChargeColor(charge: number): string {
  return charge <= 20 ? 'var(--red)' : charge <= 50 ? 'var(--orange)' : 'var(--green)';
}

export function getLoadColor(load: number): string {
  return load >= 80 ? 'var(--red)' : load >= 60 ? 'var(--orange)' : 'var(--accent)';
}
