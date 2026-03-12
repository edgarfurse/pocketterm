import { FileSystem } from './fileSystem';
import { NetworkLogic } from './networkLogic';
import { commandRegistry, cloneDefaultAliases } from './commands';
import type { CommandContext, SSHSession, ProcessInfo } from './commands';
import { loadHardwareState, type HardwareState } from './hardwareState';
import { DEFAULT_TUTORIAL_IDS, type TutorialCartridge } from './tutorials';
import { safePersist, triggerBrowserDownload, triggerBrowserUpload } from './storage';

export type OutputCallback = (text: string) => void;
export type ConfirmCallback = (message: string) => Promise<boolean>;
export type OpenEditorCallback = (path: string, initialContent: string) => Promise<string | null>;
export type OpenVimEditorCallback = (path: string, initialContent: string) => Promise<string | null>;
export type KernelPanicCallback = () => void;
export type PasswordPromptCallback = (prompt: string) => Promise<string>;
export type RebootCallback = () => void;
export type FactoryResetCallback = () => void;

const INSTALLED_PACKAGES_KEY = 'pocketterm-installed-packages';
const SERVICES_KEY = 'pocketterm-services';
const JOURNAL_KEY = 'pocketterm-journal';
const ENV_VARS_KEY = 'pocketterm-env-vars';

function loadInstalledPackages(): Set<string> {
  try {
    const stored = localStorage.getItem(INSTALLED_PACKAGES_KEY);
    if (stored) return new Set(JSON.parse(stored) as string[]);
  } catch { /* ignore corrupt data */ }
  return new Set();
}

function persistInstalledPackages(pkgs: Set<string>): boolean {
  const { ok } = safePersist(INSTALLED_PACKAGES_KEY, JSON.stringify([...pkgs]));
  return ok;
}

function loadServices(): Map<string, 'active' | 'inactive'> | null {
  try {
    const raw = localStorage.getItem(SERVICES_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as Record<string, 'active' | 'inactive'>;
    return new Map(Object.entries(obj));
  } catch {
    return null;
  }
}

function persistServices(services: Map<string, 'active' | 'inactive'>): boolean {
  const obj: Record<string, 'active' | 'inactive'> = {};
  for (const [k, v] of services) obj[k] = v;
  const { ok } = safePersist(SERVICES_KEY, JSON.stringify(obj));
  return ok;
}

function loadJournalEntries(): string[] | null {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string');
    }
    return null;
  } catch {
    return null;
  }
}

function persistJournalEntries(entries: string[]): boolean {
  const { ok } = safePersist(JOURNAL_KEY, JSON.stringify(entries.slice(-300)));
  return ok;
}

