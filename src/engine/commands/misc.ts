import type { CommandDefinition } from './types';
import { sleep } from './types';
import { FileSystem } from '../fileSystem';
import { DEFAULT_TUTORIALS, type TutorialCartridge } from '../tutorials';
import { exportSystemState, importSystemState } from '../storage';
import { getManPage } from '../manPages';
import externalManPagesRaw from '../man-pages.json?raw';

const EXTERNAL_MAN_PAGES: Record<string, string> = (() => {
  try {
    const parsed = JSON.parse(externalManPagesRaw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) {
        out[key.toLowerCase()] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
})();

function renderManPage(page: string, ctx: Parameters<CommandDefinition['execute']>[1]): void {
  const colorize = ctx.outputMode !== 'pipe';
  const yellowSections = new Set(['POCKETTERM NOTE', 'POCKETTERM NOTES', 'CHEATSHEET', 'EXTRA']);
  const isHeader = (line: string) => /^[A-Z][A-Z0-9 ()/-]*$/.test(line.trim());

  let inYellowSection = false;
  for (const line of page.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && isHeader(trimmed)) {
      inYellowSection = yellowSections.has(trimmed);
    }
    if (colorize && inYellowSection && trimmed.length > 0) {
      ctx.out(`\u001b[33m${line}\u001b[0m`);
    } else {
      ctx.out(line);
    }
  }
}

function splitAliasValue(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  const pushCurrent = () => {
    if (current.length > 0) {
      tokens.push(current);
      current = '';
    }
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (inSingle) {
      if (ch === '\'') inSingle = false;
      else current += ch;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      else current += ch;
      continue;
    }
    if (ch === '\'') {
      inSingle = true;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      continue;
    }
    if (/\s/.test(ch)) {
      pushCurrent();
      continue;
    }
    current += ch;
  }
  pushCurrent();
  return tokens;
}

const POCKETTERM_MAN_PAGE = `POCKETTERM(1)                User Commands                POCKETTERM(1)

NAME
       pocketterm - The PocketTerm Environment Manager

SYNOPSIS
       pocketterm

DESCRIPTION
       pocketterm is the primary control utility for the PocketTerm runtime.
       It manages a virtualized execution environment that provides a persistent
       Filesystem Hierarchy Standard (FHS) layout and an AST-based command
       interpreter for interactive shell operations.

INTERACTIVE MODE
       Invoking pocketterm launches a text user interface (TUI) used for
       environment control tasks. The interface provides diagnostic review
       surfaces and onboarding workflows for new users entering the shell.

PERSISTENCE
       File modifications and package state maintained through dnf are committed
       to non-volatile local storage. Persisted state remains available across
       power cycles initiated through reboot.

ENVIRONMENT
       Default user context initializes at /home/guest. Command resolution
       follows the standard executable search path rooted at /usr/bin.

SEE ALSO
       man(1), dnf(8), reboot(8), bash(1)`;

const man: CommandDefinition = {
  name: 'man',
  async execute(args, ctx) {
    if (args.length === 0) { ctx.out('What manual page do you want?'); return; }

    let topicArg = args[0] ?? '';
    if (/^\d+$/.test(topicArg)) {
      topicArg = args[1] ?? '';
    }
    const topic = topicArg.toLowerCase();
    if (!topic) { ctx.out('What manual page do you want?'); return; }

    const fsManPath = `/usr/share/man/man1/${topic}.1`;
    const fsManPage = ctx.fs.readFile(fsManPath, ctx.sudo ? 'root' : ctx.user) ?? ctx.fs.readFile(fsManPath, 'root');
    if (fsManPage !== null) {
      renderManPage(fsManPage, ctx);
      return;
    }

    const externalPage = EXTERNAL_MAN_PAGES[topic];
    if (externalPage) {
      renderManPage(externalPage, ctx);
      return;
    }

    const cmd = ctx.registry.get(topic);
    if (cmd && cmd.man) {
      renderManPage(cmd.man, ctx);
      return;
    }

    const fallbackPage = getManPage(topic);
    if (fallbackPage) {
      renderManPage(fallbackPage, ctx);
      return;
    }

    ctx.out(`No manual entry for ${topicArg}`);
  },
  man: `MAN(1)                   Manual pager utils              MAN(1)

NAME
       man - an interface to the system reference manuals

SYNOPSIS
       man [COMMAND]

DESCRIPTION
       man displays manual pages - the built-in documentation for commands
       and system interfaces. When learning a new command, read its man page
       first.

       Manual sections:
         1    User commands (ls, cat, echo)
         5    File formats (/etc/passwd)
         8    System administration (dnf, ip)

EXAMPLES
       man ls            Read about the ls command.
       man man           Display this manual page.

SEE ALSO
       apropos(1), whatis(1)`,
};

const help: CommandDefinition = {
  name: 'help',
  async execute(_args, ctx) {
    const names = Array.from(ctx.registry.keys()).sort();
    ctx.out('PocketTerm - Simulated Rocky Linux 9 Terminal');
    ctx.out('');
    ctx.out(`Available commands (${names.length}):`);
    const cols = 6;
    const width = 12;
    for (let i = 0; i < names.length; i += cols) {
      const row = names.slice(i, i + cols).map((n) => n.padEnd(width)).join('');
      ctx.out('  ' + row);
    }
    ctx.out('');
    ctx.out('Aliases: ll (ls -l), la (ls -la), . (source)');
    ctx.out('Shortcuts: Ctrl+C (kill), Ctrl+L (clear), Ctrl+A/E (line nav), Ctrl+Z (stop)');
    ctx.out("Use 'man pocketterm' for system documentation or run 'pocketterm' to launch the interactive environment manager.");
  },
  man: `HELP(1)                  Builtin Commands                HELP(1)

NAME
       help - display information about available commands

SYNOPSIS
       help

DESCRIPTION
       List all available commands in this shell, along with aliases and
       keyboard shortcuts. Use man <command> for detailed information.

SEE ALSO
       man(1)`,
};

const healthcheck: CommandDefinition = {
  name: 'healthcheck',
  async execute(_args, ctx) {
    const activeServices = Array.from(ctx.services.entries())
      .filter(([, state]) => state === 'active')
      .map(([name]) => name);
    const tutorial = ctx.getTutorialMode();
    const hw = ctx.getHardwareState();
    const attachedDisks = Object.values(hw.devices)
      .filter((d) => d.attached)
      .map((d) => `${d.name}(${d.size})`);

    ctx.out('PocketTerm Health Check');
    ctx.out('-----------------------');
    ctx.out(`User: ${ctx.user}`);
    ctx.out(`Host: ${ctx.hostname}`);
    ctx.out(`CWD:  ${ctx.cwd}`);
    ctx.out(`Exit code: ${ctx.lastExitCode}`);
    ctx.out(`Installed packages: ${ctx.installedPackages.size}`);
    ctx.out(`Active services (${activeServices.length}): ${activeServices.join(', ') || 'none'}`);
    ctx.out(`Journal entries: ${ctx.getJournalEntries().length}`);
    ctx.out(`Attached disks: ${attachedDisks.join(', ') || 'none'}`);
    ctx.out(`Tutorial cartridge: ${tutorial ? `${tutorial.id} (${tutorial.title})` : 'none'}`);
  },
  man: `HEALTHCHECK(1)               User Commands               HEALTHCHECK(1)

NAME
       healthcheck - print PocketTerm runtime health summary

SYNOPSIS
       healthcheck

DESCRIPTION
       Prints a compact runtime diagnostic report: user, cwd, service state,
       journal size, attached virtual disks, and active tutorial cartridge.

EXAMPLES
       healthcheck

SEE ALSO
       systemctl(1), journalctl(1), lsblk(8)`,
};

const nano: CommandDefinition = {
  name: 'nano',
  requiresPackage: 'nano',
  async execute(args, ctx) {
    const filePath = args[0];
    if (!filePath) { ctx.out('nano: missing filename'); ctx.setExitCode(1); return; }
    const resolved = ctx.fs.resolvePath(ctx.cwd, filePath);
    const node = ctx.fs.getNode(resolved);
    if (node && node.type === 'directory') {
      ctx.out(`nano: ${filePath}: Is a directory`);
      ctx.setExitCode(1);
      return;
    }
    const effectiveUser = ctx.sudo ? 'root' : ctx.user;
    let existingContent = '';
    if (node) {
      const content = ctx.fs.readFile(resolved, effectiveUser);
      if (content === null) { ctx.out(`nano: ${filePath}: Permission denied`); ctx.setExitCode(1); return; }
      existingContent = content;
    }
    const edited = await ctx.onOpenEditor(resolved, existingContent);
    if (edited !== null) {
      const ok = ctx.fs.writeFile(resolved, edited, ctx.user, ctx.sudo);
      if (!ok) { ctx.out(`Could not write to ${filePath}: Permission denied`); ctx.setExitCode(1); }
    }
  },
  man: `NANO(1)                  General Commands Manual         NANO(1)

NAME
       nano - small and friendly text editor

SYNOPSIS
       nano [file]

DESCRIPTION
       nano is a beginner-friendly terminal text editor. In this simulation,
       it opens an in-browser editor for the given file.

       This command requires installation: dnf install nano

KEY BINDINGS
       ^O     Save file.        ^X     Exit nano.
       ^K     Cut line.         ^U     Paste line.
       ^W     Search.           ^G     Help.

EXAMPLES
       nano myfile.txt         Open or create myfile.txt.
       nano /etc/hosts         Edit hosts file (may need sudo).

SEE ALSO
       vim(1), vi(1)`,
};

const vim: CommandDefinition = {
  name: 'vim',
  requiresPackage: 'vim',
  async execute(args, ctx) {
    const filePath = args[0];
    if (!filePath) { ctx.out('vim: missing filename'); ctx.setExitCode(1); return; }
    const resolved = ctx.fs.resolvePath(ctx.cwd, filePath);
    const node = ctx.fs.getNode(resolved);
    if (node && node.type === 'directory') {
      ctx.out(`vim: ${filePath}: Is a directory`);
      ctx.setExitCode(1);
      return;
    }
    const effectiveUser = ctx.sudo ? 'root' : ctx.user;
    let existingContent = '';
    if (node) {
      const content = ctx.fs.readFile(resolved, effectiveUser);
      if (content === null) { ctx.out(`vim: ${filePath}: Permission denied`); ctx.setExitCode(1); return; }
      existingContent = content;
    }
    const edited = await ctx.onOpenVimEditor(resolved, existingContent);
    if (edited !== null) {
      const ok = ctx.fs.writeFile(resolved, edited, ctx.user, ctx.sudo);
      if (!ok) { ctx.out(`Could not write to ${filePath}: Permission denied`); ctx.setExitCode(1); }
    }
  },
  man: `VIM(1)                   General Commands Manual         VIM(1)

NAME
       vim - Vi IMproved, a programmer's text editor

SYNOPSIS
       vim [file]

DESCRIPTION
       Vim is a highly configurable text editor built to make creating and
       changing any kind of text very efficient. It is included as "vi" on
       most UNIX systems. In this simulation, vim opens the in-browser
       editor.

       This command requires installation: dnf install vim

MODES
       Normal     Navigate and issue commands (default on launch).
       Insert     Type text (press i to enter, Esc to leave).
       Command    Execute commands (press : from Normal mode).
                  :w = save, :q = quit, :wq = save and quit.

EXAMPLES
       vim myfile.txt         Open or create myfile.txt.
       vim /etc/hosts         Edit hosts file (may need sudo).

SEE ALSO
       nano(1), vi(1)`,
};

const vi: CommandDefinition = {
  name: 'vi',
  async execute(args, ctx) {
    const filePath = args[0];
    if (!filePath) { ctx.out('vi: missing filename'); ctx.setExitCode(1); return; }
    const resolved = ctx.fs.resolvePath(ctx.cwd, filePath);
    const node = ctx.fs.getNode(resolved);
    if (node && node.type === 'directory') {
      ctx.out(`vi: ${filePath}: Is a directory`);
      ctx.setExitCode(1);
      return;
    }
    const effectiveUser = ctx.sudo ? 'root' : ctx.user;
    let existingContent = '';
    if (node) {
      const content = ctx.fs.readFile(resolved, effectiveUser);
      if (content === null) { ctx.out(`vi: ${filePath}: Permission denied`); ctx.setExitCode(1); return; }
      existingContent = content;
    }
    const edited = await ctx.onOpenVimEditor(resolved, existingContent);
    if (edited !== null) {
      const ok = ctx.fs.writeFile(resolved, edited, ctx.user, ctx.sudo);
      if (!ok) { ctx.out(`Could not write to ${filePath}: Permission denied`); ctx.setExitCode(1); }
    }
  },
  man: `VI(1)                    General Commands Manual           VI(1)

NAME
       vi - screen-oriented text editor

SYNOPSIS
       vi [file]

DESCRIPTION
       vi is the classic UNIX text editor. On Rocky Linux, vi is provided
       by the vim-minimal package (always available), but the full vim
       experience (syntax highlighting, plugins) requires the full vim package.

       PocketTerm ships vi as an always-available essentials editor.

CHEATSHEET
       i      Enter Insert mode
       Esc    Return to Command mode
       :w     Save file
       :q     Quit (fails on unsaved changes)
       :wq    Save and quit

EXAMPLES
       vi myfile.txt          Open or create myfile.txt.

SEE ALSO
       vim(1), nano(1)`,
};

const ssh: CommandDefinition = {
  name: 'ssh',
  requiresPackage: 'openssh-clients',
  async execute(args, ctx) {
    const target = args[0];
    if (!target) {
      ctx.out('usage: ssh [-p port] [user@]hostname');
      return;
    }
    const host = target.includes('@') ? target.split('@')[1] : target;
    const remoteUser = target.includes('@') ? target.split('@')[0] : 'guest';

    if (ctx.sshSession) {
      ctx.out('ssh: Already connected to a remote host. Type "exit" to disconnect first.');
      return;
    }

    const localhostTargets = new Set<string>([
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      ctx.hostname.toLowerCase(),
    ]);

    if (localhostTargets.has(host.toLowerCase())) {
      ctx.out(`ssh: connect to host ${host} port 22: Connecting...`);
      await sleep(500);
      await ctx.promptPassword(`${remoteUser}@${host}'s password: `);
      ctx.out(`Last login: Thu Feb 26 14:32:01 2026 on pts/0`);
      return;
    }

    // Only allow connecting to the known mock remote server
    if (host !== '10.0.0.50' && host !== 'server01') {
      ctx.out(`ssh: connect to host ${host} port 22: Connecting...`);
      await sleep(1500);
      ctx.out(`ssh: connect to host ${host} port 22: Connection refused`);
      return;
    }

    ctx.out(`ssh: connect to host ${host} port 22: Connecting...`);
    await sleep(800);

    // Prompt for password
    await ctx.promptPassword(`${remoteUser}@${host}'s password: `);
    await sleep(400);

    ctx.out(`Last login: Thu Feb 26 14:32:01 2026 from 192.168.1.100`);
    ctx.sshConnect(host, remoteUser);
  },
  man: `SSH(1)                       User Commands                      SSH(1)

NAME
       ssh - OpenSSH remote login client

SYNOPSIS
       ssh [-p port] [user@]hostname

DESCRIPTION
       ssh (Secure Shell) is a program for logging into a remote machine
       and executing commands. It provides encrypted communication between
       two untrusted hosts over an insecure network.

       Known hosts in this simulation:
         10.0.0.50 / server01   Remote server with admin user

       This command requires installation: dnf install openssh-clients

OPTIONS
       -p port    Port to connect to on the remote host (default 22).

EXAMPLES
       ssh admin@10.0.0.50         Connect as admin to remote server.
       ssh admin@server01          Same as above (by hostname).

SEE ALSO
       scp(1), sftp(1), sshd(8)`,
};

const scp: CommandDefinition = {
  name: 'scp',
  requiresPackage: 'openssh-clients',
  async execute(args, ctx) {
    if (args.length < 2) {
      ctx.out('usage: scp source [user@]host:destination');
      return;
    }

    const src = args[0];
    const dest = args[1];

    // Detect direction: local->remote or remote->local
    const remotePattern = /^([^@]+)@([^:]+):(.+)$/;

    const destMatch = dest.match(remotePattern);
    const srcMatch = src.match(remotePattern);

    if (destMatch) {
      // local -> remote: scp file.txt admin@10.0.0.50:/home/admin/
      const [, remoteUser, remoteHost, remotePath] = destMatch;

      if (remoteHost !== '10.0.0.50' && remoteHost !== 'server01') {
        ctx.out(`scp: connect to host ${remoteHost}: Connection refused`);
        return;
      }

      const resolvedSrc = ctx.fs.resolvePath(ctx.cwd, src);
      const content = ctx.fs.readFile(resolvedSrc, ctx.sudo ? 'root' : ctx.user);
      if (content === null) {
        ctx.out(`scp: ${src}: No such file or directory`);
        return;
      }

      const remoteFs = FileSystem.createRemoteVFS(remoteUser);

      let targetPath = remotePath;
      const targetNode = remoteFs.getNode(targetPath);
      if (targetNode && targetNode.type === 'directory') {
        const filename = resolvedSrc.split('/').pop() ?? src;
        targetPath = targetPath.endsWith('/') ? targetPath + filename : targetPath + '/' + filename;
      }

      ctx.out(`Connecting to ${remoteHost}...`);
      await sleep(600);

      remoteFs.writeFile(targetPath, content, remoteUser, true);

      const filename = resolvedSrc.split('/').pop() ?? src;
      ctx.out(`${filename}                              100%  ${content.length}B   0.0KB/s   00:00`);
    } else if (srcMatch) {
      // remote -> local: scp admin@10.0.0.50:/home/admin/file.txt ./
      const [, remoteUser, remoteHost, remotePath] = srcMatch;

      if (remoteHost !== '10.0.0.50' && remoteHost !== 'server01') {
        ctx.out(`scp: connect to host ${remoteHost}: Connection refused`);
        return;
      }

      const remoteFs = FileSystem.createRemoteVFS(remoteUser);
      const content = remoteFs.readFile(remotePath, remoteUser);
      if (content === null) {
        ctx.out(`scp: ${remotePath}: No such file or directory`);
        return;
      }

      let targetPath = ctx.fs.resolvePath(ctx.cwd, dest);
      const targetNode = ctx.fs.getNode(targetPath);
      if (targetNode && targetNode.type === 'directory') {
        const filename = remotePath.split('/').pop() ?? 'file';
        targetPath = targetPath.endsWith('/') ? targetPath + filename : targetPath + '/' + filename;
      }

      ctx.out(`Connecting to ${remoteHost}...`);
      await sleep(600);

      const ok = ctx.fs.writeFile(targetPath, content, ctx.sudo ? 'root' : ctx.user, ctx.sudo);
      if (!ok) {
        ctx.out(`scp: ${dest}: Permission denied`);
        return;
      }

      const filename = remotePath.split('/').pop() ?? 'file';
      ctx.out(`${filename}                              100%  ${content.length}B   0.0KB/s   00:00`);
    } else {
      ctx.out('usage: scp source [user@]host:destination');
      ctx.out('       scp [user@]host:source destination');
    }
  },
  man: `SCP(1)                       User Commands                      SCP(1)

NAME
       scp - OpenSSH secure file copy

SYNOPSIS
       scp source [user@]host:destination
       scp [user@]host:source destination

DESCRIPTION
       scp copies files between hosts on a network. It uses SSH for data
       transfer and provides the same authentication and security as SSH.

       This command requires installation: dnf install openssh-clients

       Known hosts in this simulation:
         10.0.0.50 / server01   Remote server with admin user

EXAMPLES
       scp file.txt admin@10.0.0.50:/home/admin/
           Copy local file to remote server.

       scp admin@10.0.0.50:/home/admin/deploy.sh ./
           Copy remote file to current local directory.

SEE ALSO
       ssh(1), sftp(1), rsync(1)`,
};

const sudo_cmd: CommandDefinition = {
  name: 'sudo',
  async execute(_args, ctx) {
    ctx.out('sudo: already handled by the shell parser');
  },
  man: `SUDO(8)                  System Manager's Manual        SUDO(8)

NAME
       sudo - execute a command as another user

SYNOPSIS
       sudo command [args]

DESCRIPTION
       sudo allows a permitted user to execute a command as the superuser
       (root) or another user. You will be prompted for your password.

       In this simulation, any password is accepted.

EXAMPLES
       sudo dnf install nginx     Install nginx as root.
       sudo cat /etc/shadow       Read a restricted file.
       sudo nano /etc/hosts       Edit a system file.

SEE ALSO
       su(1), visudo(8)`,
};

const su: CommandDefinition = {
  name: 'su',
  async execute(args, ctx) {
    const target = args[0] === '-' ? (args[1] ?? 'root') : (args[0] ?? 'root');

    if (ctx.user === target) {
      return;
    }

    // Validate user exists in /etc/passwd (root always exists)
    if (target !== 'root') {
      const passwdContent = ctx.fs.readFile('/etc/passwd', 'root') ?? '';
      const exists = passwdContent.split('\n').some(line => line.split(':')[0] === target);
      if (!exists) {
        ctx.out(`su: user '${target}' does not exist`);
        return;
      }
    }

    if (ctx.user !== 'root') {
      await ctx.promptPassword('Password: ');
    }

    ctx.setUser(target);
    ctx.fs.setCurrentUser(target);
    if (target === 'root') {
      ctx.setCwd('/root');
    } else {
      const homeDir = `/home/${target}`;
      const node = ctx.fs.getNode(homeDir);
      if (node && node.type === 'directory') {
        ctx.setCwd(homeDir);
      }
    }
  },
  man: `SU(1)                        User Commands                       SU(1)

NAME
       su - run a command with substitute user identity

SYNOPSIS
       su [-] [user]

DESCRIPTION
       Change the effective user ID. With no user specified or with "root",
       switch to the root account. The "-" option provides a login shell
       with root's environment.

       The target user must exist in /etc/passwd (use useradd to create
       new users). You will be prompted for a password (any password is
       accepted in this simulation).

EXAMPLES
       su -              Switch to root with a login shell.
       su root           Switch to root.
       su alice          Switch to user alice.

SEE ALSO
       sudo(8), whoami(1), useradd(8)`,
};

const exit_cmd: CommandDefinition = {
  name: 'exit',
  async execute(_args, ctx) {
    if (ctx.sshSession) {
      ctx.out('Connection to ' + ctx.sshSession.remoteHost + ' closed.');
      ctx.sshDisconnect();
      return;
    }

    // If not the default guest user, drop back to guest
    if (ctx.user !== 'guest') {
      ctx.setUser('guest');
      ctx.fs.setCurrentUser('guest');
      ctx.setCwd('/home/guest');
    } else {
      ctx.out('logout');
    }
  },
  man: `EXIT(1)                  Builtin Commands                EXIT(1)

NAME
       exit - cause the shell to exit

SYNOPSIS
       exit [n]

DESCRIPTION
       Exit the shell or close an active SSH connection. If the current
       user is root (from su), exit returns to the guest user. If connected
       via SSH, exit disconnects and returns to the local machine.

SEE ALSO
       logout(1), ssh(1)`,
};

const env: CommandDefinition = {
  name: 'env',
  async execute(_args, ctx) {
    const entries = ctx.getEnvEntries().sort(([a], [b]) => a.localeCompare(b));
    for (const [k, v] of entries) {
      ctx.out(`${k}=${v}`);
    }
  },
  man: `ENV(1)                       User Commands                      ENV(1)

NAME
       env - run a program in a modified environment, or print environment

SYNOPSIS
       env

DESCRIPTION
       When called with no arguments, env prints the current environment
       variables. Environment variables are name=value pairs that configure
       shell behavior, user identity, search paths, and more.

       Common variables:
         USER       Current username
         HOME       Home directory path
         PATH       Directories searched for commands
         SHELL      Current shell program
         PWD        Current working directory

EXAMPLES
       env                Print all environment variables.
       echo $PATH         Print just the PATH variable.

SEE ALSO
       export(1), bash(1)`,
};

const export_cmd: CommandDefinition = {
  name: 'export',
  async execute(args, ctx) {
    if (args.length === 0) {
      const entries = ctx.getEnvEntries().sort(([a], [b]) => a.localeCompare(b));
      for (const [k, v] of entries) {
        ctx.out(`declare -x ${k}="${v.replace(/"/g, '\\"')}"`);
      }
      return;
    }

    for (const arg of args) {
      const m = arg.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) {
        ctx.setEnvVar(m[1], m[2]);
        continue;
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(arg)) {
        if (ctx.getEnvVar(arg) === undefined) ctx.setEnvVar(arg, '');
        continue;
      }
      ctx.out(`bash: export: \`${arg}\`: not a valid identifier`);
    }
  },
  man: `EXPORT(1)                    Builtin Commands                 EXPORT(1)

NAME
       export - set export attribute for shell variables

SYNOPSIS
       export [name[=value] ...]

DESCRIPTION
       Set environment variables in the current shell session. Variables
       exported this way are available to subsequent commands.

       With no arguments, export prints current exported variables.

EXAMPLES
       export SECRET="hunter2"
       export PATH="/custom/bin:$PATH"
       export

SEE ALSO
       env(1), bash(1)`,
};

