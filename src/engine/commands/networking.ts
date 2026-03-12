import type { CommandDefinition } from './types';
import { sleep } from './types';

function isIpv4Literal(value: string): boolean {
  const parts = value.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

function readHostsMap(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of raw.split('\n')) {
    const clean = line.replace(/#.*/, '').trim();
    if (!clean) continue;
    const cols = clean.split(/\s+/).filter(Boolean);
    if (cols.length < 2) continue;
    const ip = cols[0];
    for (let i = 1; i < cols.length; i++) out.set(cols[i].toLowerCase(), ip);
  }
  return out;
}

function resolveNetworkTarget(
  input: string,
  ctx: Parameters<CommandDefinition['execute']>[1],
): { kind: 'ok'; canonicalHost: string; resolved: string } | { kind: 'error'; host: string } {
  const target = input.trim().toLowerCase();
  if (!target) return { kind: 'error', host: input };
  if (target === 'localhost') return { kind: 'ok', canonicalHost: target, resolved: '127.0.0.1' };
  if (isIpv4Literal(target)) return { kind: 'ok', canonicalHost: target, resolved: target };

  const hostsRaw = ctx.fs.readFile('/etc/hosts', ctx.user) ?? '';
  const hosts = readHostsMap(hostsRaw);
  const fromHosts = hosts.get(target);
  if (fromHosts) return { kind: 'ok', canonicalHost: target, resolved: fromHosts };

  const dnsServers = (ctx.fs.readFile('/etc/resolv.conf', ctx.user) ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('nameserver '))
    .map((line) => line.replace(/^nameserver\s+/, '').trim())
    .filter(Boolean);

  if (dnsServers.length === 0) return { kind: 'error', host: target };

  // Browser-safe deterministic fallback: real DNS queries are not available in this sandbox.
  if (/^[a-z0-9.-]+$/.test(target) && target.includes('.')) {
    return { kind: 'ok', canonicalHost: target, resolved: target };
  }
  return { kind: 'error', host: target };
}

const ip: CommandDefinition = {
  name: 'ip',
  async execute(args, ctx) {
    const sub = args[0]?.toLowerCase();
    const sourceIp = ctx.network.getSourceIP();
    const gateway = ctx.network.getGateway();
    const subnetPrefix = parseInt(ctx.network.getSubnet().split('/')[1] ?? '24', 10);
    if (sub === 'a' || sub === 'addr' || sub === 'address') {
      ctx.out('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000');
      ctx.out('    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00');
      ctx.out('    inet 127.0.0.1/8 scope host lo');
      ctx.out('       valid_lft forever preferred_lft forever');
      ctx.out('    inet6 ::1/128 scope host');
      ctx.out('       valid_lft forever preferred_lft forever');
      ctx.out('2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000');
      ctx.out('    link/ether 52:54:00:12:34:56 brd ff:ff:ff:ff:ff:ff');
      ctx.out(`    inet ${sourceIp}/${subnetPrefix} brd 192.168.1.255 scope global noprefixroute eth0`);
      ctx.out('       valid_lft forever preferred_lft forever');
      ctx.out('    inet6 fe80::5054:ff:fe12:3456/64 scope link');
      ctx.out('       valid_lft forever preferred_lft forever');
    } else if (sub === 'r' || sub === 'route') {
      ctx.out(`default via ${gateway} dev eth0 proto static metric 100`);
      ctx.out(`192.168.1.0/24 dev eth0 proto kernel scope link src ${sourceIp} metric 100`);
    } else {
      ctx.out('usage: ip [ OPTIONS ] OBJECT { COMMAND | help }');
      ctx.out('       ip addr  - protocol address management');
      ctx.out('       ip route - routing table management');
    }
  },
  man: `IP(8)                         Linux                           IP(8)

NAME
       ip - show / manipulate routing, network devices, interfaces

SYNOPSIS
       ip [ OPTIONS ] OBJECT { COMMAND | help }

DESCRIPTION
       ip is the modern replacement for ifconfig and route. It manages
       network interfaces, addresses, and routing on Rocky Linux 9.

OBJECTS
       address, addr, a     Protocol address management.
       route, r             Routing table management.

EXAMPLES
       ip a                 Show all interfaces and their addresses.
       ip addr              Same as ip a.
       ip r                 Show routing table.
       ip route             Same as ip r.

SEE ALSO
       nmcli(1), ping(8), ifconfig(8)`,
};

const ping: CommandDefinition = {
  name: 'ping',
  async execute(args, ctx) {
    let count = 4;
    let timeoutSeconds = 2;
    const nonFlags: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-c' && args[i + 1]) {
        const parsed = parseInt(args[++i], 10);
        if (!Number.isNaN(parsed) && parsed > 0) count = Math.min(parsed, 10);
        continue;
      }
      if ((a === '-W' || a === '--timeout') && args[i + 1]) {
        const parsed = parseInt(args[++i], 10);
        if (!Number.isNaN(parsed) && parsed > 0) timeoutSeconds = Math.min(parsed, 10);
        continue;
      }
      if (!a.startsWith('-')) nonFlags.push(a);
    }

    const target = nonFlags[0];
    if (!target) { ctx.out('ping: missing host'); return; }
    const resolution = resolveNetworkTarget(target, ctx);
    if (resolution.kind === 'error') {
      ctx.out(`ping: ${target}: Name or service not known`);
      ctx.setExitCode(1);
      return;
    }
    const resolved = resolution.resolved;
    if (!ctx.network.canReach(resolved)) {
      ctx.out(`ping: ${target}: Network is unreachable`);
      ctx.setExitCode(1);
      return;
    }

    ctx.out(`PING ${resolved} (${resolved}) 56(84) bytes of data.`);
    let sent = 0;
    let received = 0;
    const samples: number[] = [];
    const startedAt = Date.now();
    for (let i = 1; i <= count; i++) {
      sent++;
      const probe = await ctx.network.probeHead(resolution.canonicalHost, timeoutSeconds * 1000);
      if (probe.ok && typeof probe.rttMs === 'number') {
        const rtt = Math.max(0.01, probe.rttMs);
        samples.push(rtt);
        received++;
        ctx.out(`64 bytes from ${resolved}: icmp_seq=${i} ttl=64 time=${rtt.toFixed(3)} ms`);
      } else if (probe.error === 'timeout') {
        ctx.out(`From ${ctx.network.getGateway()} icmp_seq=${i} Destination Host Unreachable`);
      } else {
        ctx.out(`ping: ${target}: Name or service not known`);
        break;
      }
      if (i < count) await sleep(1000);
    }

    ctx.out(`--- ${resolved} ping statistics ---`);
    const elapsed = Math.max(1, Date.now() - startedAt);
    const lossPct = sent === 0 ? 100 : Math.round(((sent - received) / sent) * 100);
    ctx.out(`${sent} packets transmitted, ${received} received, ${lossPct}% packet loss, time ${elapsed}ms`);
    if (samples.length > 0) {
      const min = Math.min(...samples);
      const max = Math.max(...samples);
      const avg = samples.reduce((acc, n) => acc + n, 0) / samples.length;
      const mdev = Math.sqrt(samples.reduce((acc, n) => acc + ((n - avg) ** 2), 0) / samples.length);
      ctx.out(`rtt min/avg/max/mdev = ${min.toFixed(3)}/${avg.toFixed(3)}/${max.toFixed(3)}/${mdev.toFixed(3)} ms`);
    }
    if (received === 0) ctx.setExitCode(1);
  },
  man: `PING(8)                  System Manager's Manual        PING(8)

NAME
       ping - send ICMP ECHO_REQUEST packets to network hosts

SYNOPSIS
       ping [OPTIONS] destination

DESCRIPTION
       ping tests whether a host is reachable by sending ICMP Echo Request
       packets and waiting for replies. Each line shows the source, sequence
       number, TTL, and round-trip time.

OPTIONS
       -c count       Stop after sending count packets.
       -i interval    Wait interval seconds between packets.

EXAMPLES
       ping localhost           Test loopback (127.0.0.1).
       ping 192.168.1.1        Test default gateway.
       ping 8.8.8.8            Test Google DNS reachability.

SEE ALSO
       ip(8), nmcli(1), traceroute(8)`,
};