function loadEnvVars(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ENV_VARS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function persistEnvVars(vars: Map<string, string>): boolean {
  const payload: Record<string, string> = {};
  for (const [k, v] of vars.entries()) payload[k] = v;
  const { ok } = safePersist(ENV_VARS_KEY, JSON.stringify(payload));
  return ok;
}

const KERNEL_PANIC_TEXT = [
  '',
  '\x1b[1;31m[    0.000000] Kernel panic - not syncing: VFS: Unable to mount root fs on unknown-block(0,0)\x1b[0m',
  '\x1b[31m[    0.000000] CPU: 0 PID: 1 Comm: swapper/0 Not tainted 5.14.0-362.8.1.el9_3.x86_64 #1\x1b[0m',
  '\x1b[31m[    0.000000] Hardware name: QEMU Standard PC (i440FX + PIIX, 1996)\x1b[0m',
  '\x1b[31m[    0.000000] Call Trace:\x1b[0m',
  '\x1b[31m[    0.000000]  <TASK>\x1b[0m',
  '\x1b[31m[    0.000000]  dump_stack_lvl+0x33/0x46\x1b[0m',
  '\x1b[31m[    0.000000]  panic+0x10f/0x2c5\x1b[0m',
  '\x1b[31m[    0.000000]  mount_block_root+0x15c/0x21e\x1b[0m',
  '\x1b[31m[    0.000000]  mount_root+0xf3/0x106\x1b[0m',
  '\x1b[31m[    0.000000]  prepare_namespace+0x136/0x165\x1b[0m',
  '\x1b[31m[    0.000000]  kernel_init_freeable+0x259/0x284\x1b[0m',
  '\x1b[31m[    0.000000]  ? rest_init+0xc0/0xc0\x1b[0m',
  '\x1b[31m[    0.000000]  kernel_init+0x11/0x120\x1b[0m',
  '\x1b[31m[    0.000000]  ret_from_fork+0x22/0x30\x1b[0m',
  '\x1b[31m[    0.000000]  </TASK>\x1b[0m',
  '\x1b[31m[    0.000001] ---[ end Kernel panic - not syncing: VFS: Unable to mount root fs on unknown-block(0,0) ]---\x1b[0m',
  '',
  '\x1b[1;37;41m  CRITICAL: System halted. Core system files have been destroyed.  \x1b[0m',
  '',
  '\x1b[1;33m  The system cannot continue. Press the "Hard Reboot" button to  \x1b[0m',
  '\x1b[1;33m  reinstall the operating system and reset the filesystem.         \x1b[0m',
  '',
].join('\r\n');

// ── Pipeline / redirection parser ──

interface ParsedSegment {
  cmd: string;
  args: string[];
  sudo: boolean;
}

interface ParsedPipeline {
  segments: ParsedSegment[];
  redirectTarget: string | null;
  redirectAppend: boolean;
  parseError: string | null;
}

function tokenize(input: string): { tokens: string[]; error: string | null } {
  const tokens: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  const SQ_START = '\u0001';
  const SQ_END = '\u0002';

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

    if (inSingle) {
      if (ch === '\'') {
        inSingle = false;
        current += SQ_END;
      }
      else current += ch;
      continue;
    }

    if (inDouble) {
      if (ch === '"') inDouble = false;
      else if (ch === '\\') escaped = true;
      else current += ch;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '\'') {
      inSingle = true;
      current += SQ_START;
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
    if (ch === '|') {
      pushCurrent();
      tokens.push('|');
      continue;
    }
    if (ch === '>') {
      pushCurrent();
      if (input[i + 1] === '>') {
        tokens.push('>>');
        i++;
      } else {
        tokens.push('>');
      }
      continue;
    }
    current += ch;
  }

  if (escaped) current += '\\';
  if (inSingle || inDouble) {
    return { tokens, error: 'bash: parse error: unmatched quote' };
  }
  pushCurrent();
  return { tokens, error: null };
}

function parsePipeline(trimmed: string): ParsedPipeline {
  const { tokens, error } = tokenize(trimmed);
  if (error) return { segments: [], redirectTarget: null, redirectAppend: false, parseError: error };
  if (tokens.length === 0) return { segments: [], redirectTarget: null, redirectAppend: false, parseError: null };

  let redirectTarget: string | null = null;
  let redirectAppend = false;
  const segmentTokens: string[][] = [[]];
  let idx = 0;
  while (idx < tokens.length) {
    const tok = tokens[idx];
    if (tok === '|') {
      if (segmentTokens[segmentTokens.length - 1].length === 0) {
        return { segments: [], redirectTarget: null, redirectAppend: false, parseError: 'bash: syntax error near unexpected token `|`' };
      }
      segmentTokens.push([]);
      idx++;
      continue;
    }
    if (tok === '>' || tok === '>>') {
      const target = tokens[idx + 1];
      if (!target || target === '|' || target === '>' || target === '>>') {
        return { segments: [], redirectTarget: null, redirectAppend: false, parseError: 'bash: syntax error near unexpected token `newline`' };
      }
      redirectTarget = target;
      redirectAppend = tok === '>>';
      if (idx + 2 < tokens.length) {
        return { segments: [], redirectTarget: null, redirectAppend: false, parseError: `bash: syntax error near unexpected token \`${tokens[idx + 2]}\`` };
      }
      break;
    }
    segmentTokens[segmentTokens.length - 1].push(tok);
    idx++;
  }

  if (segmentTokens[segmentTokens.length - 1].length === 0) {
    return { segments: [], redirectTarget: null, redirectAppend: false, parseError: 'bash: syntax error: empty command in pipeline' };
  }

  const segments: ParsedSegment[] = segmentTokens.map((parts) => {
    let cmd = parts[0]?.toLowerCase() ?? '';
    let args = parts.slice(1);
    let sudo = false;
    if (cmd === 'sudo') {
      sudo = true;
      cmd = parts[1]?.toLowerCase() ?? '';
      args = parts.slice(2);
    }
    return { cmd, args, sudo };
  });

  return { segments, redirectTarget, redirectAppend, parseError: null };
}

// ── Shell class ──

export class Shell {
  private localFs: FileSystem;
  private remoteFs: FileSystem | null = null;
  private network: NetworkLogic;
  private cwd: string = '/home/guest';
  private history: string[] = [];
  private installedPackages: Set<string>;
  private historyIndex: number = -1;
  private panicked: boolean = false;
  private sshSession: SSHSession | null = null;
  private services: Map<string, 'active' | 'inactive'>;
  private journalEntries: string[];
  private bootTime: number;
  private interruptRequested: boolean = false;
  private commandRunning: boolean = false;
  private liveMode: boolean = false;
  private lastExitCode: number = 0;
  private processTable: Map<number, ProcessInfo> = new Map();
  private nextPid: number = 2000;
  private foregroundPid: number | null = null;
  private sudoAuthUntil: number = 0;
  private liveInputQueue: string[] = [];
  private pendingExitCodeOverride: number | null = null;
  private envVars: Map<string, string>;
  private aliases: Record<string, { cmd: string; prependArgs: string[] }>;
  private onOutput: OutputCallback;
  private onConfirm: ConfirmCallback;
  private onOpenEditor: OpenEditorCallback;
  private onOpenVimEditor: OpenVimEditorCallback;
  private onKernelPanic: KernelPanicCallback;
  private onPasswordPrompt: PasswordPromptCallback;
  private onReboot: RebootCallback;
  private onFactoryReset: FactoryResetCallback;
  private tutorialMode: TutorialCartridge | null = null;
  private tutorialProgress: Record<string, boolean> = {};
  private hardwareState: HardwareState;

  constructor(
    fs: FileSystem,
    network: NetworkLogic,
    onOutput: OutputCallback,
    onConfirm: ConfirmCallback,
    onOpenEditor: OpenEditorCallback,
    onOpenVimEditor: OpenVimEditorCallback,
    onKernelPanic: KernelPanicCallback,
    onPasswordPrompt: PasswordPromptCallback,
    onReboot: RebootCallback,
    onFactoryReset: FactoryResetCallback,
    initialTutorialMode: TutorialCartridge | null = null
  ) {
    this.localFs = fs;
    this.network = network;
    this.onOutput = onOutput;
    this.onConfirm = onConfirm;
    this.onOpenEditor = onOpenEditor;
    this.onOpenVimEditor = onOpenVimEditor;
    this.onKernelPanic = onKernelPanic;
    this.onPasswordPrompt = onPasswordPrompt;
    this.onReboot = onReboot;
    this.onFactoryReset = onFactoryReset;
    this.installedPackages = loadInstalledPackages();
    this.bootTime = Date.now();
    this.seedProcessTable();
    this.aliases = cloneDefaultAliases();
    this.envVars = new Map<string, string>([
      ['PATH', '/usr/bin:/bin:/usr/local/bin'],
      ['SHELL', '/usr/bin/bash'],
      ['LANG', 'en_US.UTF-8'],
      ['TERM', 'xterm-256color'],
    ]);
    for (const [k, v] of Object.entries(loadEnvVars())) {
      this.envVars.set(k, v);
    }
    this.services = loadServices() ?? new Map<string, 'active' | 'inactive'>([
      ['sshd', 'active'],
      ['nginx', 'active'],
      ['firewalld', 'active'],
      ['crond', 'active'],
      ['chronyd', 'active'],
      ['rsyslog', 'active'],
      ['NetworkManager', 'active'],
      ['systemd-logind', 'active'],
      ['dbus', 'active'],
      ['httpd', 'inactive'],
      ['mariadb', 'inactive'],
      ['postgresql', 'inactive'],
      ['docker', 'inactive'],
    ]);
    this.journalEntries = loadJournalEntries() ?? [
      'Feb 26 08:00:01 pocket-term systemd[1]: Started Journal Service.',
      'Feb 26 08:00:01 pocket-term systemd[1]: Started Network Manager.',
      'Feb 26 08:00:02 pocket-term systemd[1]: Started OpenSSH server daemon.',
      'Feb 26 08:00:03 pocket-term systemd[1]: Reached target Multi-User System.',
    ];
    this.hardwareState = loadHardwareState();
    this.tutorialMode = initialTutorialMode;
    this.verifyDefaultTutorialCoverage();
    this.resetTutorialProgress(initialTutorialMode);
    const initialUser = this.localFs.getCurrentUser();
    this.cwd = initialUser === 'root' ? '/root' : `/home/${initialUser}`;
    this.syncCoreEnv();
    persistServices(this.services);
    persistJournalEntries(this.journalEntries);
  }

  private verifyDefaultTutorialCoverage(): void {
    const covered = new Set(['help', 'navigation', 'copying', 'permissions', 'status']);
    for (const id of DEFAULT_TUTORIAL_IDS) {
      if (!covered.has(id)) {
        console.warn(`Tutorial progress checker missing scenario for default tutorial: ${id}`);
      }
    }
  }

  /** The currently active filesystem (local or remote). */
  private get fs(): FileSystem {
    return this.remoteFs ?? this.localFs;
  }

  isPanicked(): boolean {
    return this.panicked;
  }

  isCommandRunning(): boolean {
    return this.commandRunning;
  }

  isLiveMode(): boolean {
    return this.liveMode;
  }

  requestInterrupt(): void {
    this.interruptRequested = true;
  }

  pushLiveInput(data: string): void {
    this.liveInputQueue.push(data);
  }

  private readLiveInput(): string | null {
    return this.liveInputQueue.shift() ?? null;
  }

  getLastExitCode(): number {
    return this.lastExitCode;
  }

  setTutorialMode(mode: TutorialCartridge | null): void {
    this.tutorialMode = mode;
    this.resetTutorialProgress(mode);
  }

  getTutorialMode(): TutorialCartridge | null {
    return this.tutorialMode;
  }

  private seedProcessTable(): void {
    const base: ProcessInfo[] = [
      { pid: 1, user: 'root', command: '/usr/lib/systemd/systemd', state: 'S', start: '08:00', cpu: 0.0, mem: 0.3, killable: false },
      { pid: 1234, user: this.fs.getCurrentUser(), command: '-bash', state: 'S', start: '08:01', cpu: 0.0, mem: 0.1, killable: false },
    ];
    for (const p of base) this.processTable.set(p.pid, p);
  }

  private servicePid(name: string): number {
    return 500 + (name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) * 37) % 7000;
  }

  private syncServiceProcesses(): void {
    const defs: Array<{ service: string; command: string; mem: number }> = [
      { service: 'NetworkManager', command: '/usr/sbin/NetworkManager --no-daemon', mem: 0.3 },
      { service: 'sshd', command: '/usr/sbin/sshd -D', mem: 0.1 },
      { service: 'rsyslog', command: '/usr/sbin/rsyslogd -n', mem: 0.2 },
      { service: 'firewalld', command: '/usr/sbin/firewalld --nofork --nopid', mem: 0.2 },
      { service: 'crond', command: '/usr/sbin/crond -n', mem: 0.1 },
      { service: 'chronyd', command: '/usr/sbin/chronyd -n', mem: 0.1 },
      { service: 'dbus', command: '/usr/bin/dbus-daemon --system --nofork', mem: 0.1 },
      { service: 'nginx', command: '/usr/sbin/nginx -g daemon off;', mem: 0.2 },
      { service: 'mariadb', command: '/usr/libexec/mysqld --daemonize', mem: 0.4 },
      { service: 'postgresql', command: '/usr/bin/postgres -D /var/lib/pgsql/data', mem: 0.4 },
      { service: 'docker', command: '/usr/bin/dockerd -H fd://', mem: 0.5 },
    ];

    for (const def of defs) {
      const pid = this.servicePid(def.service);
      const active = this.services.get(def.service) === 'active';
      if (active) {
        if (!this.processTable.has(pid)) {
          this.processTable.set(pid, {
            pid,
            user: 'root',
            command: def.command,
            state: 'S',
            start: '08:00',
            cpu: 0.0,
            mem: def.mem,
            killable: false,
          });
        }
      } else {
        this.processTable.delete(pid);
      }
    }
  }

  private spawnForegroundProcess(commandLine: string): void {
    const pid = this.nextPid++;
    this.foregroundPid = pid;
    this.processTable.set(pid, {
      pid,
      user: this.fs.getCurrentUser(),
      command: commandLine || 'sh',
      state: 'R',
      start: 'now',
      cpu: 0.1,
      mem: 0.1,
      killable: true,
    });
  }

  private endForegroundProcess(): void {
    if (this.foregroundPid !== null) {
      this.processTable.delete(this.foregroundPid);
      this.foregroundPid = null;
    }
  }

  private getProcessSnapshot(): ProcessInfo[] {
    this.syncServiceProcesses();
    const nowUser = this.fs.getCurrentUser();
    const bash = this.processTable.get(1234);
    if (bash) bash.user = nowUser;
    return Array.from(this.processTable.values()).sort((a, b) => a.pid - b.pid);
  }

  private killProcess(pid: number): boolean {
    const proc = this.processTable.get(pid);
    if (!proc || !proc.killable) return false;
    if (this.foregroundPid === pid) {
      this.requestInterrupt();
      return true;
    }
    this.processTable.delete(pid);
    return true;
  }

  private get hostname(): string {
    return this.sshSession ? this.sshSession.remoteHost : 'pocket-term';
  }

  private addJournalEntry(entry: string): void {
    this.journalEntries.push(entry);
    if (this.journalEntries.length > 300) {
      this.journalEntries = this.journalEntries.slice(-300);
    }
    persistJournalEntries(this.journalEntries);
  }

  private resetTutorialProgress(mode: TutorialCartridge | null): void {
    switch (mode?.id ?? null) {
      case 'help':
        this.tutorialProgress = { manLs: false };
        break;
      case 'navigation':
        this.tutorialProgress = { enteredVarLog: false };
        break;
      case 'copying':
        this.tutorialProgress = { motdBackup: false };
        break;
      case 'permissions':
        this.tutorialProgress = { chmodSecret: false };
        break;
      case 'status':
        this.tutorialProgress = { dfh: false, sshdStatus: false };
        break;
      default:
        this.tutorialProgress = {};
    }
  }

  private completeTutorial(label: string): void {
    this.onOutput('\x1b[1;32m');
    this.onOutput(`\r\n[TUTORIAL PASS] ${label} complete.\r\n`);
    this.onOutput('Great work. Re-open pocketterm for the next training track.\r\n');
    this.onOutput('\x1b[0m');
    this.tutorialMode = null;
    this.tutorialProgress = {};
  }

  private evaluateTutorialProgress(input: string, status: number): void {
    if (!this.tutorialMode || status !== 0) return;
    const cmd = input.trim().replace(/\s+/g, ' ');
    if (!cmd) return;

    switch (this.tutorialMode.id) {
      case 'help': {
        if (/^man\s+ls$/i.test(cmd)) {
          this.tutorialProgress.manLs = true;
          this.completeTutorial(this.tutorialMode.title);
        }
        break;
      }
      case 'navigation': {
        if (/^cd\s+\/var\/log$/i.test(cmd) && this.cwd === '/var/log') {
          this.tutorialProgress.enteredVarLog = true;
          this.onOutput('\x1b[33m[TUTORIAL] Good. Now run ls -la in /var/log.\x1b[0m\r\n');
          break;
        }
        if (
          /^ls(\s|$)/i.test(cmd) &&
          (
            /(^|\s)-la(\s|$)/.test(` ${cmd} `) ||
            /(^|\s)-al(\s|$)/.test(` ${cmd} `)
          )
        ) {
          if (this.cwd === '/var/log' && this.tutorialProgress.enteredVarLog) {
            this.completeTutorial(this.tutorialMode.title);
          }
        }
        break;
      }
      case 'copying': {
        if (/^cp\s+\/etc\/motd\s+\/home\/guest\/backup\.txt$/i.test(cmd)) {
          const src = this.fs.readFile('/etc/motd', 'root');
          const dst = this.fs.readFile('/home/guest/backup.txt', 'root');
          if (src !== null && dst !== null && src === dst) {
            this.tutorialProgress.motdBackup = true;
            this.completeTutorial(this.tutorialMode.title);
          }
        }
        break;
      }
      case 'permissions': {
        if (/^chmod\s+600\s+secret\.txt$/i.test(cmd)) {
          const path = this.fs.resolvePath(this.cwd, 'secret.txt');
          const node = this.fs.getNode(path);
          if (node && node.type === 'file' && node.permissions === '600') {
            this.tutorialProgress.chmodSecret = true;
            this.completeTutorial(this.tutorialMode.title);
          }
        }
        break;
      }
      case 'status': {
        if (/^df(\s+.*)?$/i.test(cmd) && /(^|\s)-h(\s|$)/.test(` ${cmd} `)) {
          this.tutorialProgress.dfh = true;
          if (!this.tutorialProgress.sshdStatus) {
            this.onOutput('\x1b[33m[TUTORIAL] Nice. Now check sshd with systemctl status sshd.\x1b[0m\r\n');
          }
        }
        if (/^systemctl\s+status\s+sshd(\.service)?$/i.test(cmd)) {
          this.tutorialProgress.sshdStatus = true;
        }
        if (this.tutorialProgress.dfh && this.tutorialProgress.sshdStatus) {
          this.completeTutorial(this.tutorialMode.title);
        }
        break;
      }
      default:
        break;
    }
  }

  getPrompt(): string {
    const user = this.fs.getCurrentUser();
    const home = user === 'root' ? '/root' : `/home/${user}`;
    const shortCwd = this.cwd === home ? '~' : this.cwd;
    const sym = user === 'root' ? '#' : '$';
    return `[${user}@${this.hostname} ${shortCwd}]${sym} `;
  }

  getCwd(): string {
    return this.cwd;
  }

  getHistory(): string[] {
    return [...this.history];
  }

  historyUp(): string | null {
    if (this.history.length === 0) return null;
    if (this.historyIndex < 0) this.historyIndex = this.history.length;
    this.historyIndex = Math.max(0, this.historyIndex - 1);
    return this.history[this.historyIndex];
  }

  historyDown(): string | null {
    if (this.historyIndex < 0) return null;
    this.historyIndex++;
    if (this.historyIndex >= this.history.length) {
      this.historyIndex = -1;
      return null;
    }
    return this.history[this.historyIndex];
  }

  resetHistoryIndex(): void {
    this.historyIndex = -1;
  }

  tabComplete(input: string): string | null {
    const parts = input.split(/\s+/);
    const last = parts[parts.length - 1] ?? '';
    const beforeLast = parts.slice(0, -1).join(' ');

    const basePath = last.includes('/') ? last.replace(/\/[^/]*$/, '') || '/' : '.';
    const prefix = last.includes('/') ? last.split('/').pop() ?? '' : last;
    const resolved = this.fs.resolvePath(this.cwd, basePath);
    const dirPath = resolved.endsWith('/') && resolved !== '/' ? resolved.slice(0, -1) : resolved;
    const parentPath = dirPath.includes('/') ? dirPath.replace(/\/[^/]*$/, '') || '/' : '/';
    const dirName = dirPath.split('/').filter(Boolean).pop() ?? '';

    const parent = this.fs.getNode(parentPath);
    if (!parent || parent.type !== 'directory') return null;

    const dir = dirName ? parent.children?.get(dirName) : parent;
    const listDir = dir && dir.type === 'directory' ? this.fs.listDir(dirPath, this.fs.getCurrentUser()) : [];
    const candidates = prefix ? listDir.filter((n) => n.startsWith(prefix)) : listDir;

    if (candidates.length === 0) return null;

    const withBasePath = (completion: string) => {
      if (basePath === '.' || basePath === '') return completion;
      if (basePath === '/') return `/${completion}`;
      return `${basePath}/${completion}`;
    };

    const buildResult = (completion: string, suffix: string) => {
      const newLast = completion + suffix;
      return beforeLast ? `${beforeLast} ${newLast}` : newLast;
    };

    if (candidates.length === 1) {
      const completion = candidates[0];
      const fullPath = withBasePath(completion);
      const node = this.fs.getNode(this.fs.resolvePath(this.cwd, fullPath));
      const suffix = node?.type === 'directory' ? '/' : ' ';
      return buildResult(fullPath, suffix);
    }

    let common = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      while (!candidates[i].startsWith(common)) {
        common = common.slice(0, -1);
      }
    }
    if (common && common.length > prefix.length) {
      return buildResult(withBasePath(common), '');
    }
    return null;
  }

  private longestCommonPrefix(items: string[]): string {
    if (items.length === 0) return '';
    let common = items[0];
    for (let i = 1; i < items.length; i++) {
      while (!items[i].startsWith(common) && common.length > 0) {
        common = common.slice(0, -1);
      }
      if (!common) break;
    }
    return common;
  }

  getCommandCompletions(prefix: string): { matches: string[]; commonPrefix: string } {
    const commands = Array.from(commandRegistry.keys());
    const aliases = Object.keys(this.aliases);
    const all = Array.from(new Set([...commands, ...aliases])).sort();
    const matches = all.filter((name) => name.startsWith(prefix));
    return {
      matches,
      commonPrefix: this.longestCommonPrefix(matches),
    };
  }

  private expandVariables(token: string): string {
    const vars = Object.fromEntries(this.envVars.entries());
    const SQ_START = '\u0001';
    const SQ_END = '\u0002';
    const withStatus = token.replace(/\$\?/g, String(this.lastExitCode));

    let out = '';
    let i = 0;
    let inSingleQuotedSegment = false;
    while (i < withStatus.length) {
      const ch = withStatus[i];
      if (ch === SQ_START) {
        inSingleQuotedSegment = true;
        i++;
        continue;
      }
      if (ch === SQ_END) {
        inSingleQuotedSegment = false;
        i++;
        continue;
      }

      if (!inSingleQuotedSegment && ch === '$') {
        const rest = withStatus.slice(i + 1);
        const m = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
        if (m) {
          out += vars[m[1]] ?? '';
          i += 1 + m[1].length;
          continue;
        }
      }

      out += ch;
      i++;
    }
    return out;
  }

  // ── SSH session management ──

  private syncCoreEnv(): void {
    const user = this.fs.getCurrentUser();
    const home = user === 'root' ? '/root' : `/home/${user}`;
    this.envVars.set('USER', user);
    this.envVars.set('LOGNAME', user);
    this.envVars.set('HOME', home);
    this.envVars.set('PWD', this.cwd);
    this.envVars.set('HOSTNAME', this.hostname);
    this.envVars.set('MAIL', `/var/spool/mail/${user}`);
  }

  private sshConnect(host: string, user: string): void {
    this.sshSession = {
      remoteHost: host,
      remoteUser: user,
      localFs: this.localFs,
      localCwd: this.cwd,
      localUser: this.localFs.getCurrentUser(),
    };
    this.remoteFs = FileSystem.createRemoteVFS(user);
    this.cwd = user === 'root' ? '/root' : `/home/${user}`;
  }

  private sshDisconnect(): void {
    if (!this.sshSession) return;
    this.cwd = this.sshSession.localCwd;
    this.localFs.setCurrentUser(this.sshSession.localUser);
    this.sshSession = null;
    this.remoteFs = null;
  }

  private async executeParsedPipeline(
    pipeline: ParsedPipeline,
    outOverride: ((s: string) => void) | null,
    rawOutOverride: ((s: string) => void) | null,
  ): Promise<number> {
    // Handle sudo password prompt for the first segment
    for (const seg of pipeline.segments) {
      seg.args = seg.args.map((a) => this.expandVariables(a));
      if (seg.sudo && seg.cmd === '-k') {
        this.sudoAuthUntil = 0;
        continue;
      }
      if (seg.sudo && seg.cmd && this.fs.getCurrentUser() !== 'root') {
        if (Date.now() > this.sudoAuthUntil) {
          await this.onPasswordPrompt(`[sudo] password for ${this.fs.getCurrentUser()}: `);
          // Mock: always accept the password
          this.sudoAuthUntil = Date.now() + 5 * 60 * 1000;
        }
      }
    }

    // Execute the pipeline
    let pipedInput: string | null = null;
    let status = 0;

    for (let i = 0; i < pipeline.segments.length; i++) {
      const seg = pipeline.segments[i];
      const isLast = i === pipeline.segments.length - 1;
      const needCapture = !isLast || pipeline.redirectTarget !== null;

      if (needCapture) {
        // Capture output instead of printing to terminal
        const captured: string[] = [];
        const captureOut = (s: string) => { captured.push(s); };
        status = await this.runCommand(seg.cmd, seg.args, seg.sudo, captureOut, (s: string) => { captured.push(s); }, pipedInput);
        pipedInput = captured.join('\n');
        // Normalize pipe framing so downstream text filters receive line-oriented input.
        if (pipedInput.length > 0 && !pipedInput.endsWith('\n')) {
          pipedInput += '\n';
        }
      } else {
        status = await this.runCommand(seg.cmd, seg.args, seg.sudo, outOverride, rawOutOverride, pipedInput);
      }
    }

    // Handle redirection: write captured output to file
    if (pipeline.redirectTarget !== null && pipedInput !== null) {
      const targetPath = this.fs.resolvePath(this.cwd, pipeline.redirectTarget);
      const user = this.fs.getCurrentUser();
      if (pipeline.redirectAppend) {
        const existing = this.fs.readFile(targetPath, user) ?? '';
        const ok = this.fs.writeFile(targetPath, existing + pipedInput, user, false);
        if (!ok) {
          this.onOutput(`bash: ${pipeline.redirectTarget}: Permission denied\r\n`);
          status = 1;
        }
      } else {
        const ok = this.fs.writeFile(targetPath, pipedInput, user, false);
        if (!ok) {
          this.onOutput(`bash: ${pipeline.redirectTarget}: Permission denied\r\n`);
          status = 1;
        }
      }
    }
    return status;
  }

  // ── Main execute entry point ──

  async execute(input: string): Promise<void> {
    if (this.panicked) return;

    const trimmed = input.trim();
    if (!trimmed) return;

    this.history.push(trimmed);
    if (this.history.length > 100) this.history.shift();
    this.historyIndex = -1;

    this.interruptRequested = false;
    this.commandRunning = true;
    this.liveInputQueue = [];
    this.pendingExitCodeOverride = null;
    this.syncCoreEnv();
    let status = 0;
    try {
      const pipeline = parsePipeline(trimmed);
      if (pipeline.parseError) {
        this.onOutput(pipeline.parseError + '\r\n');
        this.lastExitCode = 2;
        return;
      }

      if (pipeline.segments.length === 0) return;
      this.spawnForegroundProcess(trimmed);

      status = await this.executeParsedPipeline(pipeline, null, null);

      // Kernel panic check (only for local FS)
      if (!this.sshSession && this.localFs.checkCriticalPathsMissing()) {
        this.triggerKernelPanic();
      }
      persistServices(this.services);
      this.lastExitCode = this.pendingExitCodeOverride ?? status;
      this.evaluateTutorialProgress(trimmed, this.lastExitCode);
    } finally {
      this.commandRunning = false;
      this.liveMode = false;
      this.endForegroundProcess();
    }
  }

  private triggerKernelPanic(): void {
    this.panicked = true;
    this.onOutput('\x1b[2J\x1b[H');
    this.onOutput(KERNEL_PANIC_TEXT);
    this.onKernelPanic();
  }

  private buildContext(
    sudo: boolean,
    outOverride: ((s: string) => void) | null,
    rawOutOverride: ((s: string) => void) | null,
  ): CommandContext {
    const out = outOverride
      ? (s: string) => outOverride(s)
      : (s: string) => this.onOutput(s + '\r\n');
    const err = (s: string) => this.onOutput(s + '\r\n');
    const rawOut = rawOutOverride
      ? (s: string) => rawOutOverride(s)
      : (s: string) => this.onOutput(s);

    return {
      fs: this.fs,
      cwd: this.cwd,
      setCwd: (p: string) => { this.cwd = p; this.syncCoreEnv(); },
      user: this.fs.getCurrentUser(),
      setUser: (u: string) => { this.fs.setCurrentUser(u); this.syncCoreEnv(); },
      sudo,
      out,
      err,
      rawOut,
      history: this.history,
      installedPackages: this.installedPackages,
      persistPackages: () => persistInstalledPackages(this.installedPackages),
      network: this.network,
      onConfirm: this.onConfirm,
      onOpenEditor: this.onOpenEditor,
      onOpenVimEditor: this.onOpenVimEditor,
      registry: commandRegistry,
      sshSession: this.sshSession,
      sshConnect: (host: string, user: string) => this.sshConnect(host, user),
      sshDisconnect: () => this.sshDisconnect(),
      promptPassword: (prompt: string) => this.onPasswordPrompt(prompt),
      hostname: this.hostname,
      services: this.services,
      persistServices: () => persistServices(this.services),
      bootTime: this.bootTime,
      isInterrupted: () => this.interruptRequested,
      clearInterrupt: () => { this.interruptRequested = false; },
      setLiveMode: (active: boolean) => { this.liveMode = active; },
      readLiveInput: () => this.readLiveInput(),
      getProcesses: () => this.getProcessSnapshot(),
      killProcess: (pid: number) => this.killProcess(pid),
      lastExitCode: this.lastExitCode,
      setExitCode: (code: number) => { this.pendingExitCodeOverride = code; },
      getEnvVar: (key: string) => this.envVars.get(key),
      setEnvVar: (key: string, value: string) => {
        this.envVars.set(key, value);
        persistEnvVars(this.envVars);
      },
      getEnvEntries: () => Array.from(this.envVars.entries()),
      outputMode: outOverride ? 'pipe' : 'terminal',
      getAliases: () => {
        const out: Record<string, { cmd: string; prependArgs: string[] }> = {};
        for (const [k, v] of Object.entries(this.aliases)) {
          out[k] = { cmd: v.cmd, prependArgs: [...v.prependArgs] };
        }
        return out;
      },
      setAlias: (name: string, value: { cmd: string; prependArgs: string[] }) => {
        this.aliases[name] = { cmd: value.cmd, prependArgs: [...value.prependArgs] };
      },
      removeAlias: (name: string) => {
        if (!(name in this.aliases)) return false;
        delete this.aliases[name];
        return true;
      },
      requestReboot: () => this.onReboot(),
      addJournalEntry: (entry: string) => this.addJournalEntry(entry),
      getJournalEntries: () => [...this.journalEntries],
      requestFactoryReset: () => this.onFactoryReset(),
      setTutorialMode: (mode: TutorialCartridge | null) => this.setTutorialMode(mode),
      getTutorialMode: () => this.getTutorialMode(),
      getHardwareState: () => this.hardwareState,
      triggerDownload: (filename: string, content: string) => triggerBrowserDownload(filename, content),
      triggerUpload: () => triggerBrowserUpload(),
    };
  }

  private async runCommand(
    cmd: string,
    args: string[],
    sudo: boolean,
    outOverride: ((s: string) => void) | null,
    rawOutOverride: ((s: string) => void) | null,
    pipedInput: string | null,
  ): Promise<number> {
    if (sudo && !cmd) {
      const termOut = outOverride ?? ((s: string) => this.onOutput(s + '\r\n'));
      termOut('usage: sudo <command>');
      return 1;
    }

    const alias = this.aliases[cmd];
    if (alias) {
      cmd = alias.cmd;
      args = [...alias.prependArgs, ...args];
    }

    if (cmd === 'sh' || cmd === 'bash') {
      let scriptArg: string | null = null;
      let xtrace = false;
      let errexit = true;
      for (const arg of args) {
        if (arg.startsWith('__stdin__:')) continue;
        if (arg === '-x') { xtrace = true; continue; }
        if (arg === '-e') { errexit = true; continue; }
        if (arg === '+e') { errexit = false; continue; }
        if (!arg.startsWith('-') && scriptArg === null) {
          scriptArg = arg;
          continue;
        }
      }
      if (!scriptArg) return 0;
      const scriptPath = this.fs.resolvePath(this.cwd, scriptArg);
      const node = this.fs.getNode(scriptPath);
      if (!node || node.type !== 'file') {
        const termOut = outOverride ?? ((s: string) => this.onOutput(s + '\r\n'));
        termOut(`${cmd}: ${scriptArg}: No such file or directory`);
        return 1;
      }
      const content = this.fs.readFile(scriptPath, this.fs.getCurrentUser());
      if (content === null) {
        const termOut = outOverride ?? ((s: string) => this.onOutput(s + '\r\n'));
        termOut(`${cmd}: ${scriptArg}: Permission denied`);
        return 1;
      }

      const lines = content.split('\n');
      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const rawLine = lines[lineIdx];
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const lineNo = lineIdx + 1;
        const termOut = outOverride ?? ((s: string) => this.onOutput(s + '\r\n'));

        if (line === 'set -e') {
          errexit = true;
          if (xtrace) termOut('+ set -e');
          continue;
        }
        if (line === 'set +e') {
          errexit = false;
          if (xtrace) termOut('+ set +e');
          continue;
        }

        if (xtrace) termOut(`+ ${line}`);

        const parsed = parsePipeline(line);
        if (parsed.parseError) {
          termOut(`${scriptArg}:${lineNo}: ${parsed.parseError}`);
          return 2;
        }
        if (parsed.segments.length === 0) continue;
        const status = await this.executeParsedPipeline(parsed, outOverride, rawOutOverride);
        if (status !== 0) {
          termOut(`${scriptArg}:${lineNo}: command exited with status ${status}`);
          if (errexit) return status;
        }
      }
      return 0;
    }

    // If piped input exists and the command expects file input (like grep without a file),
    // pass it as a special __stdin__ arg at the end
    if (pipedInput !== null) {
      args = [...args, '__stdin__:' + pipedInput];
    }

    const definition = commandRegistry.get(cmd);
    if (definition) {
      if (definition.requiresPackage && !this.installedPackages.has(definition.requiresPackage)) {
        const termOut = outOverride ?? ((s: string) => this.onOutput(s + '\r\n'));
        termOut(`bash: ${cmd}: command not found`);
        return 127;
      }
      const ctx = this.buildContext(sudo, outOverride, rawOutOverride);
      await definition.execute(args, ctx);
      const persistErr = this.fs.getLastPersistError();
      if (persistErr) {
        const termOut = outOverride ?? ((s: string) => this.onOutput(s + '\r\n'));
        termOut(`\x1b[1;31mwrite error: ${persistErr}\x1b[0m`);
        return 1;
      }
      return 0;
    }

    if (sudo && cmd === '-k') {
      this.sudoAuthUntil = 0;
      return 0;
    }

    const termOut = outOverride ?? ((s: string) => this.onOutput(s + '\r\n'));
    if (cmd) {
      termOut(`bash: ${cmd}: command not found`);
      return 127;
    }
    return 0;
  }
}