const alias_cmd: CommandDefinition = {
  name: 'alias',
  async execute(args, ctx) {
    const formatAlias = (name: string, value: { cmd: string; prependArgs: string[] }) => {
      const rendered = [value.cmd, ...value.prependArgs].join(' ').trim();
      return `alias ${name}='${rendered}'`;
    };
    if (args.length === 0) {
      const aliases = ctx.getAliases();
      for (const name of Object.keys(aliases).sort()) {
        ctx.out(formatAlias(name, aliases[name]));
      }
      return;
    }

    for (const arg of args) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx < 0) {
        const aliases = ctx.getAliases();
        const existing = aliases[arg];
        if (!existing) {
          ctx.out(`alias: ${arg}: not found`);
          ctx.setExitCode(1);
          continue;
        }
        ctx.out(formatAlias(arg, existing));
        continue;
      }

      const name = arg.slice(0, eqIdx);
      let value = arg.slice(eqIdx + 1);
      if (!name) {
        ctx.out(`alias: \`${arg}\`: invalid alias name`);
        ctx.setExitCode(1);
        continue;
      }
      if ((value.startsWith('\'') && value.endsWith('\'')) || (value.startsWith('"') && value.endsWith('"'))) {
        value = value.slice(1, -1);
      }
      const tokens = splitAliasValue(value.trim());
      if (tokens.length === 0) {
        ctx.out(`alias: \`${arg}\`: invalid alias value`);
        ctx.setExitCode(1);
        continue;
      }
      ctx.setAlias(name, { cmd: tokens[0], prependArgs: tokens.slice(1) });
    }
  },
  man: `ALIAS(1)                    Builtin Commands                ALIAS(1)

NAME
       alias - define or display aliases

SYNOPSIS
       alias [name[=value] ...]

DESCRIPTION
       alias defines command aliases or displays existing aliases. With no
       arguments, all aliases are printed. With name=value, define or replace
       an alias.

EXAMPLES
       alias
       alias ll='ls -la'
       alias gs='git status'

SEE ALSO
       unalias(1), bash(1)`,
};

