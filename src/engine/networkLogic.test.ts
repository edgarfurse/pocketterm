import { describe, expect, it, vi } from 'vitest';
import { NetworkLogic } from './networkLogic';

describe('network logic proxy fidelity', () => {
  it('increments /proc/net/dev counters when transfers are recorded', () => {
    const net = new NetworkLogic();
    const before = net.formatProcNetDev();
    net.recordTransfer(500, 1200);
    const after = net.formatProcNetDev();

    expect(after).not.toBe(before);
    expect(after).toContain('eth0');
  });

  it('hydrates address from public-ip probe with safe fallback', async () => {
    const net = new NetworkLogic();
    const initialIp = net.getSourceIP();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ ip: '203.0.113.42' }),
    })));

    const changed = await net.hydrateAddressFromPublicIp(2000);
    expect(changed).toBe(true);
    expect(net.getSourceIP()).not.toBe(initialIp);
    expect(net.getSourceIP()).toMatch(/^192\.168\.1\.\d+$/);
  });
});

