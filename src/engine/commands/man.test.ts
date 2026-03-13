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
});
