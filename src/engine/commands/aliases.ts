export type AliasEntry = { cmd: string; prependArgs: string[] };

export const DEFAULT_ALIASES: Record<string, AliasEntry> = {
  ll: { cmd: 'ls', prependArgs: ['-la'] },
  la: { cmd: 'ls', prependArgs: ['-al'] },
  '.': { cmd: 'source', prependArgs: [] },
  pt: { cmd: 'pocketterm', prependArgs: [] },
};

export function cloneDefaultAliases(): Record<string, AliasEntry> {
  const out: Record<string, AliasEntry> = {};
  for (const [name, entry] of Object.entries(DEFAULT_ALIASES)) {
    out[name] = { cmd: entry.cmd, prependArgs: [...entry.prependArgs] };
  }
  return out;
}
