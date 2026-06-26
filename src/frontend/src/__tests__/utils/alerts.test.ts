import { describe, it, expect, vi } from 'vitest';
import { tryAlert } from '../../utils/alerts';

describe('tryAlert', () => {
  it('calls fn then alert with successMsg when fn resolves', async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockResolvedValue(undefined);

    await tryAlert(alert, fn, 'Saved successfully.', 'save');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Saved successfully.');
  });

  it('calls alert with error message when fn rejects', async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(new Error('network error'));

    await tryAlert(alert, fn, 'Saved.', 'save item');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('Failed to save item:\nnetwork error', 'Error');
  });

  it('uses the error message from the thrown Error', async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue(new Error('something broke'));

    await tryAlert(alert, fn, 'Done.', 'delete');

    expect(alert).toHaveBeenCalledWith('Failed to delete:\nsomething broke', 'Error');
  });

  it('handles non-Error rejections', async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValue('string error');

    await tryAlert(alert, fn, 'Done.', 'process');

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toContain('Failed to process:');
    expect(alert.mock.calls[0][1]).toBe('Error');
  });

  it('does not call alert on success if fn does', async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockImplementation(async () => {
      await alert('custom');
    });

    await tryAlert(alert, fn, 'Saved.', 'save');

    expect(alert).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenNthCalledWith(1, 'custom');
    expect(alert).toHaveBeenNthCalledWith(2, 'Saved.');
  });
});
