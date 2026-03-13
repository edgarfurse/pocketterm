import type { CommandDefinition, CommandContext } from './types';
import { sleep } from './types';

function extractStdin(args: string[]): { cleanArgs: string[]; stdin: string | null } {
  const stdinArg = args.find((a) => a.startsWith('__stdin__:'));
  const cleanArgs = args.filter((a) => !a.startsWith('__stdin__:'));
  const stdin = stdinArg ? stdinArg.slice('__stdin__:'.length) : null;
  return { cleanArgs, stdin };
}

function readFileChecked(ctx: CommandContext, path: string, label: string): string | null {
  const resolved = ctx.fs.resolvePath(ctx.cwd, path);
  const node = ctx.fs.getNode(resolved);
  if (!node) { ctx.err(`${label}: ${path}: No such file or directory`); return null; }
  if (node.type === 'directory') { ctx.err(`${label}: ${path}: Is a directory`); return null; }
  const effectiveUser = ctx.sudo ? 'root' : ctx.user;
  const content = ctx.fs.readFile(resolved, effectiveUser);
  if (content === null) { ctx.err(`${label}: ${path}: Permission denied`); return null; }
  return content;
}

function toLogicalLines(content: string): string[] {
  if (content.length === 0) return [];
  const lines = content.split('\n');
  if (content.endsWith('\n')) return lines.slice(0, -1);
  return lines;
}

const cat: CommandDefinition = {
  name: 'cat',
  async execute(args, ctx) {
    const { cleanArgs, stdin } = extractStdin(args);
    const files = cleanArgs.filter((a) => !a.startsWith('-'));
    if (files.length === 0 && stdin === null) { ctx.err('cat: missing operand'); return; }
    if (stdin !== null && files.length === 0) {
      ctx.out(stdin);
      return;
    }
    for (const file of files) {
      const resolved = ctx.fs.resolvePath(ctx.cwd, file);
      if (resolved === '/proc/uptime') {
        const uptimeSeconds = Math.max(0, (Date.now() - ctx.bootTime) / 1000);
        const idleSeconds = uptimeSeconds * 3.7;
        ctx.out(`${uptimeSeconds.toFixed(2)} ${idleSeconds.toFixed(2)}`);
        continue;
      }
      const content = readFileChecked(ctx, file, 'cat');
      if (content !== null) ctx.out(content);
    }
  },
  man: `CAT(1)                       User Commands                       CAT(1)

NAME
       cat - concatenate files and print on standard output

SYNOPSIS
       cat [FILE]...

DESCRIPTION
       Concatenate FILE(s) and print to standard output. The name comes from
       "concatenate" - joining files together - but it is most often used to
       view a single file's contents.

       If the target is a directory, cat reports: "Is a directory".

EXAMPLES
       cat /etc/hosts              View the hosts file.
       cat /etc/os-release         View Rocky Linux version info.
       cat file1 file2             Print file1 then file2.
       cat ../../etc/resolv.conf   Relative path from /home/guest.

SEE ALSO
       head(1), tail(1), less(1)`,
};

const grep: CommandDefinition = {
  name: 'grep',
  async execute(args, ctx) {
    const { cleanArgs, stdin } = extractStdin(args);
    const flags = cleanArgs.filter((a) => a.startsWith('-')).join('');
    const caseI = flags.includes('i');
    const lineN = flags.includes('n');
    const countOnly = flags.includes('c');
    const invert = flags.includes('v');
    const nonFlags = cleanArgs.filter((a) => !a.startsWith('-'));
    const pattern = nonFlags[0];
    const filePath = nonFlags[1];
    if (!pattern) { ctx.err('Usage: grep [OPTION]... PATTERN [FILE]'); return; }

    let content: string | null = null;
    if (filePath) {
      content = readFileChecked(ctx, filePath, 'grep');
    } else if (stdin !== null) {
      content = stdin;
    } else {
      ctx.err('Usage: grep [OPTION]... PATTERN [FILE]');
      return;
    }
    if (content === null) return;
    const lines = toLogicalLines(content);
    const search = caseI ? pattern.toLowerCase() : pattern;
    let matchCount = 0;
    for (let i = 0; i < lines.length; i++) {
      const test = caseI ? lines[i].toLowerCase() : lines[i];
      const matches = test.includes(search);
      if (matches !== invert) {
        matchCount++;
        if (!countOnly) ctx.out(lineN ? `${i + 1}:${lines[i]}` : lines[i]);
      }
    }
    if (countOnly) ctx.out(String(matchCount));
  },
  man: `GREP(1)                      User Commands                     GREP(1)

NAME
       grep - print lines that match patterns

SYNOPSIS
       grep [OPTION]... PATTERN [FILE]

DESCRIPTION
       grep searches for PATTERN in each FILE. It prints each line that
       contains a match. grep is one of the most essential tools for
       filtering text.

       The PATTERN is a simple string match (not full regex in this shell).
       grep can read from a file or from piped stdin.
       In PocketTerm, an unterminated final text chunk is treated as a line.

OPTIONS
       -i     Ignore case distinctions in both PATTERN and input.
       -n     Prefix each line with its line number.
       -c     Print only a count of matching lines.
       -v     Invert the match: print lines that do NOT match.

EXAMPLES
       grep root /etc/passwd              Find lines containing "root".
       cat /etc/passwd | grep root        Same, using a pipe.
       grep -i rocky /etc/os-release      Case-insensitive search.
       grep -n nameserver /etc/resolv.conf Show line numbers.
       grep -c guest /etc/passwd          Count matching lines.

SEE ALSO
       cat(1), find(1), wc(1)`,
};

