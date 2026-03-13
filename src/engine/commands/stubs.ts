import type { CommandDefinition } from './types';
import manifestRaw from '../command-manifest.json?raw';

const STUB_MESSAGE = (name: string) =>
  `${name}: This utility is a logic stub in the v0.11 simulation.`;

const STUB_NOTE = 'Note: Full implementation for this utility is scheduled for the v0.12 Roadmap.';

function buildStubMan(name: string): string {
  const upper = name.toUpperCase();
  return `${upper}(1)                    User Commands                   ${upper}(1)

NAME
       ${name} - PocketTerm stub utility

SYNOPSIS
       ${name} [options] [arguments]

DESCRIPTION
       ${name} is currently provided as a lightweight compatibility stub in
       PocketTerm v0.11. It is command-registered for workflow parity and
       future high-fidelity replacement.

POCKETTERM NOTE
       ${STUB_NOTE}

SEE ALSO
       man(1), help(1)`;
}

function makeStub(name: string): CommandDefinition {
  return {
    name,
    async execute(_args, ctx) {
      ctx.out(STUB_MESSAGE(name));
    },
    man: buildStubMan(name),
  };
}

export const COMMAND_MANIFEST: string[] = (() => {
  try {
    const parsed = JSON.parse(manifestRaw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== 'string') continue;
      const name = item.trim().toLowerCase();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  } catch {
    return [];
  }
})();

export function buildManifestStubs(existingCommands: Set<string>): CommandDefinition[] {
  const missing = COMMAND_MANIFEST.filter((name) => !existingCommands.has(name));
  return missing.map((name) => makeStub(name));
}