const unalias_cmd: CommandDefinition = {
  name: 'unalias',
  async execute(args, ctx) {
    const name = args[0];
    if (!name) {
      ctx.out('unalias: usage: unalias name');
      ctx.setExitCode(1);
      return;
    }
    if (!ctx.removeAlias(name)) {
      ctx.out(`unalias: ${name}: not found`);
      ctx.setExitCode(1);
      return;
    }
  },
  man: `UNALIAS(1)                  Builtin Commands              UNALIAS(1)

NAME
       unalias - remove each NAME from alias definitions

SYNOPSIS
       unalias name

DESCRIPTION
       unalias removes a previously defined alias from the current shell.

EXAMPLES
       unalias ll

SEE ALSO
       alias(1), bash(1)`,
};

const source: CommandDefinition = {
  name: 'source',
  async execute(args, ctx) {
    if (!args[0]) {
      ctx.out('bash: source: filename argument required');
      return;
    }
    const resolved = ctx.fs.resolvePath(ctx.cwd, args[0]);
    const node = ctx.fs.getNode(resolved);
    if (!node || node.type !== 'file') {
      ctx.out(`bash: ${args[0]}: No such file or directory`);
      return;
    }
  },
  man: `SOURCE(1)                Builtin Commands                SOURCE(1)

NAME
       source - execute commands from a file in the current shell

SYNOPSIS
       source filename
       . filename

DESCRIPTION
       Read and execute commands from filename in the current shell
       environment. This is often used to reload configuration files
       like .bashrc without logging out and back in.

       The "." (dot) command is an alias for source.

EXAMPLES
       source ~/.bashrc       Reload your bash configuration.
       . /etc/profile         Execute the system profile.

SEE ALSO
       bash(1), env(1)`,
};