const nmcli: CommandDefinition = {
  name: 'nmcli',
  async execute(args, ctx) {
    const sub = args[0]?.toLowerCase();
    const sub2 = args[1]?.toLowerCase();
    const sourceIp = ctx.network.getSourceIP();
    const gateway = ctx.network.getGateway();
    const dns = ctx.network.getDns();
    if ((sub === 'device' || sub === 'd') && (sub2 === 'status' || sub2 === 's' || !sub2)) {
      ctx.out('DEVICE  TYPE      STATE      CONNECTION');
      ctx.out('eth0    ethernet  connected  eth0');
      ctx.out('lo      loopback  unmanaged  --');
    } else if ((sub === 'device' || sub === 'd') && sub2 === 'show') {
      ctx.out('GENERAL.DEVICE:                         eth0');
      ctx.out('GENERAL.TYPE:                           ethernet');
      ctx.out('GENERAL.HWADDR:                         52:54:00:12:34:56');
      ctx.out('GENERAL.MTU:                            1500');
      ctx.out('GENERAL.STATE:                          100 (connected)');
      ctx.out('GENERAL.CONNECTION:                     eth0');
      ctx.out('WIRED-PROPERTIES.CARRIER:               on');
      ctx.out(`IP4.ADDRESS[1]:                         ${sourceIp}/24`);
      ctx.out(`IP4.GATEWAY:                            ${gateway}`);
      ctx.out(`IP4.DNS[1]:                             ${dns[0] ?? '8.8.8.8'}`);
      ctx.out(`IP4.DNS[2]:                             ${dns[1] ?? '8.8.4.4'}`);
      ctx.out('IP6.ADDRESS[1]:                         fe80::5054:ff:fe12:3456/64');
    } else if (sub === 'general' || sub === 'g') {
      ctx.out('STATE      CONNECTIVITY  WIFI-HW  WIFI   WWAN-HW  WWAN');
      ctx.out('connected  full          enabled  enabled  enabled  enabled');
    } else {
      ctx.out('usage: nmcli [OPTIONS] OBJECT { COMMAND | help }');
      ctx.out('       nmcli device status     - show device status');
      ctx.out('       nmcli device show       - show device details');
      ctx.out('       nmcli general           - NetworkManager status');
    }
  },
  man: `NMCLI(1)                 General Commands Manual         NMCLI(1)

NAME
       nmcli - command-line tool for controlling NetworkManager

SYNOPSIS
       nmcli [OPTIONS] OBJECT { COMMAND | help }

DESCRIPTION
       nmcli controls NetworkManager, the default network daemon on Rocky
       Linux 9. Manage connections, devices, and network state from the CLI.

OBJECTS
       device, d        Network devices (interfaces).
       connection, c    Stored connection profiles.
       general, g       NetworkManager status.

EXAMPLES
       nmcli device status        Show all devices and their state.
       nmcli d s                  Short form of the above.
       nmcli device show          Show detailed info for all devices.
       nmcli general              Show NetworkManager connectivity.

SEE ALSO
       ip(8), ping(8), nmtui(8)`,
};

