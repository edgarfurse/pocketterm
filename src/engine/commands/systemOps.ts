import type { CommandContext, CommandDefinition } from './types';
import { ALIASES } from './aliases';

// ── Shared dynamic helpers ──

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n: number): string { return String(n).padStart(2, '0'); }

function linuxDateString(d: Date): string {
  const tz = d.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').pop() ?? 'UTC';
  return `${DAYS[d.getDay()]} ${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())} ${tz} ${d.getFullYear()}`;
}

function formatUptime(bootTime: number): { timeStr: string; uptimeStr: string } {
  const now = new Date();
  const diff = Date.now() - bootTime;
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);

  const timeStr = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;

  let uptimePart: string;
  if (days > 0) {
    uptimePart = `${days} day${days > 1 ? 's' : ''},  ${hours}:${pad2(mins)}`;
  } else if (hours > 0) {
    uptimePart = `${hours}:${pad2(mins)}`;
  } else {
    uptimePart = `${mins} min`;
  }

  return { timeStr, uptimeStr: uptimePart };
}

function getDeviceMemoryGB(): number {
  return (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8;
}

function getCPUCores(): number {
  return navigator.hardwareConcurrency ?? 4;
}

/** Produce slightly different values each call within a plausible range. */
function dynamicMemKB(totalGB: number): { total: number; used: number; free: number; shared: number; buffCache: number; available: number } {
  const total = totalGB * 1024 * 1024;                          // KB
  const usedPct = 0.28 + Math.random() * 0.12;                 // 28-40%
  const buffPct = 0.20 + Math.random() * 0.10;                 // 20-30%
  const used = Math.round(total * usedPct);
  const buffCache = Math.round(total * buffPct);
  const free = total - used - buffCache;
  const shared = Math.round(total * (0.005 + Math.random() * 0.005));
  const available = free + Math.round(buffCache * 0.75);
  return { total, used, free, shared, buffCache, available };
}

function fmtKB(kb: number): string {
  if (kb >= 1024 * 1024) return `${(kb / (1024 * 1024)).toFixed(1)}Gi`;
  if (kb >= 1024)         return `${(kb / 1024).toFixed(0)}Mi`;
  return `${kb}Ki`;
}

function resolveCommandPath(commandName: string, ctx: CommandContext): string | null {
  const resolved = ALIASES[commandName]?.cmd ?? commandName;
  const def = ctx.registry.get(resolved);
  if (!def) return null;
  if (def.requiresPackage && !ctx.installedPackages.has(def.requiresPackage)) return null;
  return `/usr/bin/${resolved}`;
}

const SHELL_BUILTINS = new Set([
  'cd', 'pwd', 'help', 'man', 'alias', 'unalias', 'export', 'source', '.', 'history', 'exit', 'command', 'type',
]);

// ── Commands ──

const uname: CommandDefinition = {
  name: 'uname',
  async execute(args, ctx) {
    const flags = args.join(' ');
    const arch = detectAppleSilicon() ? 'aarch64' : 'x86_64';
    if (flags.includes('-a')) {
      ctx.out(`Linux ${ctx.hostname} 5.14.0-362.8.1.el9_3.${arch} #1 SMP PREEMPT_DYNAMIC Wed Nov 8 17:39:03 UTC 2023 ${arch} ${arch} ${arch} GNU/Linux`);
    } else if (flags.includes('-r')) {
      ctx.out(`5.14.0-362.8.1.el9_3.${arch}`);
    } else if (flags.includes('-n')) {
      ctx.out(ctx.hostname);
    } else if (flags.includes('-m')) {
      ctx.out(detectAppleSilicon() ? 'aarch64' : 'x86_64');
    } else {
      ctx.out('Linux');
    }
  },
  man: `UNAME(1)                     User Commands                   UNAME(1)

NAME
       uname - print system information

SYNOPSIS
       uname [OPTION]...

DESCRIPTION
       Print certain system information. With no OPTION, same as -s.

OPTIONS
       -a, --all         Print all information.
       -s, --kernel-name Print the kernel name (default).
       -n, --nodename    Print the network node hostname.
       -r, --kernel-release
                         Print the kernel release.
       -m, --machine     Print the machine hardware name.

EXAMPLES
       uname             Output: Linux
       uname -r          Output: 5.14.0-362.8.1.el9_3.x86_64
       uname -a          Full system information string.

SEE ALSO
       hostname(1)`,
};

const whoami: CommandDefinition = {
  name: 'whoami',
  async execute(_args, ctx) {
    ctx.out(ctx.user);
  },
  man: `WHOAMI(1)                    User Commands                   WHOAMI(1)

NAME
       whoami - print effective userid

SYNOPSIS
       whoami

DESCRIPTION
       Print the user name associated with the current effective user ID.
       Same as id -un.

EXAMPLES
       whoami            Output: guest (or root)

SEE ALSO
       id(1), who(1)`,
};

const hostname_cmd: CommandDefinition = {
  name: 'hostname',
  async execute(_args, ctx) {
    ctx.out(ctx.hostname);
  },
  man: `HOSTNAME(1)                  User Commands                HOSTNAME(1)

NAME
       hostname - show or set the system host name

SYNOPSIS
       hostname

DESCRIPTION
       Print the current host name. In this simulation, host identity follows
       the active shell context and defaults to pocket-term.

EXAMPLES
       hostname

SEE ALSO
       uname(1), hostnamectl(1)`,
};

const hostnamectl_cmd: CommandDefinition = {
  name: 'hostnamectl',
  async execute(_args, ctx) {
    ctx.out(` Static hostname: ${ctx.hostname}`);
    ctx.out('       Icon name: computer-vm');
    ctx.out('         Chassis: vm');
    ctx.out('      Machine ID: 8a4f7f4e04f84f1ab7ef8f31b8d2f4c1');
    ctx.out('         Boot ID: 0d1d2e3f4a5b6c7d8e9f001122334455');
    ctx.out('  Operating System: Rocky Linux 9.4 (Blue Onyx)');
    ctx.out('            Kernel: Linux 5.14.0-362.8.1.el9_3.x86_64');
    ctx.out('      Architecture: x86-64');
  },
  man: `HOSTNAMECTL(1)               User Commands             HOSTNAMECTL(1)

NAME
       hostnamectl - control the system hostname

SYNOPSIS
       hostnamectl

DESCRIPTION
       hostnamectl queries and changes the system hostname and related
       machine metadata. In this simulation, hostnamectl is read-only and
       reports current host and operating-system identity.

EXAMPLES
       hostnamectl

SEE ALSO
       hostname(1), uname(1)`,
};

const which_cmd: CommandDefinition = {
  name: 'which',
  async execute(args, ctx) {
    const cmd = args[0];
    if (!cmd) {
      ctx.out('which: no command in ($PATH)');
      return;
    }
    const path = resolveCommandPath(cmd, ctx);
    if (!path) { ctx.out(`${cmd} not found`); return; }
    ctx.out(path);
  },
  man: `WHICH(1)                     User Commands                    WHICH(1)

NAME
       which - locate a command

SYNOPSIS
       which command

DESCRIPTION
       Search for command in the shell command registry and print the
       executable path when found.

EXAMPLES
       which ls
       which dnf
       which fastfetch

SEE ALSO
       whereis(1), type(1)`,
};

const command_builtin: CommandDefinition = {
  name: 'command',
  async execute(args, ctx) {
    if (args[0] !== '-v') {
      ctx.out('usage: command -v name [name ...]');
      ctx.setExitCode(2);
      return;
    }
    const names = args.slice(1);
    if (names.length === 0) {
      ctx.out('command: usage: command -v name [name ...]');
      ctx.setExitCode(2);
      return;
    }

    let allFound = true;
    for (const name of names) {
      const path = resolveCommandPath(name, ctx);
      if (path) {
        ctx.out(path);
      } else {
        allFound = false;
      }
    }
    if (!allFound) ctx.setExitCode(1);
  },
  man: `COMMAND(1)                   Builtin Commands               COMMAND(1)

NAME
       command - run a command with aliases disabled

SYNOPSIS
       command -v name [name ...]

DESCRIPTION
       command is a shell builtin used to resolve command names and bypass
       shell functions or aliases. In this simulation, command -v reports
       command lookup paths in a Rocky Linux style layout.

OPTIONS
       -v     Print a path for each found command.

EXAMPLES
       command -v ls
       command -v git
       command -v dnf

SEE ALSO
       which(1), type(1), bash(1)`,
};

const type_builtin: CommandDefinition = {
  name: 'type',
  async execute(args, ctx) {
    if (args.length === 0) {
      ctx.out('type: usage: type name [name ...]');
      ctx.setExitCode(1);
      return;
    }

    let allFound = true;
    for (const name of args) {
      const alias = ALIASES[name];
      if (alias) {
        ctx.out(`${name} is aliased to '${[alias.cmd, ...alias.prependArgs].join(' ')}'`);
        continue;
      }

      const def = ctx.registry.get(name);
      if (def && (!def.requiresPackage || ctx.installedPackages.has(def.requiresPackage))) {
        if (SHELL_BUILTINS.has(name)) {
          ctx.out(`${name} is a shell builtin`);
        } else {
          ctx.out(`${name} is /usr/bin/${name}`);
        }
        continue;
      }

      allFound = false;
      ctx.out(`bash: type: ${name}: not found`);
    }
    if (!allFound) ctx.setExitCode(1);
  },
  man: `TYPE(1)                     Builtin Commands                 TYPE(1)

NAME
       type - indicate how each name would be interpreted

SYNOPSIS
       type name [name ...]

DESCRIPTION
       type reports whether a name is an alias, shell builtin, or executable
       command in the current shell environment.

EXAMPLES
       type ll
       type cd
       type git

SEE ALSO
       which(1), command(1), alias(1)`,
};

const tar: CommandDefinition = {
  name: 'tar',
  async execute(args, ctx) {
    if (args.length === 0) {
      ctx.out('tar: You must specify one of the \'-Acdtrux\', \'--delete\' or \'--test-label\' options');
      ctx.out('Try \'tar --help\' or \'tar --usage\' for more information.');
      return;
    }
    const flags = args[0];
    const archive = args[1] ?? 'archive.tar.gz';
    const files = args.slice(2);
    if (flags.includes('c')) {
      ctx.out(`tar: Creating archive: ${archive}`);
      const list = files.length > 0 ? files : ['README.md', 'src/', 'src/main.tsx', 'package.json'];
      for (const f of list) ctx.out(f);
      ctx.out(`tar: ${archive}: archive created`);
      return;
    }
    if (flags.includes('x')) {
      ctx.out(`tar: Extracting archive: ${archive}`);
      const list = ['README.md', 'src/', 'src/main.tsx', 'assets/logo.png', 'package.json'];
      for (const f of list) ctx.out(f);
      return;
    }
    ctx.out('tar: unsupported operation in this simulation');
  },
  man: `TAR(1)                       User Commands                      TAR(1)

NAME
       tar - an archiving utility

SYNOPSIS
       tar -czvf archive.tar.gz files...
       tar -xzvf archive.tar.gz

DESCRIPTION
       tar creates and extracts archive files. This simulation supports
       mock create (-c) and extract (-x) flows with verbose listing.

EXAMPLES
       tar -czvf backup.tar.gz /etc /var/log
       tar -xzvf backup.tar.gz

SEE ALSO
       gzip(1), bzip2(1), xz(1)`,
};

const date_cmd: CommandDefinition = {
  name: 'date',
  async execute(args, ctx) {
    if (args.includes('-u') || args.includes('--utc')) {
      const d = new Date();
      const utc = new Date(d.getTime() + d.getTimezoneOffset() * 60000);
      ctx.out(linuxDateString(utc).replace(/\S+(?=\s+\d{4}$)/, 'UTC'));
    } else {
      ctx.out(linuxDateString(new Date()));
    }
  },
  man: `DATE(1)                      User Commands                     DATE(1)

NAME
       date - print or set the system date and time

SYNOPSIS
       date [OPTION]...

DESCRIPTION
       Display the current date and time in the system's locale and
       timezone, formatted in standard Linux style.

OPTIONS
       -u, --utc    Print Coordinated Universal Time (UTC).

EXAMPLES
       date          Thu Feb 27 15:02:23 PST 2026
       date -u       Thu Feb 27 23:02:23 UTC 2026

SEE ALSO
       timedatectl(1), cal(1)`,
};

const uptime_cmd: CommandDefinition = {
  name: 'uptime',
  async execute(_args, ctx) {
    const { timeStr, uptimeStr } = formatUptime(ctx.bootTime);
    const l1 = (Math.random() * 0.08).toFixed(2);
    const l5 = (Math.random() * 0.05 + 0.01).toFixed(2);
    const l15 = (Math.random() * 0.04 + 0.02).toFixed(2);
    ctx.out(` ${timeStr} up ${uptimeStr},  1 user,  load average: ${l1}, ${l5}, ${l15}`);
  },
  man: `UPTIME(1)                    User Commands                   UPTIME(1)

NAME
       uptime - tell how long the system has been running

SYNOPSIS
       uptime

DESCRIPTION
       uptime gives a one-line display of the current time, how long the
       system has been running, the number of users, and the system load
       averages for the past 1, 5, and 15 minutes.

EXAMPLES
       uptime       15:02:23 up 2 min,  1 user,  load average: 0.00, 0.01, 0.05

SEE ALSO
       top(1), w(1)`,
};

const top: CommandDefinition = {
  name: 'top',
  async execute(_args, ctx) {
    ctx.setLiveMode(true);
    try {
      while (!ctx.isInterrupted()) {
        const { timeStr, uptimeStr } = formatUptime(ctx.bootTime);
        const l1 = (Math.random() * 0.15).toFixed(2);
        const l5 = (Math.random() * 0.08 + 0.01).toFixed(2);
        const l15 = (Math.random() * 0.06 + 0.02).toFixed(2);
        const totalGB = getDeviceMemoryGB();
        const mem = dynamicMemKB(totalGB);
        const memMiB = (n: number) => (n / 1024).toFixed(1);

        ctx.rawOut('\x1b[2J\x1b[H');
        ctx.out(`top - ${timeStr} up ${uptimeStr},  1 user,  load average: ${l1}, ${l5}, ${l15}`);
        ctx.out('Tasks:  87 total,   1 running,  86 sleeping,   0 stopped,   0 zombie');
        ctx.out(`%Cpu(s):  ${(Math.random() * 2).toFixed(1)} us,  ${(Math.random() * 0.5).toFixed(1)} sy,  0.0 ni, ${(98 + Math.random()).toFixed(1)} id,  0.0 wa,  0.0 hi,  0.0 si`);
        ctx.out(`MiB Mem :  ${memMiB(mem.total).padStart(8)} total,  ${memMiB(mem.free).padStart(8)} free,  ${memMiB(mem.used).padStart(8)} used,  ${memMiB(mem.buffCache).padStart(8)} buff/cache`);
        ctx.out(`MiB Swap:    2048.0 total,    2048.0 free,       0.0 used.  ${memMiB(mem.available).padStart(8)} avail Mem`);
        ctx.out('');
        ctx.out('    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND');
        const procs = ctx.getProcesses().slice(0, 10);
        for (const p of procs) {
          const virt = String(12000 + p.pid * 3).padStart(7);
          const res = String(2000 + Math.round(p.mem * 12000)).padStart(6);
          const shr = String(Math.max(512, Math.round((2000 + Math.round(p.mem * 12000)) * 0.6))).padStart(6);
          const cmd = p.command.split('/').pop() ?? p.command;
          ctx.out(`${String(p.pid).padStart(7)} ${p.user.padEnd(8)} 20   0 ${virt} ${res} ${shr} ${p.state} ${p.cpu.toFixed(1).padStart(5)} ${p.mem.toFixed(1).padStart(5)}   0:00.10 ${cmd}`);
        }
        ctx.out('');
        ctx.out("Press 'q' or Ctrl+C to quit.");
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      }
    } finally {
      if (ctx.isInterrupted()) ctx.setExitCode(130);
      ctx.clearInterrupt();
      ctx.setLiveMode(false);
    }
  },
  man: `TOP(1)                       User Commands                      TOP(1)

NAME
       top - display Linux processes

SYNOPSIS
       top

DESCRIPTION
       top provides a dynamic real-time view of a running system. It displays
       system summary information and a list of processes currently managed
       by the Linux kernel.

       Header lines show: uptime, users, load averages, task counts, CPU
       usage breakdown, memory and swap usage.

       Memory values are pulled from your browser's reported device memory
       and fluctuate slightly on each invocation.

       Process columns:
         PID      Process ID
         USER     Owner
         %CPU     CPU usage
         %MEM     Memory usage
         COMMAND  Command name

       This simulation refreshes every second until you press q or Ctrl+C.

EXAMPLES
       top              Show running processes (live refresh).

SEE ALSO
       ps(1), free(1), htop(1)`,
};

const ps: CommandDefinition = {
  name: 'ps',
  async execute(args, ctx) {
    const procs = ctx.getProcesses();
    const aux = args.includes('aux') || args.includes('-aux') || args.includes('-ef');
    if (aux) {
      ctx.out('USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND');
      for (const p of procs) {
        const tty = p.pid >= 1200 ? 'pts/0' : '?';
        const stat = p.state === 'R' ? 'R+' : 'Ss';
        const vsz = String(12000 + p.pid * 3).padStart(6);
        const rss = String(2000 + Math.round(p.mem * 12000)).padStart(5);
        ctx.out(`${p.user.padEnd(10)}${String(p.pid).padStart(5)} ${p.cpu.toFixed(1).padStart(4)} ${p.mem.toFixed(1).padStart(4)} ${vsz} ${rss} ${tty.padEnd(8)} ${stat.padEnd(4)} ${p.start.padEnd(6)} 0:00 ${p.command}`);
      }
      return;
    }
    ctx.out('  PID TTY          TIME CMD');
    for (const p of procs.filter((p) => p.user === ctx.user || p.pid <= 1001)) {
      const tty = p.pid >= 1200 ? 'pts/0' : '?';
      ctx.out(`${String(p.pid).padStart(5)} ${tty.padEnd(12)} 00:00:00 ${p.command.split('/').pop() ?? p.command}`);
    }
  },
  man: `PS(1)                        User Commands                       PS(1)

NAME
       ps - report a snapshot of current processes

SYNOPSIS
       ps
       ps aux

DESCRIPTION
       ps displays information about active processes.

EXAMPLES
       ps
       ps aux

SEE ALSO
       top(1), kill(1), htop(1)`,
};

const kill_cmd: CommandDefinition = {
  name: 'kill',
  async execute(args, ctx) {
    const pidArg = [...args].reverse().find((a) => /^\d+$/.test(a));
    if (!pidArg) {
      const shown = args[0] ?? '';
      ctx.out(`bash: kill: (${shown}) - No such process`);
      return;
    }
    const ok = ctx.killProcess(parseInt(pidArg, 10));
    if (!ok) ctx.out(`bash: kill: (${pidArg}) - No such process`);
  },
  man: `KILL(1)                      User Commands                     KILL(1)

NAME
       kill - send a signal to a process

SYNOPSIS
       kill PID

DESCRIPTION
       Send a signal to the specified process ID. This simulation performs
       a mock success for numeric PIDs.

EXAMPLES
       kill 1234

SEE ALSO
       ps(1), top(1)`,
};

const free_cmd: CommandDefinition = {
  name: 'free',
  async execute(args, ctx) {
    const human = args.includes('-h');
    const inMegabytes = args.includes('-m');
    const totalGB = getDeviceMemoryGB();
    const mem = dynamicMemKB(totalGB);
    const swapTotal = 2 * 1024 * 1024;

    if (human) {
      const f = fmtKB;
      ctx.out('               total        used        free      shared  buff/cache   available');
      ctx.out(`Mem:       ${f(mem.total).padStart(8)}   ${f(mem.used).padStart(8)}   ${f(mem.free).padStart(8)}    ${f(mem.shared).padStart(8)}   ${f(mem.buffCache).padStart(8)}   ${f(mem.available).padStart(8)}`);
      ctx.out(`Swap:      ${f(swapTotal).padStart(8)}         0B   ${f(swapTotal).padStart(8)}`);
    } else if (inMegabytes) {
      const toMB = (kb: number) => Math.round(kb / 1024);
      ctx.out('               total        used        free      shared  buff/cache   available');
      ctx.out(`Mem:     ${String(toMB(mem.total)).padStart(10)} ${String(toMB(mem.used)).padStart(10)} ${String(toMB(mem.free)).padStart(10)} ${String(toMB(mem.shared)).padStart(10)} ${String(toMB(mem.buffCache)).padStart(10)} ${String(toMB(mem.available)).padStart(10)}`);
      ctx.out(`Swap:    ${String(toMB(swapTotal)).padStart(10)}          0 ${String(toMB(swapTotal)).padStart(10)}`);
    } else {
      ctx.out('               total        used        free      shared  buff/cache   available');
      ctx.out(`Mem:     ${String(mem.total).padStart(10)} ${String(mem.used).padStart(10)} ${String(mem.free).padStart(10)} ${String(mem.shared).padStart(10)} ${String(mem.buffCache).padStart(10)} ${String(mem.available).padStart(10)}`);
      ctx.out(`Swap:    ${String(swapTotal).padStart(10)}          0 ${String(swapTotal).padStart(10)}`);
    }
  },
  man: `FREE(1)                      User Commands                     FREE(1)

NAME
       free - display amount of free and used memory in the system

SYNOPSIS
       free [OPTIONS]

DESCRIPTION
       free displays the total amount of free and used physical and swap
       memory, as well as buffers and caches used by the kernel.

       Total RAM is derived from your browser's navigator.deviceMemory
       (falls back to 8 GB). Used/free values fluctuate slightly each call.

       Columns:
         total      Total installed memory
         used       Memory in use
         free       Unused memory
         shared     Memory used by tmpfs
         buff/cache Memory used by kernel buffers and page cache
         available  Estimated memory available for starting new apps

OPTIONS
       -m     Show memory values in mebibytes (MiB).
       -h     Human-readable output (e.g., 1.2Gi instead of bytes).

EXAMPLES
       free              Show memory in kilobytes.
       free -m           Show memory in MiB.
       free -h           Show memory in human-readable format.

SEE ALSO
       top(1), vmstat(8)`,
};

function detectAppleSilicon(): boolean {
  const ua = navigator.userAgent;
  if (/Macintosh/.test(ua) && /ARM/.test(ua)) return true;
  // Modern Safari/Chrome on Apple Silicon don't always say ARM in the UA.
  // WebGL renderer is the most reliable in-browser signal.
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl') ?? c.getContext('experimental-webgl');
    if (gl) {
      const dbg = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        const renderer = (gl as WebGLRenderingContext).getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string;
        if (/Apple/.test(renderer) && /GPU/.test(renderer)) return true;
      }
    }
  } catch { /* canvas unavailable */ }
  // Fallback: macOS + not clearly Intel
  if (/Macintosh/.test(ua) && !/Intel/.test(ua)) return true;
  return false;
}