const head: CommandDefinition = {
  name: 'head',
  async execute(args, ctx) {
    const { cleanArgs, stdin } = extractStdin(args);
    let count = 10;
    let filePath: string | undefined;
    for (let i = 0; i < cleanArgs.length; i++) {
      if (cleanArgs[i] === '-n' && cleanArgs[i + 1]) {
        const n = parseInt(cleanArgs[++i], 10);
        if (!isNaN(n)) count = n;
      } else if (!cleanArgs[i].startsWith('-')) {
        filePath = cleanArgs[i];
      }
    }
    let content: string | null = null;
    if (filePath) {
      content = readFileChecked(ctx, filePath, 'head');
    } else if (stdin !== null) {
      content = stdin;
    } else {
      ctx.err('head: missing operand');
      return;
    }
    if (content === null) return;
    const lines = content.split('\n');
    for (let i = 0; i < Math.min(count, lines.length); i++) {
      ctx.out(lines[i]);
    }
  },
  man: `HEAD(1)                      User Commands                     HEAD(1)

NAME
       head - output the first part of files

SYNOPSIS
       head [-n count] [FILE]

DESCRIPTION
       Print the first 10 lines of FILE to standard output. With -n, print
       the first count lines instead. Useful for peeking at the beginning
       of log files or configuration files without reading everything.

OPTIONS
       -n count
              Print the first count lines (default 10).

EXAMPLES
       head /var/log/messages        Show first 10 lines of syslog.
       head -n 3 /etc/passwd         Show first 3 lines.

SEE ALSO
       tail(1), cat(1)`,
};

