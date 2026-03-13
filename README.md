# PocketTerm

**PocketTerm** is a high-fidelity, browser-based Rocky Linux 9 simulation. Unlike typical terminal emulators, it features a custom **AST-based shell interpreter** and a persistent **Filesystem Hierarchy Standard (FHS)** engine.

It is designed for educational sandboxing, sysadmin training, and realistic operational workflows without the overhead of a local VM.

---

## 🚀 Technical Pillars

### 1. Custom AST Shell Engine
* **Lexical Analysis:** Custom lexer/parser that builds an Abstract Syntax Tree (AST) for robust command execution.
* **Scripting Support:** Native execution of `.sh` and `bash` scripts with `set -e`, `set +e`, and `-x` tracing.
* **Pipes & Redirection:** Real-time stream handling for stdout redirection and complex command piping.

### 2. Filesystem Fidelity (FHS)
* **VFS Architecture:** A stateful virtual filesystem compliant with the Filesystem Hierarchy Standard (FHS).
* **Canonical Pathing:** Real resolution for `/usr/bin`, `/etc`, `/var`, and `/home/guest`.
* **Persistence:** System state, including installed packages and environment variables, is committed to browser storage and survives `reboot` cycles.

### 3. Integrated Tooling & Service Stack
* **Package Management:** Stateful `dnf` workflow with dependency resolution and install-to-unlock mechanics.
* **Hardware Simulation:** Authentic `/proc` filesystem (`uptime`, `cpuinfo`, `meminfo`) and dynamic `lsblk` integration.
* **Identity Management:** Simulated user/group stack with `useradd`, `passwd`, and `sudo` elevation.

---

## 🛠 Project Highlights

* **Boot Lifecycle:** Complete simulation from BIOS/GRUB through kernel boot to the login prompt.
* **Interactive Tools:** Full-featured `top`, `htop`, `less`, `tail -f`, and `journalctl -xe`.
* **Authentic Documentation:** Integrated `man` subsystem with high-fidelity manual pages (try `man pocketterm`).
* **Networking:** Browser-backed `curl`, proxy-style `ping`, dynamic `/proc/net/dev`, and boot-seeded `ifcfg-eth0`.
* **Observability:** Includes `hostnamectl` and dynamic `cat /proc/uptime`.

---

## 🧪 Demo Commands

<details>
<summary>Show command cookbook</summary>

### Core shell

```bash
help
man ls
pwd
ls -la
type ll
alias
```

### Package and unlock flow

```bash
dnf list available
sudo dnf install htop
htop
```

### Services and diagnostics

```bash
systemctl status sshd
sudo systemctl restart nginx
ss -tulpn
hostnamectl
journalctl -xe
cat /proc/uptime
cat /proc/cpuinfo
df -h
lsblk
```

### Scripting and path normalization

```bash
# Path normalization
cd ///home//guest/
cd /etc/../..//usr/bin/.

# Script execution
echo "cat /proc/cpuinfo" > script.sh
sh script.sh

# Script tracing and error control
echo "set +e" > demo.sh
echo "falsecmd" >> demo.sh
echo "ls" >> demo.sh
bash -x demo.sh
```

Notes:
- `cd /////etc//..//../usr/bin.` treats `bin.` as a literal directory name and returns "No such file or directory" unless `/usr/bin.` exists.
- `cd /etc/../..//usr/bin/.` resolves to `/usr/bin` as expected.
- `echo "cat /proc/cpuinfo" > script.sh && sh script.sh` prints the simulated CPU info content.

</details>

---

## 📂 Project Structure

- `src/engine/` - Core shell engine, VFS, AST parser, and command modules.
- `src/components/` - Terminal UI, xterm.js integration, and editor overlays.
- `src/App.tsx` - System state machine (BIOS -> GRUB -> Boot -> OS).

---

## 🚧 Known Simulation Boundaries

* **Networking:** Simulated bridge; does not expose host-level sockets for security.
* **Permissions:** Simplified ownership model optimized for educational workflows.
* **Hardware:** Block devices are simulated; `fdisk` and `mkfs` are staged but non-destructive to host hardware.

---

## Fidelity Notes (0.11.5)

- `curl` reports realistic error families (`(22)`, `(23)`, `(28)`, `(47)`, `(7)`).
- `cd -` uses `$OLDPWD` and prints the destination path.
- `cd ~` always resolves to the canonical sandbox home (`/home/guest` for guest), even if `$HOME` is changed.
- Default muscle-memory alias `ll` maps to `ls -la`.
- Exported environment variables persist across shell recreation.
- `/root` permission surfaces use bash-style "Permission denied" wording.
- `cat /proc/uptime` is dynamic; `/proc/cpuinfo` and `/proc/meminfo` are deterministic simulation seeds.
- `/proc/net/dev` now tracks simulated RX/TX counters and increments on browser-backed network probes (`curl`, `ping`).
- `ping` uses fetch-based HEAD probes with timeout handling and RTT measurement for browser-safe realism.
- `/etc/sysconfig/network-scripts/ifcfg-eth0` is generated at boot and aligned with the active simulated interface address.
- Stderr-aware redirection now supports `2>`, `2>>`, `2>&1`, and `|&` with bash-like left-to-right intent.
- Exit-code behavior is hardened for common shell fidelity paths (`127` not found, `2` misuse, `130` interrupt).
- `ping` and `curl` follow a shared resolver contract: literal IP -> `/etc/hosts` -> DNS fallback.
- `vi` is now available as a baseline workstation editor, while `vim` remains package-gated.
- `man` now resolves pages with deterministic precedence: VFS -> external man-page library -> command-local docs -> fallback map.
- Added `lynx` for text-only webpage rendering (`lynx -dump <url>`).
- Direct non-root `reboot` now reports `reboot: must be superuser`.
- Terminal fit behavior is hardened to reduce Chrome/macOS bottom-line clipping artifacts.
- `man` renders PocketTerm note sections (`POCKETTERM NOTE(S)`, `CHEATSHEET`, `EXTRA`) in yellow in terminal mode and plain text in pipelines/redirections.
- `vi` is command-registered baseline behavior (not a fallback alias to package-gated `vim`).
- Alias parsing now preserves quoted argument groups for shell-like alias ergonomics.

### Intentional Simulator Contracts

- **Line model:** `wc -l` and `grep -c` both treat final unterminated text as a line for intuitive sandbox behavior.
- **Pipeline framing:** piped command output is normalized as line-oriented data (trailing newline added when needed).
- **Resolution source:** `type` is the canonical command-resolution model; `which` and `command -v` are path-focused views of the same lookup.
- **Error strings:** core commands prefer exact bash-style wording for high-fidelity immersion.

---

## 🤝 Support & Connect

*If you find this project useful or enjoy the nostalgia, feel free to connect or support the development!*

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-yellow?style=flat-square&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/edgar.ai.dev)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-blue?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/edgar-furse-7643b3ba/)

---
License: MIT