const lscpu: CommandDefinition = {
  name: 'lscpu',
  async execute(_args, ctx) {
    const cores = getCPUCores();
    const isApple = detectAppleSilicon();

    if (isApple) {
      const perfCores = Math.max(1, Math.floor(cores * 0.5));
      const effCores = cores - perfCores;

      ctx.out('Architecture:            aarch64');
      ctx.out('  CPU op-mode(s):        32-bit, 64-bit');
      ctx.out('  Byte Order:            Little Endian');
      ctx.out('Address sizes:           36 bits physical, 39 bits virtual');
      ctx.out(`CPU(s):                  ${cores}`);
      ctx.out('  On-line CPU(s) list:   0-' + (cores - 1));
      ctx.out('Vendor ID:               Apple');
      ctx.out('  Model name:            Apple Silicon');
      ctx.out('    Thread(s) per core:  1');
      ctx.out(`    Core(s) per socket:  ${cores}`);
      ctx.out('    Socket(s):           1');
      ctx.out('    Stepping:            0x1');
      ctx.out('    CPU(s) scaling MHz:  100%');
      ctx.out('    CPU max MHz:         3500.000');
      ctx.out('    CPU min MHz:         600.000');
      ctx.out(`    BogoMIPS:            ${(cores * 48).toFixed(2)}`);
      ctx.out('Caches (sum of all):');
      ctx.out(`  L1d:                   ${perfCores * 128 + effCores * 64} KiB (${cores} instances)`);
      ctx.out(`  L1i:                   ${perfCores * 192 + effCores * 128} KiB (${cores} instances)`);
      ctx.out(`  L2:                    ${perfCores * 4096 + effCores * 4096} KiB (${Math.ceil(cores / 4)} instances)`);
      ctx.out('NUMA:');
      ctx.out('  NUMA node(s):          1');
      ctx.out('  NUMA node0 CPU(s):     0-' + (cores - 1));
    } else {
      const sockets = 1;
      const coresPerSocket = Math.max(1, Math.floor(cores / 2));
      const threadsPerCore = Math.ceil(cores / coresPerSocket);

      ctx.out('Architecture:            x86_64');
      ctx.out('  CPU op-mode(s):        32-bit, 64-bit');
      ctx.out('  Byte Order:            Little Endian');
      ctx.out('Address sizes:           46 bits physical, 48 bits virtual');
      ctx.out(`CPU(s):                  ${cores}`);
      ctx.out('  On-line CPU(s) list:   0-' + (cores - 1));
      ctx.out('Vendor ID:               GenuineIntel');
      ctx.out('  Model name:            Intel(R) Xeon(R) CPU E5-2680 v4 @ 2.40GHz');
      ctx.out('    CPU family:          6');
      ctx.out('    Model:               79');
      ctx.out('    Thread(s) per core:  ' + threadsPerCore);
      ctx.out('    Core(s) per socket:  ' + coresPerSocket);
      ctx.out('    Socket(s):           ' + sockets);
      ctx.out('    Stepping:            1');
      ctx.out('    CPU MHz:             2400.000');
      ctx.out('    CPU max MHz:         3300.000');
      ctx.out('    CPU min MHz:         1200.000');
      ctx.out('    BogoMIPS:            4800.00');
      ctx.out('Caches (sum of all):');
      ctx.out('  L1d:                   ' + (coresPerSocket * 32) + ' KiB (' + coresPerSocket + ' instances)');
      ctx.out('  L1i:                   ' + (coresPerSocket * 32) + ' KiB (' + coresPerSocket + ' instances)');
      ctx.out('  L2:                    ' + (coresPerSocket * 256) + ' KiB (' + coresPerSocket + ' instances)');
      ctx.out('  L3:                    ' + (coresPerSocket * 2.5).toFixed(0) + ' MiB (1 instance)');
      ctx.out('NUMA:');
      ctx.out('  NUMA node(s):          1');
      ctx.out('  NUMA node0 CPU(s):     0-' + (cores - 1));
    }
  },
  man: `LSCPU(1)                     User Commands                    LSCPU(1)

NAME
       lscpu - display information about the CPU architecture

SYNOPSIS
       lscpu

DESCRIPTION
       lscpu gathers CPU architecture information from sysfs, /proc/cpuinfo,
       and other system files. It displays the number of CPUs, threads,
       cores, sockets, cache sizes, and other CPU details.

       The CPU count is derived from your browser's
       navigator.hardwareConcurrency (falls back to 4).

EXAMPLES
       lscpu            Display CPU information.

SEE ALSO
       nproc(1), /proc/cpuinfo`,
};

