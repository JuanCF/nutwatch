type AlertFn = (msg: string, title?: string) => Promise<void>;

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
    await alert(`Failed to ${actionLabel}:\n${(e as Error).message}`, 'Error');
  }
}