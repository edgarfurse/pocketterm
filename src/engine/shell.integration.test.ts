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
});
