# Changelog

All notable changes to this project are documented in this file.


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
