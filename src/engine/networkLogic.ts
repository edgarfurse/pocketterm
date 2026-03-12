export interface SystemProbeSnapshot {
  online: boolean;
  cores: number;
  memoryGB: number;
  effectiveType: string;
  sourceIP: string;
  subnet: string;
  gateway: string;
  dns: string[];
  rxBytes: number;
  txBytes: number;
  rxPackets: number;
  txPackets: number;
}

function parseIP(ip: string): number[] | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return null;
  if (parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return parts;
}

function deriveHostOctet(seed: string, fallback = 100): number {
  if (!seed) return fallback;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return 20 + (hash % 200);
}

function probeBrowserSystem(): SystemProbeSnapshot {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const online = nav?.onLine ?? true;
  const cores = nav?.hardwareConcurrency ?? 4;
  const memoryGB = (nav as unknown as { deviceMemory?: number } | null)?.deviceMemory ?? 8;
  const effectiveType = ((nav as unknown as { connection?: { effectiveType?: string } } | null)?.connection?.effectiveType) ?? '4g';

  const seed = [
    String(cores),
    String(memoryGB),
    effectiveType,
    typeof performance !== 'undefined' ? String(Math.floor(performance.timeOrigin ?? Date.now())) : String(Date.now()),
  ].join('-');
  const hostOctet = deriveHostOctet(seed, 100);
  const sourceIP = `192.168.1.${hostOctet}`;
  const subnet = '192.168.1.0/24';
  const gateway = '192.168.1.1';
  const dns = ['8.8.8.8', '8.8.4.4'];

  // Start with plausible baseline transfer counters instead of zeros.
  const txPackets = 120 + (hostOctet % 50);
  const rxPackets = 180 + (hostOctet % 80);
  const txBytes = txPackets * 320;
  const rxBytes = rxPackets * 420;

  return { online, cores, memoryGB, effectiveType, sourceIP, subnet, gateway, dns, rxBytes, txBytes, rxPackets, txPackets };
}

/**
 * NetworkLogic is a browser-safe proxy networking model. It uses runtime probe
 * signals for baseline identity and tracks transfer counters for /proc/net/dev.
 */
export class NetworkLogic {
  private sourceIP: string;
  private sourceSubnet: string;
  private gateway: string;
  private dns: string[];
  private online: boolean;
  private rxBytes: number;
  private txBytes: number;
  private rxPackets: number;
  private txPackets: number;
  private onStatsChange: (() => void) | null = null;

  constructor(sourceIP: string = '192.168.1.100', sourceSubnet: string = '192.168.1.0/24') {
    const probe = probeBrowserSystem();
    this.sourceIP = sourceIP ?? probe.sourceIP;
    this.sourceSubnet = sourceSubnet ?? probe.subnet;
    this.gateway = probe.gateway;
    this.dns = probe.dns;
    this.online = probe.online;
    this.rxBytes = probe.rxBytes;
    this.txBytes = probe.txBytes;
    this.rxPackets = probe.rxPackets;
    this.txPackets = probe.txPackets;
  }

  private parseSubnet(subnet: string): { network: number[]; mask: number } | null {
    const [networkStr, maskStr] = subnet.split('/');
    const network = parseIP(networkStr);
    if (!network) return null;
    const mask = parseInt(maskStr, 10);
    if (Number.isNaN(mask) || mask < 0 || mask > 32) return null;
    return { network, mask };
  }

  private ipToNumber(parts: number[]): number {
    return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  }

  private isInSubnet(ipParts: number[], subnet: { network: number[]; mask: number }): boolean {
    const ipNum = this.ipToNumber(ipParts);
    const netNum = this.ipToNumber(subnet.network);
    const mask = subnet.mask === 0 ? 0 : ~((1 << (32 - subnet.mask)) - 1) >>> 0;
    return (ipNum & mask) === (netNum & mask);
  }

  private knownHosts: Set<string> = new Set(['10.0.0.50', '8.8.8.8', '8.8.4.4']);

  setOnStatsChange(cb: () => void): void {
    this.onStatsChange = cb;
  }

  private emitStatsChange(): void {
    this.onStatsChange?.();
  }

  getSourceIP(): string {
    return this.sourceIP;
  }

  getGateway(): string {
    return this.gateway;
  }

  getDns(): string[] {
    return [...this.dns];
  }

