# PocketTerm

PocketTerm is a high-fidelity Rocky Linux 9 terminal simulator built with React, TypeScript, and xterm.js.

It is designed for command-line practice, sysadmin training, and realistic operational workflows without requiring a real VM.

## Highlights

- Rocky-style command registry with man pages
- Persistent virtual filesystem (VFS) with ownership and permissions
- Package workflow with `dnf` and install-to-unlock commands
- Interactive tools (`top`, `htop`, `less`, `tail -f`, `journalctl -xe`)
- Service and identity stack (`systemctl`, `useradd`, `passwd`, `su`, `sudo`)
- Boot lifecycle simulation (`reboot -> GRUB -> BIOS -> boot -> login`)
- BIOS virtual hardware controls and dynamic `lsblk` integration
- Tutorial TUI (`pocketterm`) with guided tasks and completion checks

## Quick Start

```bash
npm install
npm run dev
```

Open the Vite URL in your browser.

## Release Checks

```bash
npm run check
```

This runs lint, unit tests, and production build.

## Demo Commands

### Core shell

```bash
help
man ls
pwd
ls -la
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
journalctl -xe
df -h
lsblk
```

### Training and reset

```bash
pocketterm
sudo reboot
```

## Project Structure

- `src/engine/` - shell engine, VFS, command modules, hardware state
- `src/components/` - terminal UI and editor overlays
- `src/App.tsx` - app state machine (shell, grub, bios, booting, login)

## Known Simulation Boundaries

- Some commands are intentionally simplified or mocked for browser safety
- Login currently supports a permissive mode by default
- Advanced disk lifecycle (`fdisk`, `mkfs`, `mount`) is staged but not fully implemented
- Networking is simulated and does not expose real host sockets/devices

## License
MIT

### Support & Connect

*If you find this project useful for learning or just enjoy the nostalgia, feel free to connect or support the development!*

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-Support-yellow?style=flat-square&logo=buy-me-a-coffee)](https://www.buymeacoffee.com/edgar.ai.dev)

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-blue?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/edgar-furse-7643b3ba/)


