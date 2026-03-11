import { describe, expect, it, vi } from 'vitest';
import type { CommandContext } from './types';
import { miscCommands } from './misc';

function makeEditorCtx(): { ctx: CommandContext; calls: { nano: number; vim: number } } {
  const calls = {
    nano: 0,
    vim: 0,
  };
  const ctx: CommandContext = {
    fs: {
      resolvePath: (_cwd: string, p: string) => p,
      getNode: () => null,
      readFile: () => '',
      writeFile: () => true,
    },
    cwd: '/home/guest',
    user: 'guest',
    sudo: false,
    out: vi.fn(),
    setExitCode: vi.fn(),
    onOpenEditor: async () => {
      calls.nano++;
      return 'nano-save';
    },
    onOpenVimEditor: async () => {
      calls.vim++;
      return 'vim-save';
    },
  } as unknown as CommandContext;
  return { ctx, calls };
}

describe('editor command routing', () => {
  const nano = miscCommands.find((c) => c.name === 'nano')!;
  const vim = miscCommands.find((c) => c.name === 'vim')!;
  const viCmd = miscCommands.find((c) => c.name === 'vi')!;

  it('routes nano to onOpenEditor', async () => {
    const h = makeEditorCtx();
    await nano.execute(['/tmp/a.txt'], h.ctx);
    expect(h.calls.nano).toBe(1);
    expect(h.calls.vim).toBe(0);
  });

  it('routes vim and vi to onOpenVimEditor', async () => {
    const h = makeEditorCtx();
    await vim.execute(['/tmp/b.txt'], h.ctx);
    await viCmd.execute(['/tmp/c.txt'], h.ctx);
    expect(h.calls.vim).toBe(2);
    expect(h.calls.nano).toBe(0);
  });
});

describe('help onboarding hook', () => {
  const helpCmd = miscCommands.find((c) => c.name === 'help')!;

  it('prints pocketterm documentation guidance', async () => {
    const out = vi.fn();
    const stubCommand = { name: 'stub', execute: async () => {}, man: '' };
    const ctx = {
      registry: new Map([['help', helpCmd], ['man', stubCommand], ['pocketterm', stubCommand]]),
      out,
    } as unknown as CommandContext;

    await helpCmd.execute([], ctx);

    expect(out).toHaveBeenCalledWith("Use 'man pocketterm' for system documentation or run 'pocketterm' to launch the interactive environment manager.");
  });
});
