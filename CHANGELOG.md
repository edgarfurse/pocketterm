# Changelog

All notable changes to this project are documented in this file.


## 0.10.3 - 2026-03-10

### Changed

- Hardened alias behavior to be shell-session local, preventing alias/unalias mutations from leaking across shell instances
- Unified command identity resolution so `type`, `which`, and `command -v` now share one classification model and remain consistent
- Normalized pipeline framing by ensuring captured pipe output is line-oriented (trailing newline when needed) for predictable downstream parsing
- Aligned `wc -l` and `grep -c` to the same PocketTerm line model, counting a final unterminated text chunk as a line for intuitive interactive behavior
- Documented intentional simulator contracts in `README.md` for line semantics, pipeline framing, command resolution, canonical home behavior, and bash-style error wording

## 0.10.2 - 2026-03-10

### Added

- Added `hostnamectl` command output for host/OS introspection parity in system-diagnostics workflows
- Added script execution ergonomics for `sh`/`bash` with `-x` tracing and in-script `set -e` / `set +e` behavior controls

### Changed

- Improved script diagnostics by emitting file-and-line-scoped failure messages when script commands fail
- Hardened `curl` transport error mapping with realistic timeout (`(28)`) and connect-failure (`(7)`) reporting
- Updated `cat /proc/uptime` to return dynamic values derived from shell boot time for better observability fidelity
- Expanded test coverage for script tracing/errexit behavior, `/proc/uptime`, `hostnamectl`, and curl network failures

## 0.10.1 - 2026-03-10

### Changed

- Added `$OLDPWD` tracking with POSIX-style `cd -` behavior (directory swap + printed destination path)
- Updated `cd` home resolution to use `$HOME` defaults and hardened path normalization handling for repeated slashes and dot-only paths
- Aligned default shell environment values for navigation parity: `HOME=/home/guest`, `USER=guest`, `SHELL=/usr/bin/bash`, `PATH=/usr/bin:/bin:/usr/local/bin`
- Updated alias muscle-memory behavior so `ll` maps to `ls -la` by default
- Standardized `/root` permission-denied error surfaces for both `ls /root` and `cd /root`
- Added integration coverage for env expansion, alias parity, `cd -`, path normalization, and `/etc/shells` formatting

## 0.10.0 - 2026-03-10

### Added

- FHS-aligned manpage persistence for `pocketterm` at `/usr/share/man/man1/pocketterm.1` with lookup support in `man`
- New command-resolution parity coverage (`which` + `command -v`) and end-to-end install-path integration tests for `dnf install git`
- Expanded manual coverage for `bash` and `sh`, including section-aware `man 1 <topic>` handling

### Changed

- Strengthened VFS baseline seeding and migration repair for core hierarchy paths (`/usr`, `/var`, `/home`, `/tmp`) and deep `/usr` layout
- Hardened system-path protection to prevent accidental deletion of critical directories in non-admin flows
- Updated `help` onboarding guidance to direct users to `man pocketterm` and the interactive environment manager

## 0.9.2 - 2026-03-10

### Added

- Package-to-command coverage contract (`PACKAGE_COMMAND_MAP`) and automated parity test to prevent installable-but-unrunnable command drift
- Install-gated command implementations for key package entries: `git`, `nginx`, `tmux`, `gcc`, `make`, `python3`, `neofetch`, `jq`, and `ncdu`
- Additional command-level tests for editor routing and curl behavior

### Changed

- `dnf install` unlock flow now has coherent command + `man` availability for newly mapped packages
- `nano`/`vim`/`vi` routing and command usage parity were refined for simulation fidelity

## 0.9.1 - 2026-03-10

### Added

- Dedicated modal `VimEditor` with normal/insert/command modes
- Expanded Vim keymap coverage (`h/j/k/l`, `w/b/e`, `0/$`, `gg/G`, `x`, `dd`, `dw`, `cc`, `cw`, `yy`, `p/P`, `u`, `/`, `n`, `N`, `.`)
- Real network-backed `curl` flow via browser `fetch()` with `-o`, `-I`, `-L`, `-s`
- Vitest-based storage hardening tests for malformed snapshot import and rollback behavior
- `npm run test` and `npm run verify:release` scripts

### Changed

- `curl` now returns realistic error surfaces for HTTP failure (`(22)`), redirects without `-L` (`(47)`), and output write failures (`(23)`)
- Release check script now includes tests in addition to lint and build

## 0.9.0 - 2026-02-26

### Added

- Command registry architecture across file, text, system, networking, package, and admin modules
- Rich Rocky-like VFS seed with permissions, ownership, and deep system directories
- Install-to-unlock package model with persisted package state
- Interactive command modes for `top`, `htop`, `less`, `tail -f`, and `journalctl -xe`
- Service and user administration commands (`systemctl`, `firewall-cmd`, `useradd`, `passwd`, `userdel`, `id`, `groups`)
- Shell parser support for quoting, pipes, redirection, aliases, and environment expansion
- Privilege simulation (`sudo`, `su`) with password prompts and sudo cache behavior
- Reboot lifecycle state machine (`shell -> grub -> bios -> booting -> login -> shell`)
- BIOS/virtual hardware subsystem with persisted block devices and dynamic `lsblk`
- Full-screen editor overlays and tutorial TUI (`pocketterm`) with guided task checking

### Changed

- Hardened production readiness: lint/build clean, release check script, split Vite chunks
- Improved Linux fidelity for home-directory handling (`~`, `cd` default)
- Scoped reset behavior to PocketTerm namespace keys only (`pocketterm-*`)
- Aligned service/runtime views for better consistency across `systemctl`, `ss`, and process snapshots

### Notes

- Partitioning/formatting command stack (`fdisk`, `mkfs`, `mount`) is intentionally deferred to a later subsystem phase