type PocketItem =
  | { kind: 'tutorial'; tutorial: TutorialCartridge }
  | { kind: 'action'; label: string }
  | { kind: 'exit'; label: string };

const POCKET_ITEMS: PocketItem[] = [
  ...DEFAULT_TUTORIALS.map((tutorial) => ({ kind: 'tutorial' as const, tutorial })),
  { kind: 'action', label: '[ Action ] Reset System to Default (Clear VFS)' },
  { kind: 'exit', label: '[ Exit ] Return to Shell' },
];

function padCenter(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const total = width - text.length;
  const left = Math.floor(total / 2);
  return `${' '.repeat(left)}${text}${' '.repeat(total - left)}`;
}

function renderPocketTermMenu(ctx: { rawOut: (s: string) => void }, selected: number): void {
  const totalRows = 24;
  const width = 80;
  const dlgWidth = 68;
  const dlgHeight = 16;
  const top = Math.floor((totalRows - dlgHeight) / 2);
  const left = Math.floor((width - dlgWidth) / 2);
  const lines: string[] = [];

  for (let row = 0; row < totalRows; row++) {
    const inDialog = row >= top && row < top + dlgHeight;
    if (!inDialog) {
      lines.push('\x1b[44m' + ' '.repeat(width) + '\x1b[0m');
      continue;
    }

    const insideRow = row - top;
    let content = '';
    if (insideRow === 1) {
      content = padCenter('PocketTerm Configuration & Training', dlgWidth - 2);
    } else if (insideRow >= 3 && insideRow < 3 + POCKET_ITEMS.length) {
      const idx = insideRow - 3;
      const item = POCKET_ITEMS[idx];
      const label = item.kind === 'tutorial' ? `[ Tutorial ] ${item.tutorial.title}` : item.label;
      const padded = ` ${label.padEnd(dlgWidth - 4)} `;
      content = idx === selected
        ? `\x1b[46;30m${padded}\x1b[47;30m`
        : padded;
    } else if (insideRow === dlgHeight - 3) {
      content = padCenter('Use Arrow keys to move', dlgWidth - 2);
    } else if (insideRow === dlgHeight - 2) {
      const controls = '   <Select>    <Back>   ';
      content = padCenter(controls, dlgWidth - 2);
    } else {
      content = ' '.repeat(dlgWidth - 2);
    }
    const dlgLine = ` ${content.slice(0, dlgWidth - 2).padEnd(dlgWidth - 2)} `;
    const rowText = `${' '.repeat(left)}${dlgLine}${' '.repeat(width - left - dlgWidth)}`;
    lines.push('\x1b[44m' + rowText + '\x1b[0m');
  }

  ctx.rawOut('\x1b[2J\x1b[H' + lines.join('\r\n') + '\r\n');
}