const lsblk: CommandDefinition = {
  name: 'lsblk',
  async execute(args, ctx) {
    if (args.length > 0) {
      ctx.out('Usage: lsblk');
      ctx.out('lsblk: extra arguments are not supported in this simulation');
      return;
    }
    const hw = ctx.getHardwareState();
    ctx.out('NAME          MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS');
    const devices = Object.values(hw.devices)
      .filter((d) => d.attached)
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const dev of devices) {
      if (dev.name === 'sda') {
        ctx.out('sda             8:0    0   80G  0 disk ');
        ctx.out('├─sda1          8:1    0  600M  0 part /boot/efi');
        ctx.out('├─sda2          8:2    0    1G  0 part /boot');
        ctx.out('└─sda3          8:3    0 78.4G  0 part ');
        ctx.out('  └─rl-root   253:0    0   70G  0 lvm  /');
      } else {
        const minor = dev.name === 'sdb' ? 16 : dev.name === 'sdc' ? 32 : 48;
        ctx.out(`${dev.name.padEnd(15)} 8:${minor}   0  ${dev.size.padStart(4)}  0 disk `);
      }
    }
  },
  man: `LSBLK(8)                    System Administration            LSBLK(8)

NAME
       lsblk - list block devices

SYNOPSIS
       lsblk

DESCRIPTION
       lsblk lists information about available block devices. The output
       includes disks, partitions, and logical volume mappings.

       This simulation prints a Rocky Linux 9 style LVM layout with:
         - EFI partition on /boot/efi
         - Separate /boot partition
         - LVM root volume mounted at /

EXAMPLES
       lsblk

SEE ALSO
       df(1), mount(8), lvm(8)`,
};