const curl: CommandDefinition = {
  name: 'curl',
  async execute(args, ctx) {
    let silent = false;
    let headOnly = false;
    let followRedirects = false;
    let outputPath: string | null = null;
    let urlArg: string | null = null;
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-s' || a === '--silent') {
        silent = true;
        continue;
      }
      if (a === '-I' || a === '--head') {
        headOnly = true;
        continue;
      }
      if (a === '-L' || a === '--location') {
        followRedirects = true;
        continue;
      }
      if (a === '-o') {
        const target = args[i + 1];
        if (!target) {
          ctx.out('curl: option -o: requires parameter');
          ctx.setExitCode(2);
          return;
        }
        outputPath = target;
        i++;
        continue;
      }
      if (!a.startsWith('-') && !urlArg) {
        urlArg = a;
      }
    }
    if (!urlArg) { ctx.out('curl: try \'curl --help\' for more information'); ctx.setExitCode(2); return; }

    let parsed: URL;
    try {
      const normalized = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(urlArg) ? urlArg : `http://${urlArg}`;
      parsed = new URL(normalized);
    } catch {
      ctx.out(`curl: (6) Could not resolve host: ${urlArg}`);
      ctx.setExitCode(6);
      return;
    }

    const resolution = resolveNetworkTarget(parsed.hostname, ctx);
    if (resolution.kind === 'error') {
      ctx.out(`curl: (6) Could not resolve host: ${parsed.hostname}`);
      ctx.setExitCode(6);
      return;
    }

    try {
      const started = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      let response: Response;
      try {
        response = await fetch(parsed.toString(), {
          method: headOnly ? 'HEAD' : 'GET',
          redirect: followRedirects ? 'follow' : 'manual',
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!followRedirects && response.status >= 300 && response.status < 400) {
        ctx.out('curl: (47) Maximum (0) redirects followed');
        ctx.setExitCode(47);
        return;
      }
      if (!response.ok) {
        ctx.out(`curl: (22) The requested URL returned error: ${response.status}`);
        ctx.setExitCode(22);
        return;
      }
      const text = headOnly ? '' : await response.text();
      const elapsedSec = Math.max(0.001, (Date.now() - started) / 1000);
      const bytes = new TextEncoder().encode(text).length;
      const estimatedHeaderBytes = 220;
      ctx.network.recordTransfer(128, estimatedHeaderBytes + bytes);
      const speed = Math.max(1, Math.round(bytes / elapsedSec));
      const total = String(bytes).padStart(5);

      const progressHeader = '  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current';
      const progressUnits = '                                 Dload  Upload   Total   Spent    Left  Speed';
      const progressLine = `100 ${total}  100 ${total}    0     0   ${String(speed).padStart(5)}      0 --:--:-- --:--:-- --:--:-- ${String(speed).padStart(5)}`;
      if (!silent) {
        ctx.out(progressHeader);
        ctx.out(progressUnits);
        ctx.out(progressLine);
      }

      if (headOnly) {
        ctx.out(`HTTP/1.1 ${response.status} ${response.statusText}`);
        response.headers.forEach((value, key) => {
          ctx.out(`${key}: ${value}`);
        });
        return;
      }

      if (outputPath) {
        const resolved = ctx.fs.resolvePath(ctx.cwd, outputPath);
        const ok = ctx.fs.writeFile(resolved, text, ctx.user, ctx.sudo);
        if (!ok) {
          ctx.out(`curl: (23) Failed writing body to output file: ${outputPath}`);
          ctx.setExitCode(23);
          return;
        }
        return;
      }

      for (const line of text.split('\n')) ctx.out(line);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        ctx.out('curl: (28) Operation timed out after 8000 milliseconds');
        ctx.setExitCode(28);
        return;
      }
      const message = err instanceof Error ? err.message : '';
      if (/failed to fetch|networkerror/i.test(message)) {
        ctx.out(`curl: (7) Failed to connect to ${resolution.kind === 'ok' ? resolution.canonicalHost : parsed.hostname}`);
        ctx.setExitCode(7);
        return;
      }
      ctx.out(`curl: (6) Could not resolve host: ${parsed.hostname}`);
      ctx.setExitCode(6);
    }
  },
  man: `CURL(1)                      User Commands                     CURL(1)

NAME
       curl - transfer a URL

SYNOPSIS
       curl [OPTIONS] [URL]

DESCRIPTION
       curl is a tool to transfer data from or to a server. It supports
       HTTP, HTTPS, FTP, and many other protocols. In this simulation,
       curl performs a browser-backed HTTP GET request and prints the body.

OPTIONS
       -o file        Write output to file instead of stdout.
       -I, --head     Fetch headers only.
       -L, --location Follow redirects.
       -s, --silent   Silent mode. Don't show progress meter.
       -v, --verbose  Make the operation more talkative.

EXAMPLES
       curl http://example.com          Fetch a web page.
       curl -o page.html http://site    Save output to page.html.

SEE ALSO
       wget(1), ip(8)`,
};

