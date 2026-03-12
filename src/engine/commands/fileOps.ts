import type { CommandDefinition, CommandContext } from './types';

function formatPerms(perms: string, type: string): string {
  const p = (ch: string) => {
    const n = parseInt(ch, 10);
    return (n & 4 ? 'r' : '-') + (n & 2 ? 'w' : '-') + (n & 1 ? 'x' : '-');
  };
  return (type === 'directory' ? 'd' : '-') + p(perms[0]) + p(perms[1]) + p(perms[2]);
}

function matchGlob(name: string, pattern: string): boolean {
  if (!pattern.includes('*') && !pattern.includes('?')) return name === pattern;
  const re = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${re}$`).test(name);
}

function walkTree(
  ctx: CommandContext,
  dirPath: string,
  callback: (fullPath: string, name: string, type: string) => void
): void {
  const entries = ctx.fs.listDir(dirPath, ctx.user);
  for (const entry of entries) {
    const full = dirPath === '/' ? `/${entry}` : `${dirPath}/${entry}`;
    const node = ctx.fs.getNode(full);
    if (!node) continue;
    callback(full, entry, node.type);
    if (node.type === 'directory') walkTree(ctx, full, callback);
  }
}

const ls: CommandDefinition = {
  name: 'ls',
  async execute(args, ctx) {
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const longFmt = flags.includes('l');
    const showAll = flags.includes('a');
    const target = args.find((a) => !a.startsWith('-')) ?? '.';
    const resolved = ctx.fs.resolvePath(ctx.cwd, target);
    const node = ctx.fs.getNode(resolved);
    if (!node) { ctx.err(`ls: cannot access '${target}': No such file or directory`); return; }
    if (node.type === 'directory' && !ctx.fs.canRead(node, ctx.sudo ? 'root' : ctx.user)) {
      ctx.err(`bash: ls: ${resolved}: Permission denied`); return;
    }
    let list = ctx.fs.listDir(resolved, ctx.sudo ? 'root' : ctx.user);
    if (!showAll) list = list.filter((n) => !n.startsWith('.'));
    if (list.length === 0) { ctx.out(''); return; }
    if (longFmt) {
      const base = resolved.endsWith('/') && resolved !== '/' ? resolved.slice(0, -1) : resolved;
      for (const name of list) {
        const child = ctx.fs.getNode(base + '/' + name);
        if (!child) continue;
        const perms = formatPerms(child.permissions, child.type);
        const size = child.type === 'file' ? child.content.length : 4096;
        ctx.out(`${perms} 1 ${child.owner.padEnd(6)} ${child.group.padEnd(6)} ${String(size).padStart(5)} Jan  1 00:00 ${name}`);
      }
    } else {
      if (ctx.outputMode === 'pipe') {
        for (const name of list) ctx.out(name);
      } else {
        ctx.out(list.join('  '));
      }
    }
  },
  man: `LS(1)                        User Commands                        LS(1)

NAME
       ls - list directory contents

SYNOPSIS
       ls [OPTION]... [FILE]...

DESCRIPTION
       List information about the FILEs (the current directory by default).
       Sort entries alphabetically. One of the most frequently used commands
       when exploring a Linux filesystem.

       By default, ls hides files whose names start with a dot (hidden files
       like .bashrc). Use -a to include them.

OPTIONS
       -a, --all
              Do not ignore hidden entries (names starting with .).

       -l     Long listing format. Shows permissions, link count, owner, group,
              size, date, and filename. Example output:
              -rw-r--r-- 1 guest  guest    256 Jan  1 00:00 myfile.txt

EXAMPLES
       ls                List files in the current directory.
       ls -l             Long format with permissions and sizes.
       ls -la            Long format including hidden files.
       ls /etc           List contents of /etc.
       ll                Alias for ls -l.
       la                Alias for ls -la.

SEE ALSO
       cd(1), pwd(1), find(1)`,
};

const cd: CommandDefinition = {
  name: 'cd',
  async execute(args, ctx) {
    const fallbackHome = ctx.user === 'root' ? '/root' : `/home/${ctx.user}`;
    const home = ctx.getEnvVar('HOME') ?? fallbackHome;
    const previousCwd = ctx.cwd;

    let target = args[0] ?? home;
    let printNewDirectory = false;

    if (target === '-') {
      const oldPwd = ctx.getEnvVar('OLDPWD');
      if (!oldPwd) {
        ctx.out('bash: cd: OLDPWD not set');
        ctx.setExitCode(1);
        return;
      }
      target = oldPwd;
      printNewDirectory = true;
    } else if (target === '~') {
      target = home;
    }

    const resolved = ctx.fs.resolvePath(ctx.cwd, target);
    const node = ctx.fs.getNode(resolved);
    if (!node || node.type !== 'directory') {
      ctx.out(`bash: cd: ${target}: No such file or directory`);
    } else if (!ctx.fs.canExecute(node, ctx.sudo ? 'root' : ctx.user)) {
      ctx.out(`bash: cd: ${resolved}: Permission denied`);
    } else {
      ctx.setEnvVar('OLDPWD', previousCwd);
      ctx.setCwd(resolved || '/');
      if (printNewDirectory) ctx.out(resolved || '/');
    }
  },
  man: `CD(1)                        Builtin Commands                     CD(1)

NAME
       cd - change the shell working directory (shell builtin)

SYNOPSIS
       cd [dir]

DESCRIPTION
       Change the current working directory. If no directory is given, cd
       changes to your home directory (~). Your location determines how
       relative paths resolve.

       Path components:
         .    current directory
         ..   parent directory
         ~    home directory (/home/guest for guest, /root for root)

OPTIONS
       -L     Follow symbolic links (default).
       -P     Use physical directory structure.

EXAMPLES
       cd              Go home.
       cd /tmp         Go to /tmp.
       cd ..           Go up one directory.
       cd ~            Go to home directory (tilde expansion).

SEE ALSO
       pwd(1), bash(1)`,
};

const pwd: CommandDefinition = {
  name: 'pwd',
  async execute(_args, ctx) {
    ctx.out(ctx.cwd);
  },
  man: `PWD(1)                       Builtin Commands                    PWD(1)

NAME
       pwd - print name of current/working directory

SYNOPSIS
       pwd [-LP]

DESCRIPTION
       Print the absolute pathname of the current working directory. Use this
       when you need to confirm your location in the filesystem.

EXAMPLES
       pwd             Might output: /home/guest

SEE ALSO
       cd(1)`,
};

const mkdir: CommandDefinition = {
  name: 'mkdir',
  async execute(args, ctx) {
    const hasP = args.includes('-p');
    const path = args.find((a) => !a.startsWith('-'));
    if (!path) { ctx.out('mkdir: missing operand'); return; }
    const resolved = ctx.fs.resolvePath(ctx.cwd, path);
    if (hasP) {
      const parts = resolved.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        current += '/' + part;
        const existing = ctx.fs.getNode(current);
        if (existing) continue;
        const ok = ctx.fs.mkdir(current, ctx.user, ctx.sudo);
        if (!ok) { ctx.out(`mkdir: cannot create directory '${path}': Permission denied`); return; }
      }
    } else {
      const ok = ctx.fs.mkdir(resolved, ctx.user, ctx.sudo);
      if (!ok) ctx.out(`mkdir: cannot create directory '${path}': Permission denied or file exists`);
    }
  },
  man: `MKDIR(1)                     User Commands                    MKDIR(1)

NAME
       mkdir - make directories

SYNOPSIS
       mkdir [OPTION]... DIRECTORY...

DESCRIPTION
       Create the DIRECTORY(ies) if they do not already exist.

OPTIONS
       -p, --parents
              Make parent directories as needed. No error if existing.

EXAMPLES
       mkdir projects           Create a directory called projects.
       mkdir -p a/b/c           Create nested directories a/b/c.

SEE ALSO
       rm(1), ls(1)`,
};

const rm: CommandDefinition = {
  name: 'rm',
  async execute(args, ctx) {
    const flags = args.filter((a) => a.startsWith('-')).join('');
    const recursive = flags.includes('r');
    const force = flags.includes('f');
    const path = args.find((a) => !a.startsWith('-'));
    if (!path) { ctx.out('rm: missing operand'); return; }
    const resolved = ctx.fs.resolvePath(ctx.cwd, path);
    const node = ctx.fs.getNode(resolved);
    if (!node) {
      if (!force) ctx.out(`rm: cannot remove '${path}': No such file or directory`);
      return;
    }
    const removed = ctx.fs.remove(resolved, ctx.user, ctx.sudo, recursive);
    if (!removed) ctx.out(`rm: cannot remove '${path}': Permission denied or directory not empty`);
  },
  man: `RM(1)                        User Commands                        RM(1)

NAME
       rm - remove files or directories

SYNOPSIS
       rm [OPTION]... [FILE]...

DESCRIPTION
       Remove (delete) each specified FILE. By default, rm does not remove
       directories; use -r to remove directories and their contents.

       WARNING: rm is irreversible. There is no trash can on Linux by default.

OPTIONS
       -r, -R, --recursive
              Remove directories and their contents recursively.

       -f, --force
              Ignore nonexistent files, never prompt.

       -rf    Combine recursive and force (common but dangerous).

EXAMPLES
       rm file.txt          Delete a file.
       rm -r mydir          Delete a directory and everything inside.
       rm -rf /tmp/junk     Force-delete without prompting.

SEE ALSO
       mkdir(1), mv(1)`,
};

const cp: CommandDefinition = {
  name: 'cp',
  async execute(args, ctx) {
    const nonFlags = args.filter((a) => !a.startsWith('-'));
    const src = nonFlags[0];
    const dest = nonFlags[1];
    if (!src || !dest) { ctx.out('cp: missing operand'); return; }
    const srcResolved = ctx.fs.resolvePath(ctx.cwd, src);
    const srcNode = ctx.fs.getNode(srcResolved);
    if (!srcNode) { ctx.out(`cp: cannot stat '${src}': No such file or directory`); return; }
    if (srcNode.type === 'directory') { ctx.out(`cp: -r not specified; omitting directory '${src}'`); return; }
    const content = ctx.fs.readFile(srcResolved, ctx.user);
    if (content === null) { ctx.out(`cp: cannot read '${src}': Permission denied`); return; }
    const destResolved = ctx.fs.resolvePath(ctx.cwd, dest);
    const destNode = ctx.fs.getNode(destResolved);
    let targetPath = destResolved;
    if (destNode?.type === 'directory') {
      const srcName = srcResolved.split('/').pop()!;
      targetPath = destResolved === '/' ? `/${srcName}` : `${destResolved}/${srcName}`;
    }
    const ok = ctx.fs.writeFile(targetPath, content, ctx.user, ctx.sudo);
    if (!ok) ctx.out(`cp: cannot create '${dest}': Permission denied`);
  },
  man: `CP(1)                        User Commands                        CP(1)

NAME
       cp - copy files

SYNOPSIS
       cp [OPTION]... SOURCE DEST

DESCRIPTION
       Copy SOURCE to DEST. If DEST is an existing directory, the file is
       copied into it keeping its original name. Currently supports file
       copying only (not recursive directory copy).

OPTIONS
       -r, -R, --recursive
              Copy directories recursively (noted for compatibility).

EXAMPLES
       cp file.txt backup.txt      Copy file.txt to backup.txt.
       cp file.txt /tmp/           Copy file.txt into /tmp/.

SEE ALSO
       mv(1), rm(1)`,
};

const mv: CommandDefinition = {
  name: 'mv',
  async execute(args, ctx) {
    const nonFlags = args.filter((a) => !a.startsWith('-'));
    const src = nonFlags[0];
    const dest = nonFlags[1];
    if (!src || !dest) { ctx.out('mv: missing operand'); return; }
    const srcResolved = ctx.fs.resolvePath(ctx.cwd, src);
    const srcNode = ctx.fs.getNode(srcResolved);
    if (!srcNode) { ctx.out(`mv: cannot stat '${src}': No such file or directory`); return; }
    if (srcNode.type === 'directory') { ctx.out(`mv: cannot move directories yet`); return; }
    const content = ctx.fs.readFile(srcResolved, ctx.user);
    if (content === null) { ctx.out(`mv: cannot read '${src}': Permission denied`); return; }
    const destResolved = ctx.fs.resolvePath(ctx.cwd, dest);
    const destNode = ctx.fs.getNode(destResolved);
    let targetPath = destResolved;
    if (destNode?.type === 'directory') {
      const srcName = srcResolved.split('/').pop()!;
      targetPath = destResolved === '/' ? `/${srcName}` : `${destResolved}/${srcName}`;
    }
    const writeOk = ctx.fs.writeFile(targetPath, content, ctx.user, ctx.sudo);
    if (!writeOk) { ctx.out(`mv: cannot move to '${dest}': Permission denied`); return; }
    const removeOk = ctx.fs.remove(srcResolved, ctx.user, ctx.sudo, false);
    if (!removeOk) ctx.out(`mv: cannot remove '${src}': Permission denied`);
  },
  man: `MV(1)                        User Commands                        MV(1)

NAME
       mv - move (rename) files

SYNOPSIS
       mv [OPTION]... SOURCE DEST

DESCRIPTION
       Rename SOURCE to DEST, or move SOURCE to a directory. If DEST is an
       existing directory, SOURCE is moved into it. mv is also used to rename
       files. Currently supports files only.

EXAMPLES
       mv old.txt new.txt          Rename old.txt to new.txt.
       mv file.txt /tmp/           Move file.txt into /tmp/.

SEE ALSO
       cp(1), rm(1)`,
};

const touch: CommandDefinition = {
  name: 'touch',
  async execute(args, ctx) {
    const path = args.find((a) => !a.startsWith('-'));
    if (!path) { ctx.out('touch: missing file operand'); return; }
    const resolved = ctx.fs.resolvePath(ctx.cwd, path);
    const existing = ctx.fs.getNode(resolved);
    if (existing) return;
    const ok = ctx.fs.writeFile(resolved, '', ctx.user, ctx.sudo);
    if (!ok) ctx.out(`touch: cannot touch '${path}': Permission denied`);
  },
  man: `TOUCH(1)                     User Commands                    TOUCH(1)

NAME
       touch - change file timestamps, or create empty files

SYNOPSIS
       touch [OPTION]... FILE...

DESCRIPTION
       Update the access and modification times of each FILE to the current
       time. If the FILE does not exist, it is created as an empty file.
       This is one of the most common ways to quickly create a new file.

EXAMPLES
       touch newfile.txt       Create newfile.txt (empty) or update its time.
       touch /tmp/marker       Create a marker file in /tmp.

SEE ALSO
       mkdir(1), stat(1)`,
};

const find: CommandDefinition = {
  name: 'find',
  async execute(args, ctx) {
    let searchPath = '.';
    let namePattern: string | null = null;
    let typeFilter: string | null = null;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-name' && args[i + 1]) { namePattern = args[++i]; continue; }
      if (args[i] === '-type' && args[i + 1]) { typeFilter = args[++i]; continue; }
      if (!args[i].startsWith('-')) searchPath = args[i];
    }
    const resolved = ctx.fs.resolvePath(ctx.cwd, searchPath);
    const node = ctx.fs.getNode(resolved);
    if (!node) { ctx.out(`find: '${searchPath}': No such file or directory`); return; }
    ctx.out(resolved);
    walkTree(ctx, resolved, (fullPath, name, type) => {
      if (typeFilter === 'f' && type !== 'file') return;
      if (typeFilter === 'd' && type !== 'directory') return;
      if (namePattern && !matchGlob(name, namePattern)) return;
      ctx.out(fullPath);
    });
  },
  man: `FIND(1)                      User Commands                    FIND(1)

NAME
       find - search for files in a directory hierarchy

SYNOPSIS
       find [path...] [expression]

DESCRIPTION
       find searches the directory tree rooted at each given path and
       evaluates an expression for each file found. By default it prints
       every file and directory it finds.

OPTIONS
       -name pattern
              Match files whose name matches pattern. Supports * and ?
              wildcards. Example: -name "*.txt"

       -type c
              Match by type: f for regular file, d for directory.

EXAMPLES
       find .                       List everything under current directory.
       find /etc -name "*.conf"     Find all .conf files under /etc.
       find /home -type d           Find all directories under /home.

SEE ALSO
       ls(1), grep(1)`,
};

export const fileOpsCommands: CommandDefinition[] = [ls, cd, pwd, mkdir, rm, cp, mv, touch, find];
