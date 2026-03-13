import { describe, expect, it, vi } from 'vitest';
import { commandRegistry } from './index';
import type { CommandContext } from './types';
import { miscCommands } from './misc';
import { COMMAND_MANIFEST } from './stubs';

function makeManCtx(): CommandContext {
  return {
    fs: {
      readFile: () => null,
    },
    sudo: false,
    user: 'guest',
    registry: commandRegistry,
    installedPackages: new Set(),
    out: vi.fn(),
    outputMode: 'pipe',
  } as unknown as CommandContext;
}

describe('parity audit contracts', () => {
  it('registers all essential Rocky-style commands in command registry', () => {
    for (const cmd of COMMAND_MANIFEST) {
      const def = commandRegistry.get(cmd);
      expect(def, `Missing essential command: ${cmd}`).toBeTruthy();
    }
  });

  it('expands command registry toward essential-100 coverage size', () => {
    expect(commandRegistry.size).toBeGreaterThanOrEqual(COMMAND_MANIFEST.length);
  });

  it('ensures essential commands expose man coverage', async () => {
    const manCmd = miscCommands.find((c) => c.name === 'man');
    expect(manCmd).toBeTruthy();

    for (const cmd of COMMAND_MANIFEST) {
      const ctx = makeManCtx();
      await manCmd!.execute([cmd], ctx);
      const lines = (ctx.out as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((call) => String(call[0]));
      const payload = lines.join('\n');
      expect(payload.includes('No manual entry for')).toBe(false);
      expect(payload.trim().length).toBeGreaterThan(0);
    }
  });
});

