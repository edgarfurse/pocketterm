import { beforeEach, describe, expect, it } from 'vitest';
import { FileSystem } from './fileSystem';
import { NetworkLogic } from './networkLogic';
import { Shell } from './shell';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('shell package path integration', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    });
  });

  it('supports dnf install git then which/command -v path parity', async () => {
    const outputs: string[] = [];
    const shell = new Shell(
      new FileSystem('guest'),
      new NetworkLogic(),
      (text) => outputs.push(text),
      async () => true,
      async () => null,
      async () => null,
      () => {},
      async () => 'password',
      () => {},
      () => {},
      null,
    );

    let start = outputs.length;
    await shell.execute('sudo dnf install git');
    const installOut = outputs.slice(start).join('');
    expect(installOut).toContain('Installed: git.x86_64');
    expect(installOut).toContain('Complete!');

    start = outputs.length;
    await shell.execute('which git');
    const whichOut = outputs.slice(start).join('');
    expect(whichOut).toContain('/usr/bin/git');

    start = outputs.length;
    await shell.execute('command -v git');
    const commandVOut = outputs.slice(start).join('');
    expect(commandVOut).toContain('/usr/bin/git');
    expect(shell.getLastExitCode()).toBe(0);
  });

  it('supports env defaults, cd -, alias ll, and permission fidelity', async () => {
    const outputs: string[] = [];
    const shell = new Shell(
      new FileSystem('guest'),
      new NetworkLogic(),
      (text) => outputs.push(text),
      async () => true,
      async () => null,
      async () => null,
      () => {},
      async () => 'password',
      () => {},
      () => {},
      null,
    );

    let start = outputs.length;
    await shell.execute('echo $HOME $USER $SHELL $PATH');
    const envOut = outputs.slice(start).join('');
    expect(envOut).toContain('/home/guest guest /usr/bin/bash /usr/bin:/bin:/usr/local/bin');

    start = outputs.length;
    await shell.execute('ll');
    const llOut = outputs.slice(start).join('');
    expect(llOut).toContain('.bashrc');

    start = outputs.length;
    await shell.execute('type ll');
    const typeAliasOut = outputs.slice(start).join('');
    expect(typeAliasOut).toContain("ll is aliased to 'ls -la'");

    start = outputs.length;
    await shell.execute('type cd');
    const typeBuiltinOut = outputs.slice(start).join('');
    expect(typeBuiltinOut).toContain('cd is a shell builtin');

    start = outputs.length;
    await shell.execute('cd /tmp');
    await shell.execute('echo $OLDPWD');
    const oldPwdOut = outputs.slice(start).join('');
    expect(oldPwdOut).toContain('/home/guest');

    start = outputs.length;
    await shell.execute('cd -');
    const cdDashOut = outputs.slice(start).join('');
    expect(cdDashOut).toContain('/home/guest');
    expect(shell.getCwd()).toBe('/home/guest');

    await shell.execute('cd ~');
    expect(shell.getCwd()).toBe('/home/guest');

    start = outputs.length;
    await shell.execute('ls /root');
    const lsDeniedOut = outputs.slice(start).join('');
    expect(lsDeniedOut).toContain('bash: ls: /root: Permission denied');

    start = outputs.length;
    await shell.execute('cd /root');
    const cdDeniedOut = outputs.slice(start).join('');
    expect(cdDeniedOut).toContain('bash: cd: /root: Permission denied');

    start = outputs.length;
    await shell.execute("alias ll='ls -l'");
    await shell.execute('type ll');
    const aliasOverrideOut = outputs.slice(start).join('');
    expect(aliasOverrideOut).toContain("ll is aliased to 'ls -l'");

    start = outputs.length;
    await shell.execute('unalias ll');
    await shell.execute('type ll');
    const aliasRemovedOut = outputs.slice(start).join('');
    expect(aliasRemovedOut).toContain('bash: type: ll: not found');
  });

  it('normalizes repeated slashes and dot-only paths for cd', async () => {
    const outputs: string[] = [];
    const shell = new Shell(
      new FileSystem('guest'),
      new NetworkLogic(),
      (text) => outputs.push(text),
      async () => true,
      async () => null,
      async () => null,
      () => {},
      async () => 'password',
      () => {},
      () => {},
      null,
    );

    await shell.execute('cd ///home//guest/');
    expect(shell.getCwd()).toBe('/home/guest');

    await shell.execute('cd .');
    expect(shell.getCwd()).toBe('/home/guest');

    await shell.execute('cd ././.');
    expect(shell.getCwd()).toBe('/home/guest');

    const start = outputs.length;
    await shell.execute('cat /etc/shells');
    const shellsOut = outputs.slice(start).join('');
    expect(shellsOut).toContain('/bin/sh');
    expect(shellsOut).toContain('/usr/bin/bash');
    expect(shellsOut).not.toContain('\n ');
  });

  it('persists exported environment variables across shell recreation', async () => {
    const outputs: string[] = [];
    const shell1 = new Shell(
      new FileSystem('guest'),
      new NetworkLogic(),
      (text) => outputs.push(text),
      async () => true,
      async () => null,
      async () => null,
      () => {},
      async () => 'password',
      () => {},
      () => {},
      null,
    );
    await shell1.execute('export EDITOR=vim');

    const shell2 = new Shell(
      new FileSystem('guest'),
      new NetworkLogic(),
      (text) => outputs.push(text),
      async () => true,
      async () => null,
      async () => null,
      () => {},
      async () => 'password',
      () => {},
      () => {},
      null,
    );

    const start = outputs.length;
    await shell2.execute('echo $EDITOR');
    const editorOut = outputs.slice(start).join('');
    expect(editorOut).toContain('vim');
  });

  it('executes sh scripts sequentially and handles missing files', async () => {
    const outputs: string[] = [];
    const shell = new Shell(
      new FileSystem('guest'),
      new NetworkLogic(),
      (text) => outputs.push(text),
      async () => true,
      async () => null,
      async () => null,
      () => {},
      async () => 'password',
      () => {},
      () => {},
      null,
    );

    let start = outputs.length;
    await shell.execute('echo "ls" > test.sh');
    await shell.execute('sh test.sh');
    const shOut = outputs.slice(start).join('');
    expect(shOut).toContain('Documents');

    start = outputs.length;
    await shell.execute('sh missing.sh');
    const missingOut = outputs.slice(start).join('');
    expect(missingOut).toContain('sh: missing.sh: No such file or directory');
    expect(shell.getLastExitCode()).toBe(1);
  });

  it('supports script xtrace, set +e continuation, and line-numbered failures', async () => {
    const outputs: string[] = [];
    const shell = new Shell(
      new FileSystem('guest'),
      new NetworkLogic(),
      (text) => outputs.push(text),
      async () => true,
      async () => null,
      async () => null,
      () => {},
      async () => 'password',
      () => {},
      () => {},
      null,
    );

    await shell.execute('echo "falsecmd" > strict.sh');
    let start = outputs.length;
    await shell.execute('sh strict.sh');
    const strictOut = outputs.slice(start).join('');
    expect(strictOut).toContain('strict.sh:1: command exited with status 127');
    expect(shell.getLastExitCode()).toBe(127);

    await shell.execute('echo "set +e" > continue.sh');
    await shell.execute('echo "falsecmd" >> continue.sh');
    await shell.execute('echo "ls" >> continue.sh');
    start = outputs.length;
    await shell.execute('bash -x continue.sh');
    const continueOut = outputs.slice(start).join('');
    expect(continueOut).toContain('+ set +e');
    expect(continueOut).toContain('+ falsecmd');
    expect(continueOut).toContain('continue.sh:2: command exited with status 127');
    expect(continueOut).toContain('+ ls');
    expect(continueOut).toContain('Documents');
    expect(shell.getLastExitCode()).toBe(0);
  });

  it('exposes /proc/cpuinfo and /proc/meminfo for cat', async () => {
    const outputs: string[] = [];
    const shell = new Shell(
      new FileSystem('guest'),
      new NetworkLogic(),
      (text) => outputs.push(text),
      async () => true,
      async () => null,
      async () => null,
      () => {},
      async () => 'password',
      () => {},
      () => {},
      null,
    );

    let start = outputs.length;
    await shell.execute('cat /proc/cpuinfo');
    const cpuinfo = outputs.slice(start).join('');
    expect(cpuinfo).toContain('Virtualized PocketTerm CPU');

    start = outputs.length;
    await shell.execute('cat /proc/meminfo');
    const meminfo = outputs.slice(start).join('');
    expect(meminfo).toContain('MemTotal:');
    expect(meminfo).toContain('2097152 kB');

    start = outputs.length;
    await shell.execute('cat /proc/uptime');
    const uptime = outputs.slice(start).join('').trim();
    expect(uptime).toMatch(/^\d+\.\d{2}\s+\d+\.\d{2}$/);
  });

  it('formats wc counts correctly for piped input and wc -l regression', async () => {
    const outputs: string[] = [];
    const shell = new Shell(
      new FileSystem('guest'),
      new NetworkLogic(),
      (text) => outputs.push(text),
      async () => true,
      async () => null,
      async () => null,
      () => {},
      async () => 'password',
      () => {},
      () => {},
      null,
    );

    let start = outputs.length;
    await shell.execute('ls | wc -l');
    const lsWcOut = outputs.slice(start).join('').trim();
    expect(lsWcOut).toBe('1');

    start = outputs.length;
    await shell.execute('echo alpha beta gamma | wc -w');
    const wordsOut = outputs.slice(start).join('').trim();
    expect(wordsOut).toBe('3');

    start = outputs.length;
    await shell.execute('echo alpha beta gamma | wc -lw');
    const linesWordsOut = outputs.slice(start).join('').trim();
    expect(linesWordsOut).toBe('1 3');

    await shell.execute('echo alpha beta > one.txt');
    start = outputs.length;
    await shell.execute('cat one.txt | wc -l');
    const trailingNewlineOut = outputs.slice(start).join('').trim();
    expect(trailingNewlineOut).toBe('1');

    await shell.execute('echo one > a.txt');
    await shell.execute('echo two words > b.txt');
    start = outputs.length;
    await shell.execute('wc -lw a.txt b.txt');
    const multiFileOut = outputs.slice(start).join('');
    expect(multiFileOut).toContain('a.txt');
    expect(multiFileOut).toContain('b.txt');
    expect(multiFileOut).toContain('total');

    await shell.execute('echo foo > nonl.txt');
    await shell.execute('echo bar > withnl.txt');
    start = outputs.length;
    await shell.execute('cat nonl.txt | grep -c foo');
    const grepCountUnterminated = outputs.slice(start).join('').trim();
    expect(grepCountUnterminated).toBe('1');

  });
});