const pocketterm: CommandDefinition = {
  name: 'pocketterm',
  async execute(_args, ctx) {
    let selected = 0;
    let action: 'none' | 'tutorial' | 'reset' | 'exit' = 'none';
    let selectedTutorial: TutorialCartridge | null = null;

    ctx.setLiveMode(true);
    try {
      renderPocketTermMenu(ctx, selected);
      while (!ctx.isInterrupted() && action === 'none') {
        const key = ctx.readLiveInput();
        if (key === null) {
          await sleep(50);
          continue;
        }
        if (key === '\x1b[A' || key === 'k') {
          selected = (selected - 1 + POCKET_ITEMS.length) % POCKET_ITEMS.length;
          renderPocketTermMenu(ctx, selected);
          continue;
        }
        if (key === '\x1b[B' || key === 'j') {
          selected = (selected + 1) % POCKET_ITEMS.length;
          renderPocketTermMenu(ctx, selected);
          continue;
        }
        if (key === 'q') {
          action = 'exit';
          break;
        }
        if (key === '\r' || key === '\n') {
          const item = POCKET_ITEMS[selected];
          if (item.kind === 'tutorial') {
            action = 'tutorial';
            selectedTutorial = item.tutorial;
            break;
          }
          if (item.kind === 'action') {
            action = 'reset';
            break;
          }
          action = 'exit';
          break;
        }
      }
    } finally {
      if (ctx.isInterrupted()) ctx.setExitCode(130);
      ctx.clearInterrupt();
      ctx.setLiveMode(false);
      ctx.rawOut('\x1b[0m');
    }

    if (action === 'reset') {
      ctx.rawOut('\x1b[2J\x1b[H');
      ctx.out('Factory reset requested. Reinstalling default system image...');
      await sleep(500);
      ctx.requestFactoryReset();
      return;
    }

    if (action === 'tutorial') {
      ctx.setTutorialMode(selectedTutorial);
      ctx.rawOut('\x1b[2J\x1b[H');
      const motd = ctx.fs.readFile('/etc/motd', 'root') ?? 'Welcome to PocketTerm.';
      for (const line of motd.split('\n').filter(Boolean)) {
        ctx.out(line);
      }
      ctx.out('');
      const activeTutorial = ctx.getTutorialMode();
      if (activeTutorial) {
        for (const line of activeTutorial.instructionBlock.split('\n')) {
          ctx.out('\x1b[1;33m' + line + '\x1b[0m');
        }
      }
    }
  },
  man: POCKETTERM_MAN_PAGE,
};

