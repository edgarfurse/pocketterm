import type { CommandDefinition } from './types';
import { sleep } from './types';

const ip: CommandDefinition = {
  name: 'ip',
  async execute(args, ctx) {
    const sub = args[0]?.toLowerCase();
    if (sub === 'a' || sub === 'addr' || sub === 'address') {
      ctx.out('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000');
      ctx.out('    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00');
      ctx.out('    inet 127.0.0.1/8 scope host lo');
      ctx.out('       valid_lft forever preferred_lft forever');
      ctx.out('    inet6 ::1/128 scope host');
      ctx.out('       valid_lft forever preferred_lft forever');
      ctx.out('2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000');
      ctx.out('    link/ether 52:54:00:12:34:56 brd ff:ff:ff:ff:ff:ff');
      ctx.out('    inet 192.168.1.100/24 brd 192.168.1.255 scope global noprefixroute eth0');
      ctx.out('       valid_lft forever preferred_lft forever');
      ctx.out('    inet6 fe80::5054:ff:fe12:3456/64 scope link');
      ctx.out('       valid_lft forever preferred_lft forever');
    } else if (sub === 'r' || sub === 'route') {
      ctx.out('default via 192.168.1.1 dev eth0 proto static metric 100');
      ctx.out('192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.100 metric 100');
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
    const target = args[0];
    if (!target) { ctx.out('ping: missing host'); return; }
    const resolved = target === 'localhost' ? '127.0.0.1' : target;
    const reachable = ctx.network.canReach(resolved);
    if (!reachable) { ctx.out(`ping: ${target}: Network is unreachable`); return; }
    ctx.out(`PING ${resolved} (${resolved}) 56(84) bytes of data.`);
    for (let i = 1; i <= 4; i++) {
      await sleep(1000);
      const time = (Math.random() * 0.5 + 0.05).toFixed(3);
      ctx.out(`64 bytes from ${resolved}: icmp_seq=${i} ttl=64 time=${time} ms`);
    }
    ctx.out(`--- ${resolved} ping statistics ---`);
    ctx.out('4 packets transmitted, 4 received, 0% packet loss, time 3003ms');
    ctx.out('rtt min/avg/max/mdev = 0.050/0.200/0.500/0.100 ms');
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
      ctx.out('IP4.ADDRESS[1]:                         192.168.1.100/24');
      ctx.out('IP4.GATEWAY:                            192.168.1.1');
      ctx.out('IP4.DNS[1]:                             8.8.8.8');
      ctx.out('IP4.DNS[2]:                             8.8.4.4');
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
        ctx.out(`curl: (7) Failed to connect to ${parsed.hostname}`);
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