const cal: CommandDefinition = {
  name: 'cal',
  async execute(args, ctx) {
    let year: number;
    let month: number;

    if (args.length >= 2) {
      month = parseInt(args[0], 10) - 1;
      year = parseInt(args[1], 10);
    } else if (args.length === 1) {
      const n = parseInt(args[0], 10);
      if (n > 12) {
        year = n;
        month = new Date().getMonth();
      } else {
        month = n - 1;
        year = new Date().getFullYear();
      }
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth();
    }

    if (isNaN(year) || isNaN(month) || month < 0 || month > 11) {
      ctx.out('cal: invalid date');
      return;
    }

    const fullMonths = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    const title = `${fullMonths[month]} ${year}`;
    ctx.out(title.padStart(Math.floor((20 + title.length) / 2)));
    ctx.out('Su Mo Tu We Th Fr Sa');

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    const todayDate = today.getDate();

    let line = '   '.repeat(firstDay);
    for (let d = 1; d <= daysInMonth; d++) {
      const dayStr = String(d).padStart(2);
      if (isCurrentMonth && d === todayDate) {
        line += `\x1b[7m${dayStr}\x1b[0m `;
      } else {
        line += dayStr + ' ';
      }
      if ((firstDay + d) % 7 === 0) {
        ctx.out(line.trimEnd());
        line = '';
      }
    }
    if (line.trim()) ctx.out(line.trimEnd());
  },
  man: `CAL(1)                       User Commands                      CAL(1)

NAME
       cal - display a calendar

SYNOPSIS
       cal [month] [year]

DESCRIPTION
       cal displays a simple calendar for the current month. If a month
       and year are specified, it displays that month. Today's date is
       highlighted with inverted colors.

EXAMPLES
       cal               Show current month.
       cal 12 2025       Show December 2025.
       cal 3 2026        Show March 2026.

SEE ALSO
       date(1)`,
};

