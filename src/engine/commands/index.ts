import type { CommandDefinition } from './types';
import { fileOpsCommands } from './fileOps';
import { textOpsCommands } from './textOps';
import { systemOpsCommands } from './systemOps';
import { permissionsCommands } from './permissions';
import { networkingCommands } from './networking';
import { packageMgmtCommands } from './packageMgmt';
import { miscCommands } from './misc';
import { lockedCommands } from './lockedCmds';
import { sysAdminCommands } from './sysAdmin';
import { DEFAULT_ALIASES, cloneDefaultAliases } from './aliases';

export type { CommandDefinition, CommandContext, SSHSession, ProcessInfo } from './types';
export { sleep } from './types';

const allCommands: CommandDefinition[] = [
  ...fileOpsCommands,
  ...textOpsCommands,
  ...systemOpsCommands,
  ...permissionsCommands,
  ...networkingCommands,
  ...packageMgmtCommands,
  ...miscCommands,
  ...lockedCommands,
  ...sysAdminCommands,
];

export const commandRegistry = new Map<string, CommandDefinition>();
for (const cmd of allCommands) {
  commandRegistry.set(cmd.name, cmd);
}

export { DEFAULT_ALIASES, cloneDefaultAliases };