const ss: CommandDefinition = {
  name: 'ss',
  async execute(args, ctx) {
    const servicePid = (name: string) => 500 + (name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0) * 37) % 7000;
    const sshdPid = servicePid('sshd');
    const nginxPid = servicePid('nginx');
    const canonical = [...args].sort().join(' ');
    const isTulpn = args.join(' ') === '-tulpn' || canonical === '-l -n -p -t -u';
    if (!isTulpn) {
      ctx.out('usage: ss -tulpn');
      ctx.out('ss: only -tulpn is supported in this simulation');
      return;
    }

    ctx.out('Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process');
    if (ctx.services.get('sshd') === 'active') {
      ctx.out(`tcp   LISTEN 0      128    0.0.0.0:22          0.0.0.0:*          users:(("sshd",pid=${sshdPid},fd=3))`);
      ctx.out(`tcp   LISTEN 0      128       [::]:22             [::]:*          users:(("sshd",pid=${sshdPid},fd=4))`);
    }
    if (ctx.services.get('nginx') === 'active') {
      ctx.out(`tcp   LISTEN 0      511    0.0.0.0:80          0.0.0.0:*          users:(("nginx",pid=${nginxPid},fd=6))`);
      ctx.out(`tcp   LISTEN 0      511       [::]:80             [::]:*          users:(("nginx",pid=${nginxPid},fd=7))`);
    }
    ctx.out('udp   UNCONN 0      0      127.0.0.1:323       0.0.0.0:*          users:(("chronyd",pid=612,fd=5))');
    ctx.out('udp   UNCONN 0      0          [::1]:323          [::]:*          users:(("chronyd",pid=612,fd=6))');
  },
  man: `SS(8)                         Linux                           SS(8)

NAME
       ss - another utility to investigate sockets

SYNOPSIS
       ss -tulpn

DESCRIPTION
       ss is used to dump socket statistics. In this simulation, -tulpn prints
       listening TCP/UDP sockets and their owning processes.

       Service-aware behavior:
         - nginx port 80 is shown only when nginx service is active.
         - sshd port 22 is shown only when sshd service is active.

OPTIONS
       -t     Display TCP sockets.
       -u     Display UDP sockets.
       -l     Display listening sockets.
       -p     Show process using socket.
       -n     Show numerical addresses.

EXAMPLES
       ss -tulpn
       systemctl stop nginx && ss -tulpn

SEE ALSO
       netstat(8), ip(8), systemctl(1)`,
};

export const networkingCommands: CommandDefinition[] = [ip, ping, nmcli, curl, ss];