const df: CommandDefinition = {
  name: 'df',
  async execute(args, ctx) {
    const human = args.includes('-h');
    if (human) {
      ctx.out('Filesystem                  Size  Used Avail Use% Mounted on');
      ctx.out('devtmpfs                    4.0M     0  4.0M   0% /dev');
      ctx.out('tmpfs                       3.9G     0  3.9G   0% /dev/shm');
      ctx.out('tmpfs                       1.6G  8.6M  1.6G   1% /run');
      ctx.out('/dev/mapper/rl-root          70G  4.5G   66G   7% /');
      ctx.out('/dev/sda2                  1014M  288M  727M  29% /boot');
      ctx.out('/dev/sda1                   599M  7.1M  592M   2% /boot/efi');
      ctx.out('tmpfs                       796M     0  796M   0% /run/user/1000');
    } else {
      ctx.out('Filesystem                 1K-blocks    Used Available Use% Mounted on');
      ctx.out('devtmpfs                        4096       0      4096   0% /dev');
      ctx.out('tmpfs                        4089440       0   4089440   0% /dev/shm');
      ctx.out('tmpfs                        1635776    8806   1626970   1% /run');
      ctx.out('/dev/mapper/rl-root        73365504 4718592 68646912   7% /');
      ctx.out('/dev/sda2                   1038336  294912    743424  29% /boot');
      ctx.out('/dev/sda1                    613376    7270    606106   2% /boot/efi');
      ctx.out('tmpfs                         815104       0    815104   0% /run/user/1000');
    }
  },
  man: `DF(1)                        User Commands                       DF(1)

NAME
       df - report file system disk space usage

SYNOPSIS
       df [OPTION]...

DESCRIPTION
       df displays the amount of disk space available on each mounted
       filesystem. Useful for checking if a disk is running out of space.

       Columns:
         Filesystem   Device name
         Size/1K-blocks  Total space
         Used         Space in use
         Avail        Free space
         Use%         Percentage used
         Mounted on   Where it is mounted in the directory tree

OPTIONS
       -h     Human-readable output (powers of 1024: K, M, G).

EXAMPLES
       df               Show disk usage in 1K blocks.
       df -h            Show disk usage in human-readable format.

SEE ALSO
       du(1), free(1)`,
};