const tail: CommandDefinition = {
  name: 'tail',
  async execute(args, ctx) {
    const { cleanArgs, stdin } = extractStdin(args);
    const follow = cleanArgs.includes('-f');
    let count = 10;
    let filePath: string | undefined;
    for (let i = 0; i < cleanArgs.length; i++) {
      if (cleanArgs[i] === '-n' && cleanArgs[i + 1]) {
        const n = parseInt(cleanArgs[++i], 10);
        if (!isNaN(n)) count = n;
      } else if (!cleanArgs[i].startsWith('-')) {
        filePath = cleanArgs[i];
      }
    }
    let content: string | null = null;
    if (filePath) {
      content = readFileChecked(ctx, filePath, 'tail');
    } else if (stdin !== null) {
      content = stdin;
    } else {
      ctx.err('tail: missing operand');
      return;
    }
    if (content === null) return;
    const lines = content.split('\n');
    const hasTrailingNewline = content.endsWith('\n') && lines[lines.length - 1] === '';
    const meaningful = hasTrailingNewline ? lines.slice(0, -1) : lines;
    const start = Math.max(0, meaningful.length - count);
    for (let i = start; i < meaningful.length; i++) {
      ctx.out(meaningful[i]);
    }

    if (!follow) return;
    if (!filePath) return;

    const resolvedPath = ctx.fs.resolvePath(ctx.cwd, filePath);
    const secureLog = resolvedPath === '/var/log/secure';
    const randomIp = () => `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
    const ts = () => {
      const d = new Date();
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, ' ')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    };

    ctx.setLiveMode(true);
    try {
      while (!ctx.isInterrupted()) {
        const waitMs = 3000 + Math.floor(Math.random() * 2000);
        await sleep(waitMs);
        if (ctx.isInterrupted()) break;
        let newLine = '';
        if (secureLog) {
          const users = ['root', 'admin', 'oracle', 'postgres'];
          const user = users[Math.floor(Math.random() * users.length)];
          newLine = `${ts()} pocket-term sshd[${Math.floor(Math.random() * 7000) + 1000}]: Failed password for ${user} from ${randomIp()} port 22 ssh2`;
        } else {
          newLine = `${ts()} pocket-term tail[${Math.floor(Math.random() * 9000) + 1000}]: monitored update on ${resolvedPath}`;
        }
        ctx.out(newLine);

        // Persist streamed lines back into the watched file, so future tail/less reads include them.
        const existing = ctx.fs.readFile(resolvedPath, 'root') ?? '';
        const next = existing.endsWith('\n') || existing.length === 0
          ? `${existing}${newLine}\n`
          : `${existing}\n${newLine}\n`;
        ctx.fs.writeFile(resolvedPath, next, 'root', true);
      }
    } finally {
      if (ctx.isInterrupted()) ctx.setExitCode(130);
      ctx.clearInterrupt();
      ctx.setLiveMode(false);
    }
  },
  man: `TAIL(1)                      User Commands                     TAIL(1)

NAME
       tail - output the last part of files

SYNOPSIS
       tail [-n count] [-f] [FILE]

DESCRIPTION
       Print the last 10 lines of FILE to standard output. With -n, print
       the last count lines. Essential for checking the end of log files
       to see recent events.

OPTIONS
       -n count
              Print the last count lines (default 10).
       -f
              Output appended data as the file grows.

EXAMPLES
       tail /var/log/messages         Show last 10 lines of syslog.
       tail -n 3 /var/log/messages    Show last 3 lines.
       tail -f /var/log/secure        Follow security log in real time.

SEE ALSO
       head(1), cat(1)`,
};

const wc: CommandDefinition = {
  name: 'wc',
  async execute(args, ctx) {
    const { cleanArgs, stdin } = extractStdin(args);
    let showLines = false;
    let showWords = false;
    let showBytes = false;
    const positional: string[] = [];
    for (const arg of cleanArgs) {
      if (arg === '--lines') {
        showLines = true;
        continue;
      }
      if (arg === '--words') {
        showWords = true;
        continue;
      }
      if (arg === '--bytes') {
        showBytes = true;
        continue;
      }
      if (arg.startsWith('--')) {
        ctx.err(`wc: unrecognized option '${arg}'`);
        ctx.setExitCode(1);
        return;
      }
      if (arg.startsWith('-') && arg.length > 1) {
        for (const ch of arg.slice(1)) {
          if (ch === 'l') showLines = true;
          else if (ch === 'w') showWords = true;
          else if (ch === 'c') showBytes = true;
          else {
            ctx.err(`wc: invalid option -- '${ch}'`);
            ctx.setExitCode(1);
            return;
          }
        }
        continue;
      }
      positional.push(arg);
    }
    if (!showLines && !showWords && !showBytes) {
      showLines = true;
      showWords = true;
      showBytes = true;
    }

    const explicitInputs = positional.length > 0;
    const inputSpecs = explicitInputs ? positional : ['-'];
    if (!explicitInputs && stdin === null) {
      ctx.err('wc: missing operand');
      ctx.setExitCode(1);
      return;
    }

    const formatCounts = (lineCount: number, wordCount: number, byteCount: number, label = ''): string => {
      const parts: string[] = [];
      if (showLines) parts.push(String(lineCount));
      if (showWords) parts.push(String(wordCount));
      if (showBytes) parts.push(String(byteCount));
      return label ? `${parts.join(' ')} ${label}` : parts.join(' ');
    };

    let totalLines = 0;
    let totalWords = 0;
    let totalBytes = 0;
    let rendered = 0;

    for (const spec of inputSpecs) {
      let content: string | null = null;
      let label = '';
      if (spec === '-') {
        if (stdin === null) {
          ctx.err('wc: -: No such file or directory');
          ctx.setExitCode(1);
          continue;
        }
        content = stdin;
      } else {
        content = readFileChecked(ctx, spec, 'wc');
        label = spec;
      }
      if (content === null) {
        ctx.setExitCode(1);
        continue;
      }

      // PocketTerm line model: final unterminated text counts as a line.
      const lineCount = toLogicalLines(content).length;
      const wordCount = content.split(/\s+/).filter(Boolean).length;
      const byteCount = new TextEncoder().encode(content).length;

      totalLines += lineCount;
      totalWords += wordCount;
      totalBytes += byteCount;
      rendered++;
      ctx.out(formatCounts(lineCount, wordCount, byteCount, label));
    }

    if (rendered > 1) {
      ctx.out(formatCounts(totalLines, totalWords, totalBytes, 'total'));
    }
  },
  man: `WC(1)                        User Commands                       WC(1)

NAME
       wc - print newline, word, and byte counts for each file

SYNOPSIS
       wc [OPTION]... [FILE]...

DESCRIPTION
       Print line, word, and byte counts for each FILE. A word is a non-zero
       length sequence of characters delimited by white space.
       In PocketTerm, an unterminated final text chunk is counted as a line
       to keep interactive pipeline behavior intuitive.

OPTIONS
       -l     Print only the newline (line) count.
       -w     Print only the word count.
       -c     Print only the byte count.

EXAMPLES
       wc /etc/passwd              Show lines, words, bytes.
       wc /etc/hosts               Count lines in hosts file.

SEE ALSO
       grep(1), cat(1)`,
};

const echo: CommandDefinition = {
  name: 'echo',
  async execute(args, ctx) {
    ctx.out(args.join(' '));
  },
  man: `ECHO(1)                      User Commands                     ECHO(1)

NAME
       echo - display a line of text

SYNOPSIS
       echo [STRING]...

DESCRIPTION
       Write STRING(s) to standard output separated by spaces, followed by
       a newline. echo is one of the simplest and most commonly used commands,
       often used in shell scripts to print messages.

EXAMPLES
       echo Hello, world           Output: Hello, world
       echo one two three          Output: one two three

SEE ALSO
       printf(1), cat(1)`,
};

const less: CommandDefinition = {
  name: 'less',
  async execute(args, ctx) {
    const { cleanArgs, stdin } = extractStdin(args);
    const manPagerMode = cleanArgs.includes('--man-pager');
    const effectiveArgs = cleanArgs.filter((a) => a !== '--man-pager');
    const filePath = effectiveArgs.find((a) => !a.startsWith('-'));
    let content: string | null = null;
    if (filePath) {
      content = readFileChecked(ctx, filePath, 'less');
    } else if (stdin !== null) {
      content = stdin;
    } else {
      ctx.err('less: missing operand');
      return;
    }
    if (content === null) return;

    const lines = content.split('\n');
    const pageSize = 24;
    let offset = 0;
    let quit = false;

    const render = () => {
      ctx.rawOut('\x1b[2J\x1b[H');
      const page = lines.slice(offset, offset + pageSize);
      for (const l of page) ctx.out(l);
      const end = offset + pageSize >= lines.length;
      const percent = lines.length === 0 ? 100 : Math.min(100, Math.floor(((offset + page.length) / lines.length) * 100));
      const status = end
        ? `(END) ${percent}%  [q:quit j/k:line space/b:page g/G:top/bot]`
        : `:${percent}%  [q:quit j/k:line space/b:page g/G:top/bot]`;
      ctx.rawOut(`\x1b[7m${status}\x1b[0m`);
    };

    const maxOffset = () => Math.max(0, lines.length - pageSize);
    const clamp = (n: number) => Math.max(0, Math.min(maxOffset(), n));

    ctx.setLiveMode(true);
    try {
      render();
      let idleTicks = 0;
      while (!ctx.isInterrupted() && !quit) {
        const key = ctx.readLiveInput();
        if (key === null) {
          idleTicks++;
          if (manPagerMode && idleTicks >= 4) {
            quit = true;
            continue;
          }
          await sleep(50);
          continue;
        }
        idleTicks = 0;
        switch (key) {
          case 'q':
            quit = true;
            break;
          case 'j':
          case '\x1b[B':
            offset = clamp(offset + 1);
            render();
            break;
          case 'k':
          case '\x1b[A':
            offset = clamp(offset - 1);
            render();
            break;
          case ' ':
            offset = clamp(offset + pageSize);
            render();
            break;
          case 'b':
            offset = clamp(offset - pageSize);
            render();
            break;
          case 'g':
            offset = 0;
            render();
            break;
          case 'G':
            offset = maxOffset();
            render();
            break;
          default:
            break;
        }
      }
    } finally {
      if (ctx.isInterrupted()) ctx.setExitCode(130);
      ctx.clearInterrupt();
      ctx.setLiveMode(false);
      ctx.rawOut('\x1b[2J\x1b[H');
    }
  },
  man: `LESS(1)                      User Commands                     LESS(1)

NAME
       less - opposite of more

SYNOPSIS
       less [FILE]

DESCRIPTION
       less is a pager that displays file content one screen at a time.
       This simulation shows the first page and waits for q/Ctrl+C to exit.

EXAMPLES
       less /etc/passwd
       less /var/log/messages

SEE ALSO
       more(1), cat(1), tail(1)`,
};

export const textOpsCommands: CommandDefinition[] = [cat, grep, head, tail, wc, echo, less];