  getSubnet(): string {
    return this.sourceSubnet;
  }

  canReach(target: string): boolean {
    const normalized = target.toLowerCase();
    if (normalized === 'localhost' || normalized === '127.0.0.1') return true;
    if (normalized === this.sourceIP) return true;
    if (!this.online) return false;

    const targetParts = parseIP(normalized);
    if (!targetParts) {
      // Hostname targets are considered potentially reachable in proxy mode.
      return /^[a-z0-9.-]+$/.test(normalized);
    }

    const subnet = this.parseSubnet(this.sourceSubnet);
    if (!subnet) return false;
    if (this.isInSubnet(targetParts, subnet)) return true;
    return this.knownHosts.has(normalized);
  }

  setSource(ip: string, subnet: string): void {
    this.sourceIP = ip;
    this.sourceSubnet = subnet;
    this.emitStatsChange();
  }

  setAddressing(ip: string, subnet: string, gateway: string, dns: string[]): void {
    this.sourceIP = ip;
    this.sourceSubnet = subnet;
    this.gateway = gateway;
    this.dns = [...dns];
    this.emitStatsChange();
  }

  async hydrateAddressFromPublicIp(timeoutMs = 1200): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch('https://api.ipify.org?format=json', { signal: controller.signal });
      if (!response.ok) return false;
      const payload = await response.json() as { ip?: string };
      if (!payload.ip) return false;
      const host = deriveHostOctet(payload.ip, 100);
      this.setAddressing(`192.168.1.${host}`, '192.168.1.0/24', '192.168.1.1', this.dns);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  recordTransfer(txBytes: number, rxBytes: number): void {
    const boundedTx = Math.max(64, txBytes | 0);
    const boundedRx = Math.max(0, rxBytes | 0);
    this.txBytes += boundedTx;
    this.txPackets += 1;
    this.rxBytes += boundedRx;
    if (boundedRx > 0) this.rxPackets += 1;
    this.emitStatsChange();
  }

  formatProcNetDev(): string {
    const pad = (v: number) => String(v).padStart(9, ' ');
    return [
      'Inter-|   Receive                                                |  Transmit',
      ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed',
      `    lo:${pad(2048)}${pad(16)}${pad(0)}${pad(0)}${pad(0)}${pad(0)}${pad(0)}${pad(0)}${pad(2048)}${pad(16)}${pad(0)}${pad(0)}${pad(0)}${pad(0)}${pad(0)}${pad(0)}`,
      `  eth0:${pad(this.rxBytes)}${pad(this.rxPackets)}${pad(0)}${pad(0)}${pad(0)}${pad(0)}${pad(0)}${pad(0)}${pad(this.txBytes)}${pad(this.txPackets)}${pad(0)}${pad(0)}${pad(0)}${pad(0)}${pad(0)}${pad(0)}`,
      '',
    ].join('\n');
  }

  formatIfcfgEth0(): string {
    return [
      'TYPE=Ethernet',
      'DEVICE=eth0',
      'NAME=eth0',
      'BOOTPROTO=none',
      'ONBOOT=yes',
      `IPADDR=${this.sourceIP}`,
      'PREFIX=24',
      `GATEWAY=${this.gateway}`,
      `DNS1=${this.dns[0] ?? '8.8.8.8'}`,
      `DNS2=${this.dns[1] ?? '8.8.4.4'}`,
      '',
    ].join('\n');
  }

  async probeHead(target: string, timeoutMs: number): Promise<{ ok: boolean; rttMs?: number; error?: 'timeout' | 'unreachable' | 'dns' }> {
    const normalized = target.trim();
    if (!normalized) return { ok: false, error: 'dns' };
    const candidates = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalized)
      ? [normalized]
      : [`https://${normalized}`, `http://${normalized}`];

    for (const candidate of candidates) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
      try {
        await fetch(candidate, {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-store',
          signal: controller.signal,
        });
        const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const rttMs = Math.max(0.2, end - start);
        this.recordTransfer(64, 128);
        return { ok: true, rttMs };
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          clearTimeout(timeout);
          return { ok: false, error: 'timeout' };
        }
      } finally {
        clearTimeout(timeout);
      }
    }

    return { ok: false, error: this.canReach(normalized) ? 'unreachable' : 'dns' };
  }
}