const history_cmd: CommandDefinition = {
  name: 'history',
  async execute(_args, ctx) {
    if (ctx.history.length === 0) return;
    for (let i = 0; i < ctx.history.length; i++) {
      ctx.out(`  ${String(i + 1).padStart(4)}  ${ctx.history[i]}`);
    }
  },
  man: `HISTORY(1)                   Builtin Commands                HISTORY(1)

NAME
       history - display the command history list

SYNOPSIS
       history

DESCRIPTION
       Display the list of previously entered commands, numbered sequentially.
       The shell remembers your commands so you can recall them with the up
       and down arrow keys.

EXAMPLES
       history           List all commands entered this session.

SEE ALSO
       bash(1)`,
};

const clear: CommandDefinition = {
  name: 'clear',
  async execute(_args, ctx) {
    ctx.rawOut('\x1b[2J\x1b[H');
  },
  man: `CLEAR(1)                 General Commands Manual         CLEAR(1)

NAME
       clear - clear the terminal screen

SYNOPSIS
       clear

DESCRIPTION
       Clear the terminal screen. Previous output can still be scrolled to.
       Ctrl+L is a keyboard shortcut that does the same thing.

EXAMPLES
       clear             Clear the screen.

SEE ALSO
       reset(1)`,
};

const reset: CommandDefinition = {
  name: 'reset',
  async execute(_args, ctx) {
    ctx.rawOut('\x1b[2J\x1b[H');
  },
  man: `RESET(1)                 General Commands Manual         RESET(1)

NAME
       reset - terminal initialization

SYNOPSIS
       reset

DESCRIPTION
       Reset the terminal to a sane state. Similar to clear but also resets
       terminal settings.

SEE ALSO
       clear(1)`,
};

export const systemOpsCommands: CommandDefinition[] = [
  uname, whoami, hostname_cmd, hostnamectl_cmd, which_cmd, command_builtin, type_builtin, tar, date_cmd, uptime_cmd, top, ps, kill_cmd, free_cmd, lscpu, lsblk, cal, df, history_cmd, clear, reset,
];

// ── Exported helpers for fastfetch and other consumers ──
export { formatUptime, getDeviceMemoryGB, getCPUCores, dynamicMemKB, fmtKB, detectAppleSilicon };
