import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { FileSystem } from '../engine/fileSystem';
import { NetworkLogic } from '../engine/networkLogic';
import { Shell } from '../engine/shell';
import { NanoEditor } from './NanoEditor';
import { VimEditor } from './VimEditor';
import { clearPocketTermStorage } from '../engine/storage';
import type { TutorialCartridge } from '../engine/tutorials';

function redrawLine(term: Terminal, prompt: string, line: string, cursorIdx: number) {
  term.write('\r' + prompt + line + '\x1b[K');
  const moveBack = line.length - cursorIdx;
  if (moveBack > 0) {
    term.write(`\x1b[${moveBack}D`);
  }
  term.scrollToBottom();
}

interface TerminalUIProps {
  initialUser?: string;
  onRebootRequested?: () => void;
  onFactoryResetRequested?: () => void;
  preludeLines?: string[];
  initialTutorialMode?: TutorialCartridge | null;
}

export function TerminalUI({
  initialUser = 'guest',
  onRebootRequested,
  onFactoryResetRequested,
  preludeLines = [],
  initialTutorialMode = null,
}: TerminalUIProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [editorState, setEditorState] = useState<{
    kind: 'nano' | 'vim';
    path: string;
    content: string;
  } | null>(null);
  const [kernelPanic, setKernelPanic] = useState(false);
  const resolveConfirmRef = useRef<((value: boolean) => void) | null>(null);
  const resolveEditorRef = useRef<((value: string | null) => void) | null>(null);
  const resolvePasswordRef = useRef<((value: string) => void) | null>(null);
  const passwordBufferRef = useRef('');
  const shellRef = useRef<Shell | null>(null);
  const fsRef = useRef<FileSystem | null>(null);
  const currentLineRef = useRef('');
  const cursorIndexRef = useRef(0);
  const cwdRef = useRef('/home/guest');
  const tabStateRef = useRef<{ lastInput: string; count: number }>({ lastInput: '', count: 0 });

  const onOutput = useCallback((text: string) => {
    const term = terminalRef.current;
    if (term) {
      term.write(text);
      term.scrollToBottom();
    }
  }, []);

  const onConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const term = terminalRef.current;
      if (!term) {
        resolve(false);
        return;
      }
      term.write(`\r\n${message} [y/N] `);
      resolveConfirmRef.current = resolve;
      const result = window.confirm(message + '\n\nClick OK to proceed, Cancel to abort.');
      resolve(result);
      resolveConfirmRef.current = null;
    });
  }, []);

  const onOpenEditor = useCallback((path: string, initialContent: string): Promise<string | null> => {
    return new Promise((resolve) => {
      resolveEditorRef.current = resolve;
      setEditorState({ kind: 'nano', path, content: initialContent });
    });
  }, []);

  const onOpenVimEditor = useCallback((path: string, initialContent: string): Promise<string | null> => {
    return new Promise((resolve) => {
      resolveEditorRef.current = resolve;
      setEditorState({ kind: 'vim', path, content: initialContent });
    });
  }, []);

  const onKernelPanic = useCallback(() => {
    setKernelPanic(true);
  }, []);

  const onPasswordPrompt = useCallback((prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      const term = terminalRef.current;
      if (!term) { resolve(''); return; }
      term.write(prompt);
      passwordBufferRef.current = '';
      resolvePasswordRef.current = resolve;
    });
  }, []);

  const handleHardReboot = useCallback(() => {
    clearPocketTermStorage();
    window.location.reload();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const hostEl = containerRef.current;

    const fs = new FileSystem(initialUser);
    fsRef.current = fs;
    const network = new NetworkLogic();
    const term = new Terminal({
      cursorBlink: true,
      scrollback: 5000,
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        cursorAccent: '#1e1e1e',
      },
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 14,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(hostEl);

    const fitTerminal = () => {
      fitAddon.fit();
      term.scrollToBottom();
    };

    // Defer initial fit so the DOM has settled to its final layout dimensions.
    requestAnimationFrame(() => {
      fitTerminal();
      // Run a second fit after paint; avoids occasional half-row clipping on Chrome/macOS.
      setTimeout(fitTerminal, 0);
    });
    setTimeout(fitTerminal, 60);
    let disposed = false;
    if (typeof document !== 'undefined' && 'fonts' in document) {
      void (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(() => {
        if (!disposed) fitTerminal();
      });
    }

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    const shell = new Shell(
      fs,
      network,
      onOutput,
      onConfirm,
      onOpenEditor,
      onOpenVimEditor,
      onKernelPanic,
      onPasswordPrompt,
      () => {
        onRebootRequested?.();
      },
      () => {
        onFactoryResetRequested?.();
      },
      initialTutorialMode,
    );
    shellRef.current = shell;

    const prompt = shell.getPrompt();
    term.writeln('');
    for (const line of preludeLines) {
      term.writeln(line);
    }
    const activeTutorial = shell.getTutorialMode();
    if (activeTutorial) {
      const motd = fs.readFile('/etc/motd', 'root') ?? 'Welcome to PocketTerm.';
      for (const line of motd.split('\n').filter(Boolean)) {
        term.writeln(line);
      }
      term.writeln('');
      for (const line of activeTutorial.instructionBlock.split('\n')) {
        term.writeln(`\x1b[1;33m${line}\x1b[0m`);
      }
      term.writeln('');
    }
    term.write(prompt);
    term.scrollToBottom();
    currentLineRef.current = '';
    cursorIndexRef.current = 0;
    cwdRef.current = shell.getCwd();

    const handleData = async (data: string) => {
      if (shell.isPanicked()) return;

      // ── Password input mode ──
      if (resolvePasswordRef.current) {
        if (data === '\r' || data === '\n') {
          term.write('\r\n');
          const resolve = resolvePasswordRef.current;
          resolvePasswordRef.current = null;
          const pw = passwordBufferRef.current;
          passwordBufferRef.current = '';
          resolve(pw);
          return;
        }
        if (data === '\x7f' || data === '\b') {
          if (passwordBufferRef.current.length > 0) {
            passwordBufferRef.current = passwordBufferRef.current.slice(0, -1);
          }
          return;
        }
        if (data === '\x03') {
          term.write('\r\n');
          const resolve = resolvePasswordRef.current;
          resolvePasswordRef.current = null;
          passwordBufferRef.current = '';
          resolve('');
          return;
        }
        if (data >= ' ' && !data.startsWith('\x1b')) {
          passwordBufferRef.current += data;
        }
        return;
      }

      if (data !== '\t') {
        tabStateRef.current = { lastInput: '', count: 0 };
      }

      // ── Ctrl+C ──
      if (data === '\x03') {
        if (shell.isCommandRunning()) {
          shell.requestInterrupt();
          term.write('^C\r\n');
          term.scrollToBottom();
          return;
        }
        term.write('^C\r\n');
        currentLineRef.current = '';
        cursorIndexRef.current = 0;
        term.write(shell.getPrompt());
        term.scrollToBottom();
        shell.resetHistoryIndex();
        return;
      }

      // ── q to quit live mode (top) ──
      if (data === 'q' && shell.isLiveMode()) {
        shell.requestInterrupt();
        return;
      }

      // ── Forward interactive keystrokes to live commands (less/top/htop) ──
      if (shell.isCommandRunning() && shell.isLiveMode()) {
        shell.pushLiveInput(data);
        return;
      }

      // ── Ctrl+L (clear screen, preserve current line) ──
      if (data === '\x0c') {
        term.clear();
        redrawLine(term, shell.getPrompt(), currentLineRef.current, cursorIndexRef.current);
        return;
      }

      // ── Ctrl+Z ──
      if (data === '\x1a') {
        term.write('^Z\r\n[1]+  Stopped\r\n');
        currentLineRef.current = '';
        cursorIndexRef.current = 0;
        term.write(shell.getPrompt());
        term.scrollToBottom();
        return;
      }

      // ── Ctrl+A / Home: cursor to start ──
      if (data === '\x01' || data === '\x1b[H' || data === '\x1bOH' || data === '\x1b[1~') {
        if (cursorIndexRef.current > 0) {
          term.write(`\x1b[${cursorIndexRef.current}D`);
          cursorIndexRef.current = 0;
        }
        return;
      }

      // ── Ctrl+E / End: cursor to end ──
      if (data === '\x05' || data === '\x1b[F' || data === '\x1bOF' || data === '\x1b[4~') {
        const moveForward = currentLineRef.current.length - cursorIndexRef.current;
        if (moveForward > 0) {
          term.write(`\x1b[${moveForward}C`);
          cursorIndexRef.current = currentLineRef.current.length;
        }
        return;
      }

      // ── Ctrl+U: kill line (clear from cursor to start) ──
      if (data === '\x15') {
        if (cursorIndexRef.current > 0) {
          currentLineRef.current = currentLineRef.current.slice(cursorIndexRef.current);
          cursorIndexRef.current = 0;
          redrawLine(term, shell.getPrompt(), currentLineRef.current, 0);
        }
        return;
      }

      // ── Ctrl+K: kill to end (clear from cursor to end) ──
      if (data === '\x0b') {
        currentLineRef.current = currentLineRef.current.slice(0, cursorIndexRef.current);
        redrawLine(term, shell.getPrompt(), currentLineRef.current, cursorIndexRef.current);
        return;
      }

      // ── Ctrl+W: delete word backward ──
      if (data === '\x17') {
        if (cursorIndexRef.current > 0) {
          const before = currentLineRef.current.slice(0, cursorIndexRef.current);
          const after = currentLineRef.current.slice(cursorIndexRef.current);
          const trimmed = before.replace(/\s*\S+\s*$/, '');
          currentLineRef.current = trimmed + after;
          cursorIndexRef.current = trimmed.length;
          redrawLine(term, shell.getPrompt(), currentLineRef.current, cursorIndexRef.current);
        }
        return;
      }

      // ── Delete key ──
      if (data === '\x1b[3~') {
        if (cursorIndexRef.current < currentLineRef.current.length) {
          const line = currentLineRef.current;
          currentLineRef.current = line.slice(0, cursorIndexRef.current) + line.slice(cursorIndexRef.current + 1);
          redrawLine(term, shell.getPrompt(), currentLineRef.current, cursorIndexRef.current);
        }
        return;
      }

      // ── Backspace ──
      if (data === '\x7f' || data === '\b') {
        if (cursorIndexRef.current > 0) {
          const line = currentLineRef.current;
          cursorIndexRef.current--;
          currentLineRef.current = line.slice(0, cursorIndexRef.current) + line.slice(cursorIndexRef.current + 1);
          redrawLine(term, shell.getPrompt(), currentLineRef.current, cursorIndexRef.current);
        }
        return;
      }

      // ── Tab ──
      if (data === '\t') {
        const line = currentLineRef.current;
        const leadingWsMatch = line.match(/^\s*/);
        const leadingWs = leadingWsMatch ? leadingWsMatch[0] : '';
        const trimmedLeft = line.slice(leadingWs.length);
        const commandContext = trimmedLeft.length > 0 && !trimmedLeft.includes(' ');

        // Command completion context (first token only; leading spaces allowed)
        if (commandContext) {
          const { matches, commonPrefix } = shell.getCommandCompletions(trimmedLeft);
          if (matches.length === 0) return;

          // Single match => complete and append space
          if (matches.length === 1) {
            const completed = leadingWs + matches[0] + ' ';
            currentLineRef.current = completed;
            cursorIndexRef.current = completed.length;
            redrawLine(term, shell.getPrompt(), currentLineRef.current, cursorIndexRef.current);
            tabStateRef.current = { lastInput: '', count: 0 };
            return;
          }

          // Multiple matches => complete to longest common prefix if possible
          if (trimmedLeft.length < commonPrefix.length) {
            const completed = leadingWs + commonPrefix;
            currentLineRef.current = completed;
            cursorIndexRef.current = completed.length;
            redrawLine(term, shell.getPrompt(), currentLineRef.current, cursorIndexRef.current);
            tabStateRef.current = { lastInput: '', count: 0 };
            return;
          }

          // Already at common prefix => list matches on second consecutive Tab
          const sameInput = tabStateRef.current.lastInput === trimmedLeft;
          const count = sameInput ? tabStateRef.current.count + 1 : 1;
          tabStateRef.current = { lastInput: trimmedLeft, count };

          if (count >= 2) {
            term.write('\r\n');
            const width = Math.max(...matches.map((m) => m.length)) + 2;
            const cols = Math.max(1, Math.floor((term.cols || 80) / width));
            for (let i = 0; i < matches.length; i += cols) {
              const row = matches.slice(i, i + cols).map((m) => m.padEnd(width)).join('');
              term.write(row.trimEnd() + '\r\n');
            }
            redrawLine(term, shell.getPrompt(), currentLineRef.current, cursorIndexRef.current);
            tabStateRef.current = { lastInput: trimmedLeft, count: 0 };
          }
          return;
        }

        // Existing VFS path completion fallback
        const completed = shell.tabComplete(line);
        if (completed !== null) {
          currentLineRef.current = completed;
          cursorIndexRef.current = completed.length;
          redrawLine(term, shell.getPrompt(), currentLineRef.current, cursorIndexRef.current);
          tabStateRef.current = { lastInput: '', count: 0 };
        }
        return;
      }

      // ── Arrow Up (history) ──
      if (data === '\x1b[A' || data === '\x1bOA') {
        const prev = shell.historyUp();
        if (prev !== null) {
          currentLineRef.current = prev;
          cursorIndexRef.current = prev.length;
          redrawLine(term, shell.getPrompt(), currentLineRef.current, cursorIndexRef.current);
        }
        return;
      }

      // ── Arrow Down (history) ──
      if (data === '\x1b[B' || data === '\x1bOB') {
        const next = shell.historyDown();
        const line = next ?? '';
        currentLineRef.current = line;
        cursorIndexRef.current = line.length;
        redrawLine(term, shell.getPrompt(), currentLineRef.current, cursorIndexRef.current);
        return;
      }

      // ── Arrow Left ──
      if (data === '\x1b[D' || data === '\x1bOD') {
        if (cursorIndexRef.current > 0) {
          cursorIndexRef.current--;
          term.write('\x1b[D');
        }
        return;
      }

      // ── Arrow Right ──
      if (data === '\x1b[C' || data === '\x1bOC') {
        if (cursorIndexRef.current < currentLineRef.current.length) {
          cursorIndexRef.current++;
          term.write('\x1b[C');
        }
        return;
      }

      // ── Enter ──
      if (data === '\r' || data === '\n') {
        const line = currentLineRef.current;
        term.write('\r\n');
        currentLineRef.current = '';
        cursorIndexRef.current = 0;
        await shell.execute(line);

        if (!shell.isPanicked()) {
          cwdRef.current = shell.getCwd();
          term.write(shell.getPrompt());
          term.scrollToBottom();
        }
        return;
      }

      // ── Ignore unrecognized escape sequences ──
      if (data.startsWith('\x1b')) return;

      // ── Printable characters (insert at cursor position) ──
      if (data >= ' ') {
        const line = currentLineRef.current;
        currentLineRef.current = line.slice(0, cursorIndexRef.current) + data + line.slice(cursorIndexRef.current);
        cursorIndexRef.current += data.length;
        redrawLine(term, shell.getPrompt(), currentLineRef.current, cursorIndexRef.current);
      }
    };

    term.onData(handleData);

    const handleResize = () => fitTerminal();
    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => fitTerminal())
      : null;
    resizeObserver?.observe(hostEl);

    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();
      term.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      shellRef.current = null;
    };
  }, [initialUser, onOutput, onConfirm, onOpenEditor, onOpenVimEditor, onKernelPanic, onPasswordPrompt, onRebootRequested, onFactoryResetRequested, preludeLines, initialTutorialMode]);

  const handleEditorSave = useCallback((content: string) => {
    if (resolveEditorRef.current) {
      resolveEditorRef.current(content);
      resolveEditorRef.current = null;
    }
    setEditorState(null);
    // Re-fit terminal after editor closes so xterm recalculates dimensions
    requestAnimationFrame(() => fitAddonRef.current?.fit());
  }, []);

  const handleEditorCancel = useCallback(() => {
    if (resolveEditorRef.current) {
      resolveEditorRef.current(null);
      resolveEditorRef.current = null;
    }
    setEditorState(null);
    requestAnimationFrame(() => fitAddonRef.current?.fit());
  }, []);

  const handleWriteOut = useCallback((content: string): boolean => {
    if (!editorState || !fsRef.current) return false;
    const fs = fsRef.current;
    const user = fs.getCurrentUser();
    return fs.writeFile(editorState.path, content, user, user === 'root');
  }, [editorState]);

  return (
    <div className="w-full h-dvh flex flex-col bg-[#1e1e1e] relative overflow-hidden">
      <div
        ref={containerRef}
        className={`flex-1 w-full min-h-0 p-2 ${editorState ? 'invisible' : ''}`}
      />
      {editorState && (
        editorState.kind === 'nano' ? (
          <NanoEditor
            filePath={editorState.path}
            initialContent={editorState.content}
            onSave={handleEditorSave}
            onCancel={handleEditorCancel}
            onWriteOut={handleWriteOut}
          />
        ) : (
          <VimEditor
            filePath={editorState.path}
            initialContent={editorState.content}
            onSave={handleEditorSave}
            onCancel={handleEditorCancel}
            onWriteOut={handleWriteOut}
          />
        )
      )}
      {kernelPanic && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-6 z-50">
          <button
            onClick={handleHardReboot}
            className="px-6 py-3 bg-red-700 hover:bg-red-600 active:bg-red-800 text-white font-mono font-bold text-sm rounded border-2 border-red-500 shadow-lg shadow-red-900/50 transition-colors cursor-pointer select-none tracking-wide"
          >
            HARD REBOOT / REINSTALL OS
          </button>
        </div>
      )}
    </div>
  );
}
