import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from './types';
import { systemOpsCommands } from './systemOps';

function makeCtx(installed: string[] = []): CommandContext {
  return {
    registry: new Map(systemOpsCommands.map((c) => [c.name, c])),
    installedPackages: new Set(installed),
    out: vi.fn(),
    setExitCode: vi.fn(),
  } as unknown as CommandContext;
}

describe('system command resolution', () => {
  const whichCmd = systemOpsCommands.find((c) => c.name === 'which')!;
  const commandBuiltin = systemOpsCommands.find((c) => c.name === 'command')!;

  it('returns /usr/bin/git for which after package install', async () => {
    const ctx = makeCtx(['git']);
    ctx.registry.set('git', { name: 'git', requiresPackage: 'git', man: '', execute: async () => {} });

    await whichCmd.execute(['git'], ctx);

    expect(ctx.out).toHaveBeenCalledWith('/usr/bin/git');
  });

  it('returns non-zero for command -v when command is missing', async () => {
    const ctx = makeCtx();

    await commandBuiltin.execute(['-v', 'git'], ctx);

    expect(ctx.setExitCode).toHaveBeenCalledWith(1);
  });
});
