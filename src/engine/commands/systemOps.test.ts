import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from './types';
import { systemOpsCommands } from './systemOps';
import { cloneDefaultAliases } from './aliases';

function makeCtx(installed: string[] = []): CommandContext {
  const aliases = cloneDefaultAliases();
  return {
    registry: new Map(systemOpsCommands.map((c) => [c.name, c])),
    installedPackages: new Set(installed),
    out: vi.fn(),
    setExitCode: vi.fn(),
    getAliases: () => {
      const out: Record<string, { cmd: string; prependArgs: string[] }> = {};
      for (const [k, v] of Object.entries(aliases)) {
        out[k] = { cmd: v.cmd, prependArgs: [...v.prependArgs] };
      }
      return out;
    },
    setAlias: (name: string, value: { cmd: string; prependArgs: string[] }) => {
      aliases[name] = { cmd: value.cmd, prependArgs: [...value.prependArgs] };
    },
    removeAlias: (name: string) => {
      if (!(name in aliases)) return false;
      delete aliases[name];
      return true;
    },
  } as unknown as CommandContext;
}

describe('system command resolution', () => {
  const whichCmd = systemOpsCommands.find((c) => c.name === 'which')!;
  const commandBuiltin = systemOpsCommands.find((c) => c.name === 'command')!;
  const typeBuiltin = systemOpsCommands.find((c) => c.name === 'type')!;
  const hostnamectlCmd = systemOpsCommands.find((c) => c.name === 'hostnamectl')!;

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

  it('includes rocky identity in hostnamectl output', async () => {
    const ctx = makeCtx();
    ctx.hostname = 'pocket-term';

    await hostnamectlCmd.execute([], ctx);

    expect(ctx.out).toHaveBeenCalledWith(expect.stringContaining('Static hostname: pocket-term'));
    expect(ctx.out).toHaveBeenCalledWith(expect.stringContaining('Rocky Linux 9.4'));
  });

  it('keeps alias resolution consistent across type/which/command -v', async () => {
    const ctx = makeCtx();
    ctx.registry.set('ls', { name: 'ls', man: '', execute: async () => {} });

    await typeBuiltin.execute(['ll'], ctx);
    await whichCmd.execute(['ll'], ctx);
    await commandBuiltin.execute(['-v', 'll'], ctx);

    expect(ctx.out).toHaveBeenCalledWith("ll is aliased to 'ls -la'");
    expect(ctx.out).toHaveBeenCalledWith('/usr/bin/ls');
  });
});
