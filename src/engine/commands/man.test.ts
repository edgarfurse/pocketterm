import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from './types';
import { miscCommands } from './misc';

function makeCtx(): CommandContext {
  const readFile = vi.fn(() => null);
  return {
    fs: {
      readFile,
    },
    sudo: false,
    registry: new Map(),
    installedPackages: new Set(),
    out: vi.fn(),
    outputMode: 'terminal',
  } as unknown as CommandContext;
}

describe('man command', () => {
  const manCmd = miscCommands.find((c) => c.name === 'man')!;

  it('supports section-prefixed lookups like man 1 bash', async () => {
    const ctx = makeCtx();

    await manCmd.execute(['1', 'bash'], ctx);

    expect(ctx.out).toHaveBeenCalledWith(expect.stringContaining('BASH(1)'));
  });

  it('prefers pages stored under /usr/share/man/man1', async () => {
    const ctx = makeCtx();
    (ctx.fs.readFile as unknown as { mockImplementation: (fn: (path: string) => string | null) => void }).mockImplementation((path: string) => {
      if (path === '/usr/share/man/man1/pocketterm.1') return 'POCKETTERM(1)\nNAME\n';
      return null;
    });

    await manCmd.execute(['pocketterm'], ctx);

    expect(ctx.out).toHaveBeenCalledWith(expect.stringContaining('POCKETTERM(1)'));
  });

  it('shows builtin man text even when command package is not installed', async () => {
    const ctx = makeCtx();
    ctx.registry.set('vi', {
      name: 'vi',
      requiresPackage: 'vim',
      execute: async () => {},
      man: 'VI(1)\nNAME\n       vi - visual editor\n',
    });

    await manCmd.execute(['vi'], ctx);

    expect(ctx.out).toHaveBeenCalledWith(expect.stringContaining('VI(1)'));
  });

  it('prefers external man library over command-local man text', async () => {
    const ctx = makeCtx();
    ctx.registry.set('bash', {
      name: 'bash',
      execute: async () => {},
      man: 'CUSTOM-BASH(1)\nNAME\n',
    });

    await manCmd.execute(['bash'], ctx);

    expect(ctx.out).toHaveBeenCalledWith(expect.stringContaining('BASH(1)'));
    expect(ctx.out).not.toHaveBeenCalledWith(expect.stringContaining('CUSTOM-BASH(1)'));
  });

  it('renders CHEATSHEET sections in yellow in terminal mode', async () => {
    const ctx = makeCtx();
    const viDef = miscCommands.find((c) => c.name === 'vi')!;
    ctx.registry.set('vi', viDef);

    await manCmd.execute(['vi'], ctx);

    const calls = (ctx.out as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => String(c[0]));
    expect(calls.some((line) => line.includes('\u001b[33mCHEATSHEET\u001b[0m'))).toBe(true);
  });

  it('suppresses ansi in pipe mode man output', async () => {
    const ctx = makeCtx();
    const viDef = miscCommands.find((c) => c.name === 'vi')!;
    ctx.registry.set('vi', viDef);
    ctx.outputMode = 'pipe';

    await manCmd.execute(['vi'], ctx);

    const calls = (ctx.out as unknown as { mock: { calls: unknown[][] } }).mock.calls
      .map((c) => String(c[0]));
    expect(calls.some((line) => line.includes('\u001b['))).toBe(false);
  });

  it('includes external man page for lynx', async () => {
    const ctx = makeCtx();

    await manCmd.execute(['lynx'], ctx);

    expect(ctx.out).toHaveBeenCalledWith(expect.stringContaining('LYNX(1)'));
  });

  it('routes terminal man output through less pager when available', async () => {
    const ctx = makeCtx();
    const lessExecute = vi.fn(async () => {});
    ctx.registry.set('less', { name: 'less', execute: lessExecute, man: '' });
    ctx.outputMode = 'terminal';

    await manCmd.execute(['bash'], ctx);

    expect(lessExecute).toHaveBeenCalled();
  });

  it('does not use pager in pipe mode', async () => {
    const ctx = makeCtx();
    const lessExecute = vi.fn(async () => {});
    ctx.registry.set('less', { name: 'less', execute: lessExecute, man: '' });
    ctx.outputMode = 'pipe';

    await manCmd.execute(['bash'], ctx);

    expect(lessExecute).not.toHaveBeenCalled();
  });
});
