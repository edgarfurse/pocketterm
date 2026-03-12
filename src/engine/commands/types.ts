import type { FileSystem } from '../fileSystem';
import type { NetworkLogic } from '../networkLogic';
import type { HardwareState } from '../hardwareState';
import type { TutorialCartridge } from '../tutorials';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface SSHSession {
  remoteHost: string;
  remoteUser: string;
  localFs: FileSystem;
  localCwd: string;
  localUser: string;
}

export interface ProcessInfo {
  pid: number;
  user: string;
  command: string;
  state: 'R' | 'S';
  start: string;
  cpu: number;
  mem: number;
  killable: boolean;
}

export interface CommandContext {
  fs: FileSystem;
  cwd: string;
  setCwd: (path: string) => void;
  user: string;
  setUser: (user: string) => void;
  sudo: boolean;
  out: (s: string) => void;
  err: (s: string) => void;
  rawOut: (s: string) => void;
  history: string[];
  installedPackages: Set<string>;
  persistPackages: () => void;
  network: NetworkLogic;
  onConfirm: (message: string) => Promise<boolean>;
  onOpenEditor: (path: string, initialContent: string) => Promise<string | null>;
  onOpenVimEditor: (path: string, initialContent: string) => Promise<string | null>;
  registry: Map<string, CommandDefinition>;
  /** Current SSH session info, if connected to a remote host. */
  sshSession: SSHSession | null;
  /** Connect to a remote host via SSH. */
  sshConnect: (host: string, user: string) => void;
  /** Disconnect from SSH, restoring local context. */
  sshDisconnect: () => void;
  /** Prompt user for input (password etc). Returns the entered string. */
  promptPassword: (prompt: string) => Promise<string>;
  /** Get the current hostname for prompt display. */
  hostname: string;
  /** Tracked systemd service states (e.g. sshd -> 'active'). */
  services: Map<string, 'active' | 'inactive'>;
  persistServices: () => void;
  /** Timestamp (ms) when the simulated OS booted (app first mounted). */
  bootTime: number;
  /** Whether current command execution has been interrupted (Ctrl+C / q). */
  isInterrupted: () => boolean;
  /** Clear pending interrupt after a command handles it. */
  clearInterrupt: () => void;
  /** Mark command as interactive/live (used by top). */
  setLiveMode: (active: boolean) => void;
  /** Read one pending keypress for live interactive commands. */
  readLiveInput: () => string | null;
  /** Snapshot of current process table. */
  getProcesses: () => ProcessInfo[];
  /** Send a signal to a PID; true on success. */
  killProcess: (pid: number) => boolean;
  /** Last command exit status (for $? semantics). */
  lastExitCode: number;
  /** Set shell exit code explicitly (e.g., interactive interrupt -> 130). */
  setExitCode: (code: number) => void;
  /** Get environment variable value by key. */
  getEnvVar: (key: string) => string | undefined;
  /** Set/update environment variable key=value. */
  setEnvVar: (key: string, value: string) => void;
  /** Get current environment as key/value entries. */
  getEnvEntries: () => Array<[string, string]>;
  /** Output channel mode for this invocation. */
  outputMode?: 'terminal' | 'pipe';
  /** Read current shell aliases. */
  getAliases: () => Record<string, { cmd: string; prependArgs: string[] }>;
  /** Define/update one shell alias. */
  setAlias: (name: string, value: { cmd: string; prependArgs: string[] }) => void;
  /** Remove one shell alias. Returns true if removed. */
  removeAlias: (name: string) => boolean;
  /** Trigger a full reboot cycle in the UI state machine. */
  requestReboot: () => void;
  /** Append a line to the simulated system journal. */
  addJournalEntry: (entry: string) => void;
  /** Read journal lines in chronological order. */
  getJournalEntries: () => string[];
  /** Trigger full local reset and reload. */
  requestFactoryReset: () => void;
  /** Set the active guided tutorial mode. */
  setTutorialMode: (mode: TutorialCartridge | null) => void;
  /** Get active tutorial mode. */
  getTutorialMode: () => TutorialCartridge | null;
  /** Read current virtual hardware state. */
  getHardwareState: () => HardwareState;
  /** Trigger a real browser file download. */
  triggerDownload: (filename: string, content: string) => void;
  /** Open a browser file picker; resolves with file text or null if cancelled. */
  triggerUpload: () => Promise<string | null>;
}

export interface CommandDefinition {
  name: string;
  execute: (args: string[], ctx: CommandContext) => Promise<void>;
  man: string;
  /** If set, command is only available when this package name is in installedPackages. */
  requiresPackage?: string;
}
