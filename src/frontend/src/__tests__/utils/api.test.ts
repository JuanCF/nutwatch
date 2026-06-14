import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from '../../api';

describe('api', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls fetch with path prefixed by /api', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ name: 'ups1' }),
    });
    const result = await api('/ups');
    expect(fetchMock).toHaveBeenCalledWith('/api/ups', expect.any(Object));
    expect(result).toEqual({ name: 'ups1' });
  });

  it('sends custom options', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: () => Promise.resolve('ok'),
    });
    const body = JSON.stringify({ name: 'test' });
    await api('/ups', { method: 'POST', body });
    expect(fetchMock).toHaveBeenCalledWith('/api/ups', expect.objectContaining({
      method: 'POST',
      body,
    }));
  });

  it('returns text when response is not JSON', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: () => Promise.resolve('plain text'),
    });
    const result = await api('/config/ups.conf');
    expect(result).toBe('plain text');
  });

  it('throws with response text when not ok', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      headers: { get: () => 'text/plain' },
      text: () => Promise.resolve('Bad Request'),
    });
    await expect(api('/ups')).rejects.toThrow('Bad Request');
  });

  it('retries on GET failure', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ name: 'ups1' }),
      });
    const result = await api('/ups');
    expect(result).toEqual({ name: 'ups1' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry on POST', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));
    await expect(api('/ups', { method: 'POST' })).rejects.toThrow('network error');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-throws AbortError immediately', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    fetchMock.mockRejectedValue(abortError);
    await expect(api('/ups')).rejects.toThrow('aborted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
