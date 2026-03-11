import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandContext } from './types';
import { networkingCommands } from './networking';

function makeCurlCtx(overrides: Partial<CommandContext> = {}): {
  ctx: CommandContext;
  outLines: string[];
  getExitCode: () => number | null;
  fsWrites: Array<{ path: string; content: string }>;
} {
  const outLines: string[] = [];
  let exitCode: number | null = null;
  const fsWrites: Array<{ path: string; content: string }> = [];

  const ctx: CommandContext = {
    fs: {
      resolvePath: (_cwd: string, p: string) => p,
      writeFile: (path: string, content: string) => {
        fsWrites.push({ path, content });
        return true;
      },
    },
    cwd: '/home/guest',
    user: 'guest',
    sudo: false,
    out: (s: string) => outLines.push(s),
    setExitCode: (n: number) => { exitCode = n; },
    ...overrides,
  } as unknown as CommandContext;

  return { ctx, outLines, getExitCode: () => exitCode, fsWrites };
}

describe('curl command fidelity', () => {
  const curl = networkingCommands.find((c) => c.name === 'curl')!;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses exit code 2 on bad -o usage', async () => {
    const h = makeCurlCtx();
    await curl.execute(['-o'], h.ctx);
    expect(h.getExitCode()).toBe(2);
    expect(h.outLines.join('\n')).toContain('requires parameter');
  });

  it('normalizes bare host urls and writes body with -o', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'hello-world',
      headers: new Headers(),
    })));

    const h = makeCurlCtx();
    await curl.execute(['-s', '-o', '/tmp/out.txt', 'example.com'], h.ctx);
    expect(h.getExitCode()).toBeNull();
    expect(h.fsWrites.length).toBe(1);
    expect(h.fsWrites[0].path).toBe('/tmp/out.txt');
    expect(h.fsWrites[0].content).toBe('hello-world');
  });

  it('returns curl(22) and exit code 22 on http error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => '',
      headers: new Headers(),
    })));

    const h = makeCurlCtx();
    await curl.execute(['https://example.com/missing'], h.ctx);
    expect(h.getExitCode()).toBe(22);
    expect(h.outLines.join('\n')).toContain('curl: (22)');
  });

  it('prints response body to stdout for simple GET', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => 'zen-message',
      headers: new Headers(),
    })));

    const h = makeCurlCtx();
    await curl.execute(['-s', 'https://api.github.com/zen'], h.ctx);
    expect(h.getExitCode()).toBeNull();
    expect(h.outLines.join('\n')).toContain('zen-message');
  });

  it('maps failed fetch to curl(7) connect error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    const h = makeCurlCtx();
    await curl.execute(['https://offline.example'], h.ctx);
    expect(h.getExitCode()).toBe(7);
    expect(h.outLines.join('\n')).toContain('curl: (7) Failed to connect to offline.example');
  });
});
