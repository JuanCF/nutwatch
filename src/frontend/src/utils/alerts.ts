type AlertFn = (msg: string, title?: string) => Promise<void>;

function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export async function tryAlert(
  alert: AlertFn,
  fn: () => Promise<void>,
  successMsg: string,
  actionLabel: string,
): Promise<void> {
  try {
    await fn();
    await alert(successMsg);
  } catch (e) {
    await alert(`Failed to ${actionLabel}:\n${errorMessage(e)}`, 'Error');
  }
}