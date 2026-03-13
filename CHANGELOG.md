# Changelog

All notable changes to this project are documented in this file.


## 0.11.8 - 2026-03-13

### Added

- Added high-fidelity pager search (`/`, `?`, `n`, `N`) and contextual man-page headers.
- Added regression checks to ensure `man bash | cat` remains a clean non-interactive text stream without pager artifacts.

### Changed

- Updated `man less` documentation with a yellow `CHEATSHEET` section for pager search/navigation keys.
- Refined pager status labels to show command context (for example, `bash(1)`) in interactive man-mode paging.

## 0.11.7 - 2026-03-12

### Changed

- Updated `man` to route terminal-mode rendering through pager flow (`less`) while preserving stream output for pipeline/redirection mode
- Added shell-level command-not-found suggestion hook with deterministic Levenshtein matching against registry + manifest command sets
- Normalized local prompt hostname token to `pocketterm` for consistent PS1 fidelity (`[user@host path]$`)
- Added yellow `POCKETTERM TIP` guidance to `help` and `history` in terminal mode, with plain-text fallback in pipe mode

### Added

- Added regression coverage for pager routing behavior, pipeline-safe `man` output, prompt formatting, typo suggestion behavior, and deterministic suggestion tie handling

## 0.11.6 - 2026-03-12

### Added

- Added canonical workstation manifest at `src/engine/command-manifest.json` as the single source of truth for command parity coverage
- Added manifest-driven stub generator so any missing manifest command is auto-registered with a stable v0.11 stub runtime contract
- Added parity CI contract tests to enforce manifest registration coverage and man-page coverage for the full manifest list

### Changed

- Updated command registry bootstrapping to register implemented commands first, then auto-fill only missing manifest commands with stubs
- Updated stub contract text and roadmap note wording to the v0.12 roadmap phrasing used in the parity objective
- Expanded external man-page JSON coverage for manifest stubs so `man <command>` works consistently across the workstation manifest

## 0.11.5 - 2026-03-12

### Fixed

- Resolved command availability regressions so `vi` and `lynx` are first-class registered commands (no fallback alias dependency for `vi`)
- Hardened alias value parsing to preserve quoted argument groups, improving shell-like alias behavior for real admin workflows

### Added

- Added yellow-note man rendering for `POCKETTERM NOTE(S)`, `CHEATSHEET`, and `EXTRA` sections in terminal mode
- Added `CHEATSHEET` section to `man vi` and expanded external man library notes for `bash`, `ls`, `grep`, and `lynx`
- Added external `lynx` manual entry in the JSON man-page library and regression coverage for ANSI/no-ANSI man rendering modes

## 0.11.4 - 2026-03-12

### Added

- Added a lightweight `lynx` text-browser command with `-dump` support for terminal-readable webpage output and curl-aligned network error families
- Added external manual-page library at `src/engine/man-pages.json` with expanded `bash`, `ls`, and `grep` reference content
- Added regression tests for external man-page precedence, reboot privilege wording, `lynx` output/error behavior, and always-available `vi`

### Changed

- Updated `man` lookup precedence to: VFS page (`/usr/share/man/man1/*`) -> external JSON library -> command-local man text -> legacy fallback map
- Updated `vi` availability to be workstation-style baseline (no `vim` package gate), while keeping `vim` install-gated
- Updated reboot permission wording to `reboot: must be superuser` for non-privileged direct invocation
- Hardened terminal fit behavior to reduce Chrome/macOS bottom-line clipping via multi-pass fitting and resize observer updates

## 0.11.3 - 2026-03-12

### Fixed

- Fixed tutorial launch formatting in xterm by emitting instruction text line-by-line instead of as a single multiline payload, preventing horizontal drift/offset rendering
- Applied the same line-safe tutorial rendering path both at initial shell boot and when launching tutorials from `pocketterm`

## 0.11.2 - 2026-03-10

### Changed

- Expanded default PocketTerm tutorial instructions with course-ready step sequences, verification hints, and operator-facing context notes
- Made tutorial completion checks more forgiving for equivalent real-world command forms (for example `man 1 ls`, path-equivalent `cd`, combined `df` flags, and optional `sudo` prefixes) without changing tutorial tracks
- Added integration coverage to guarantee tutorial variants pass consistently while preserving existing completion outcomes

## 0.11.1 - 2026-03-10

### Added

- Added stderr-aware shell redirection support: `2>`, `2>>`, `2>&1`, and `|&` with final-segment redirection handling in pipelines
- Added resolver contract tests for hosts-first resolution and unresolved-host failures across `ping` and `curl`
- Added integration coverage for redirection merge/append behavior and shell exit-code parity (`127`, `2`, `130`)

### Changed

- Updated shell parser and pipeline executor to model stdout/stderr separately and route streams based on redirection order
- Propagated command-level `setExitCode(...)` status through command execution so script/pipeline status reflects command intent
- Standardized `sudo` misuse (`sudo` without command) to shell-usage status `2`
- Unified network target resolution path for `ping` and `curl` to follow literal IP -> `/etc/hosts` -> DNS-fallback behavior

## 0.11.0 - 2026-03-10

### Added

- Added proxy-fidelity network boot artifacts: dynamic `/proc/net/dev` and boot-seeded `/etc/sysconfig/network-scripts/ifcfg-eth0`
- Added browser system/network probe modeling in `NetworkLogic` with transfer counters and public-IP-seeded local addressing fallback
- Added regression coverage for network probe files and transfer-counter updates (`networkLogic` + shell integration tests)

### Changed

- Reworked `ping` to use browser-safe fetch HEAD probes with timeout control, RTT reporting, packet stats, and realistic failure surfaces
- Updated `curl` to feed network transfer counters so simulated interface telemetry tracks actual PocketTerm network activity
- Updated `ip` and `nmcli` outputs to reflect the active simulated interface address/gateway/DNS instead of fixed literals

## 0.10.4 - 2026-03-10

### Changed

- Fixed pipeline filtering fidelity so `ls | grep <pattern>` behaves line-by-line; `ls` now emits one entry per line when running in pipe mode while preserving compact terminal output
- Separated stdout/stderr command channels so pipeline stdin consumes only stdout and no longer accidentally ingests upstream error messages
- Routed core text/file command error surfaces to stderr for realistic shell stream behavior (`ls`, `cat`, `grep`, `head`, `tail`, `wc`, `less`)
- Added integration regressions covering `ls | grep Down`, stderr-not-piped behavior (`ls /root | grep Permission`), and missing-file piping with `cat ... | wc -l`

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
