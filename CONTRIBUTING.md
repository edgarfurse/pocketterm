# Contributing to PocketTerm

PocketTerm is a **High-Fidelity Linux Simulation Engine for Education and Narrative**.

This guide defines how we preserve authenticity while still shipping practical learning and onboarding features.

---

## Mission

PocketTerm exists to simulate modern Linux behavior with high practical fidelity in a browser environment, without sacrificing instructional clarity for learners and teams.

---

## Core Philosophy: Native vs Synthetic

Use this architecture contract for all changes.

| Layer | Definition | Examples | Rule |
|---|---|---|---|
| Native | Realistic CLI behavior users expect from Linux shells/utilities | command parsing, exit codes, pipes/redirection, `man`, `less`, prompt, boot/reboot flow | Must remain authoritative |
| Synthetic | Simulation helpers that improve learning/discovery | Yellow Notes, tutorial cartridges, onboarding hints | May augment Native behavior, never replace/overwrite it |

**Hard rule:** If Native and Synthetic behavior conflict, **Native wins**.

---

## Development Standards

### Command Coverage Contract

- `src/engine/command-manifest.json` is the source of truth for command coverage/discovery.
- Any command added, renamed, removed, or re-scoped must keep manifest coverage coherent.

### Command Implementation Contract

For every new or modified command, include:

- Runtime behavior implementation
- Explicit stdout/stderr behavior
- Explicit exit-code behavior
- Manual page coverage (`man` entry)
- At least one regression test (unit and/or integration)

### Documentation Contract

- User-visible behavior changes must be reflected in `CHANGELOG.md`.
- Update `README.md` when fidelity contracts, onboarding behavior, or operator expectations change.

---

## Validation / Merge Gate

Before merge:

- Run `npm run verify:release`
- Ensure lint, tests, and build all pass
- Do not merge with a failing verify gate

---

## UX Ethos

- Preserve authentic terminal UX by default.
- Keep fourth-wall guidance inside approved surfaces:
  - Tutorials
  - Sanctioned manual note sections (for example Yellow Notes in `man`)
- Do not inject synthetic narration into normal command output paths.

---

## Scope

These standards apply to all contributions:

- Shell engine
- Command binaries
- Boot/login/reboot lifecycle
- Docs and onboarding flows
- Terminal UI behavior