const reboot: CommandDefinition = {
  name: 'reboot',
  async execute(_args, ctx) {
    if (ctx.user !== 'root' && !ctx.sudo) {
      ctx.out('reboot: must be superuser');
      return;
    }
    ctx.rawOut('\x1b[2J\x1b[H');
    ctx.out('Broadcast message from root@pocket-term (pts/0):');
    ctx.out('');
    ctx.out('The system is going down for reboot NOW!');
    await sleep(1000);
    ctx.requestReboot();
  },
  man: `REBOOT(8)                    System Manager's Manual          REBOOT(8)

NAME
       reboot - reboot the system

SYNOPSIS
       reboot

DESCRIPTION
       reboot restarts the system. In this simulation, reboot enters a GRUB
       menu and boot/login cycle. Root privileges are required.

EXAMPLES
       sudo reboot
       reboot

SEE ALSO
       shutdown(8), systemctl(1)`,
};

const snapshot: CommandDefinition = {
  name: 'snapshot',
  async execute(args, ctx) {
    const sub = args[0]?.toLowerCase();

    if (sub === 'export') {
      const json = exportSystemState();
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `pocketterm-snapshot-${ts}.json`;
      ctx.triggerDownload(filename, json);
      ctx.out(`\x1b[1;32mSnapshot exported → ${filename}\x1b[0m`);
      ctx.out(`(${json.length} bytes, check your Downloads folder)`);
      return;
    }

    if (sub === 'import') {
      ctx.out('Opening file picker...');
      const content = await ctx.triggerUpload();
      if (content === null) {
        ctx.out('snapshot: import cancelled');
        return;
      }

      const result = importSystemState(content);
      if (!result.ok) {
        ctx.out(`\x1b[1;31msnapshot: import failed: ${result.error}\x1b[0m`);
        ctx.setExitCode(1);
        return;
      }

      ctx.out(`\x1b[1;32mSnapshot imported successfully (${result.keysWritten} keys restored).\x1b[0m`);
      ctx.out('Run "sudo reboot" to apply the restored state.');
      return;
    }

    ctx.out('usage: snapshot <export|import>');
    ctx.out('');
    ctx.out('  snapshot export    Download full system state as a JSON file');
    ctx.out('  snapshot import    Upload a JSON snapshot to restore system state');
  },
  man: `SNAPSHOT(1)              PocketTerm Commands              SNAPSHOT(1)

NAME
       snapshot - export or import the full PocketTerm system state

SYNOPSIS
       snapshot export
       snapshot import

DESCRIPTION
       snapshot manages the serialization and restoration of the complete
       PocketTerm system state, including the virtual filesystem, installed
       packages, service states, journal entries, and hardware configuration.

       export  Serialize all pocketterm state into a single JSON document
               and download it as a file to your computer.

       import  Open a file picker to select a previously exported snapshot
               JSON file from your computer. After import, run "sudo reboot"
               to apply the restored filesystem and service state.

EXAMPLES
       snapshot export
       snapshot import
       sudo reboot

SEE ALSO
       healthcheck(1), reboot(8)`,
};

export const miscCommands: CommandDefinition[] = [
  man, help, healthcheck, nano, vim, vi, ssh, scp, sudo_cmd, su, exit_cmd, env, export_cmd, alias_cmd, unalias_cmd, source, pocketterm, reboot, snapshot,
];
