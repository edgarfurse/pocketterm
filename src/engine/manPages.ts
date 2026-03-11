/**
 * Manual page database for the simulated Rocky Linux shell.
 * Format mimics real man(1) output with NAME, SYNOPSIS, DESCRIPTION sections.
 */

export const MAN_PAGES: Record<string, string> = {
  bash: `BASH(1)                    General Commands Manual          BASH(1)

NAME
       bash - GNU Bourne-Again SHell

SYNOPSIS
       bash [options] [command_string | file]

DESCRIPTION
       bash is a command language interpreter that executes commands read from
       standard input or from a file. It is the default interactive shell in
       Rocky Linux environments and provides job control, command history,
       aliases, and shell scripting support.

OPTIONS
       -c string
              Read commands from string.

       -l     Act as if invoked as a login shell.

       -i     Start an interactive shell session.

EXAMPLES
       bash
              Start a new interactive shell.

       bash -c "echo hello"
              Execute a single command string.

POCKETTERM NOTES
       PocketTerm simulates bash-style prompt behavior, command history, and
       builtins commonly used for Linux learning workflows.

SEE ALSO
       sh(1), man(1), cd(1), export(1)`,

  sh: `SH(1)                      General Commands Manual            SH(1)

NAME
       sh - command language interpreter

SYNOPSIS
       sh [options] [file]

DESCRIPTION
       sh is the historical POSIX shell interface. On modern Rocky Linux
       systems, /bin/sh is typically provided by bash in POSIX-compatible mode.
       It is commonly used by scripts that require portable shell behavior.

OPTIONS
       -c string
              Read commands from string.

       -s     Read commands from standard input.

EXAMPLES
       sh script.sh
              Execute script.sh using sh semantics.

       sh -c "pwd"
              Execute a single command in shell mode.

POCKETTERM NOTES
       PocketTerm exposes sh-style usage through the simulated shell stack and
       keeps behavior close to beginner-friendly Rocky Linux workflows.

SEE ALSO
       bash(1), man(1)`,

  ls: `LS(1)                    User Commands                    LS(1)

NAME
       ls - list directory contents

SYNOPSIS
       ls [OPTION]... [FILE]...

DESCRIPTION
       List information about the FILEs (the current directory by default).
       Sort entries alphabetically. This is one of the most frequently used
       commands when exploring a Linux filesystem.

       By default, ls does NOT show hidden files (those whose names start
       with a dot, like .bashrc). Use -a to include them.

OPTIONS
       -a, --all
              Do not ignore entries starting with . (dot). Hidden files are
              often configuration files. Use this when you want to see every-
              thing in a directory.

       -l     Use a long listing format. Shows permissions, owner, size, date,
              and filename. Essential for understanding file ownership and
              access rights. Example: -rw-r--r-- 1 guest guest 256 Jan 1 file

       -h, --human-readable
              With -l, print sizes in human readable format (e.g., 1K 234M).

       -r, --reverse
              Reverse order while sorting.

       -t     Sort by modification time, newest first.

EXAMPLES
       ls
              List files in the current directory (hidden files omitted).

       ls -l
              Long format. See permissions (rwx), owner, size, and date.

       ls -la
              List ALL files including hidden ones, in long format. Great for
              inspecting your home directory or /etc.

       ls /etc
              List contents of /etc (system configuration directory).

       ll
              Common alias for ls -l (if configured).

SEE ALSO
       cd(1), pwd(1), stat(1)`,

  cd: `CD(1)                    Builtin Commands                 CD(1)

NAME
       cd - change the shell working directory (shell builtin)

SYNOPSIS
       cd [-L|[-P [-e]] [-@]] [dir]

DESCRIPTION
       cd is a SHELL BUILTIN, not a separate program. It changes the current
       working directory of the shell. Your "location" in the filesystem
       determines where relative paths (like ./file or ../parent) resolve to.

       If no directory is given, cd changes to your home directory (~).

       Path components:
         .   means "current directory"
         ..  means "parent directory"
         ~   means your home directory (/home/guest or /root)

OPTIONS
       -L     Force symbolic links to be followed (default behavior).

       -P     Use the physical directory structure without following symbolic
              links.

EXAMPLES
       cd
              Change to your home directory.

       cd /tmp
              Change to /tmp (absolute path).

       cd ..
              Go up one directory. From /home/guest, this becomes /home.

       cd ../etc
              Go to etc in the parent directory.

       cd ~
              Change to home directory (tilde expansion).

       cd ~/Documents
              Change to Documents inside your home directory.

SEE ALSO
       pwd(1), bash(1)`,

  pwd: `PWD(1)                   Builtin Commands                PWD(1)

NAME
       pwd - print name of current/working directory

SYNOPSIS
       pwd [-LP]

DESCRIPTION
       Print the absolute pathname of the current working directory. This
       tells you exactly where you are in the filesystem hierarchy. Useful
       when you are lost or need to confirm your location before running
       commands.

       pwd is a shell builtin on most systems.

OPTIONS
       -L     Print the value of $PWD if it names the current directory.

       -P     Print the physical directory, without any symbolic links.

EXAMPLES
       pwd
              Output might be: /home/guest

       cd /etc && pwd
              Output: /etc

SEE ALSO
       cd(1), getcwd(3)`,

  cat: `CAT(1)                    User Commands                   CAT(1)

NAME
       cat - concatenate files and print on the standard output

SYNOPSIS
       cat [OPTION]... [FILE]...

DESCRIPTION
       cat reads each FILE in sequence and writes its contents to standard
       output. With no FILE, or when FILE is -, cat reads from standard
       input. The name "cat" comes from "concatenate" - it can join multiple
       files together, but its most common use is simply viewing a single
       file's contents.

       If you try to cat a directory, you will get: cat: [path]: Is a
       directory. Directories cannot be read as text.

OPTIONS
       -n, --number
              Number all output lines.

       -b, --number-nonblank
              Number nonempty output lines.

       -s, --squeeze-blank
              Squeeze multiple adjacent empty lines into one.

EXAMPLES
       cat /etc/hosts
              Display the hosts file (localhost mappings).

       cat /etc/os-release
              View system identification (Rocky Linux version info).

       cat ../../etc/resolv.conf
              Using relative path: from /home/guest, goes up to / and into
              etc to read DNS configuration.

       cat file1 file2
              Concatenate and display file1 followed by file2.

SEE ALSO
       less(1), more(1), head(1), tail(1)`,

  ip: `IP(8)                     Linux                           IP(8)

NAME
       ip - show / manipulate routing, network devices, interfaces

SYNOPSIS
       ip [ OPTIONS ] OBJECT { COMMAND | help }

DESCRIPTION
       ip is a modern replacement for the legacy ifconfig, route, and related
       tools. It manages network interfaces, addresses, and routing. On Rocky
       Linux 9, ip is the standard tool for network configuration.

OBJECTS
       address, addr, a
              Protocol address management. Show or configure IP addresses
              on interfaces.

       route, r
              Routing table management. Show or configure routes (how packets
              reach other networks).

ADDRESS (ip addr, ip a)
       Shows all network interfaces and their IP addresses.

       lo (loopback)
              Virtual interface for localhost (127.0.0.1). Always present.

       eth0
              Typically the first Ethernet interface. In this simulation,
              configured with 192.168.1.100/24.

EXAMPLES
       ip addr
       ip a
              Display all network interfaces and their addresses.

       ip route
       ip r
              Display the routing table (default gateway, local networks).

SEE ALSO
       nmcli(1), ping(8), ifconfig(8)`,

  ping: `PING(8)                  System Manager's Manual        PING(8)

NAME
       ping - send ICMP ECHO_REQUEST packets to network hosts

SYNOPSIS
       ping [OPTIONS] destination

DESCRIPTION
       ping sends ICMP (Internet Control Message Protocol) Echo Request
       packets to a target host and waits for Echo Reply packets. It is the
       primary tool for testing whether a host is reachable on the network.
       Each line of output typically shows: packet size, source, sequence
       number, TTL (time-to-live), and round-trip time.

       ping continues until interrupted (Ctrl+C). It sends packets at
       approximately one-second intervals and prints statistics when
       stopped.

OPTIONS
       -c count
              Stop after sending count packets.

       -i interval
              Wait interval seconds between packets.

       -4      Use IPv4 only.

       -6      Use IPv4 only.

EXAMPLES
       ping localhost
              Test that the local network stack works (127.0.0.1).

       ping 192.168.1.1
              Test connectivity to the default gateway.

       ping 8.8.8.8
              Test connectivity to Google's public DNS (if reachable).

       ping example.com
              Test connectivity to a hostname (resolved via DNS).

SEE ALSO
       ip(8), nmcli(1), traceroute(8)`,

  nmcli: `NMCLI(1)                 General Commands Manual         NMCLI(1)

NAME
       nmcli - command-line tool for controlling NetworkManager

SYNOPSIS
       nmcli [OPTIONS] OBJECT { COMMAND | help }

DESCRIPTION
       nmcli is the command-line interface for NetworkManager, the default
       network management daemon on Rocky Linux 9. It can manage connections,
       devices, and network state without editing config files by hand.

OBJECTS
       device, d
              Network devices (physical or virtual interfaces).

       connection, c
              Stored connection profiles.

       general, g
              General NetworkManager status.

DEVICE STATUS (nmcli device status)
       Shows the state of each network device. Columns:

       DEVICE   Interface name (e.g., eth0, lo)
       TYPE     ethernet, wifi, loopback, etc.
       STATE    connected, disconnected, unmanaged, unavailable
       CONNECTION
                Active connection name, or -- if none

       connected means the interface has an active connection and an IP
       address. unmanaged means NetworkManager is not managing it (common
       for loopback).

EXAMPLES
       nmcli device status
       nmcli d s
              Show status of all network devices.

       nmcli device show eth0
              Show detailed configuration of eth0.

SEE ALSO
       ip(8), ping(8), nmtui(8)`,

  dnf: `DNF(8)                    DNF Manual                      DNF(8)

NAME
       dnf - package manager for Rocky Linux and other RHEL-based systems

SYNOPSIS
       dnf [options] <command> [<args>]

DESCRIPTION
       dnf (Dandified YUM) is the default package manager on Rocky Linux 9.
       It installs, upgrades, and removes software packages. dnf automati-
       cally resolves dependencies - if package A needs package B, dnf will
       install both.

       dnf connects to configured repositories (like Rocky Linux BaseOS and
       AppStream) to download packages. In this simulation, the install
       process is mimicked with realistic output.

COMMANDS
       install <package>...
              Install one or more packages. Example: dnf install htop

       remove <package>...
              Remove packages and their unused dependencies.

       search <term>
              Search package names and descriptions.

       list [available|installed]
              List packages. Use 'installed' to see what you have.

       info <package>
              Show detailed information about a package.

       update
              Upgrade all installed packages to the latest versions.

EXAMPLES
       dnf install htop
              Install the htop process viewer.

       dnf search nginx
              Find packages matching "nginx".

       dnf list installed
              List all installed packages.

SEE ALSO
       yum(8), rpm(8), rpm-ostree(8)`,

  uname: `UNAME(1)                 User Commands                   UNAME(1)

NAME
       uname - print system information

SYNOPSIS
       uname [OPTION]...

DESCRIPTION
       uname prints information about the current system. By default it
       prints only the kernel name (Linux). Options reveal more details
       about the kernel version, machine architecture, and hostname.

       This is useful for scripting (e.g., "if uname -r contains el9, do X")
       or for troubleshooting (confirming kernel version after an update).

OPTIONS
       -a, --all
              Print all information (kernel name, hostname, kernel release,
              kernel version, machine, processor, platform, OS).

       -r, --kernel-release
              Print the kernel release (e.g., 5.14.0-362.8.1.el9_3.x86_64).
              The el9 indicates Enterprise Linux 9 (Rocky, RHEL, Alma).

       -n, --nodename
              Print the network node hostname.

       -m, --machine
              Print the machine hardware name (e.g., x86_64).

       -s, --kernel-name
              Print the kernel name (default when no option is given).

EXAMPLES
       uname
              Output: Linux

       uname -r
              Output: 5.14.0-362.8.1.el9_3.x86_64

       uname -a
              Output: Linux pocket-term 5.14.0-362.8.1.el9_3.x86_64 #1 SMP
              PREEMPT_DYNAMIC Wed Nov 8 17:39:03 UTC 2023 x86_64 x86_64
              x86_64 GNU/Linux

SEE ALSO
       hostname(1), arch(1)`,

  clear: `CLEAR(1)                 General Commands Manual         CLEAR(1)

NAME
       clear - clear the terminal screen

SYNOPSIS
       clear

DESCRIPTION
       clear clears the terminal screen. In practice, it scrolls the display
       so that the prompt and cursor appear at the top of the visible area.
       Previous output is not truly erased - you can scroll up to see it.

       On most terminals, Ctrl+L performs the same action as clear. This
       is a convenient shortcut when your screen is cluttered and you want
       a fresh view.

       clear does not affect the shell's history or the current working
       directory. It is purely a display operation.

EXAMPLES
       clear
              Clear the screen. Your prompt will appear at the top.

       Ctrl+L
              Keyboard shortcut for clear (in most terminal emulators).

SEE ALSO
       reset(1), tput(1)`,

  echo: `ECHO(1)                   User Commands                   ECHO(1)

NAME
       echo - display a line of text

SYNOPSIS
       echo [OPTION]... [STRING]...

DESCRIPTION
       echo writes each STRING to standard output, followed by a newline.
       If no STRING is given, it prints only a newline. echo is commonly
       used in shell scripts to print messages, variable values, or to
       generate simple output.

       echo is also a shell builtin, so its behavior can vary slightly
       between shells. The basic usage is consistent: it prints what you
       give it.

OPTIONS
       -n     Do not output the trailing newline.

       -e     Enable interpretation of backslash escapes (e.g., \\n, \\t).

       -E     Disable interpretation of backslash escapes (default).

EXAMPLES
       echo Hello, world
              Output: Hello, world

       echo $HOME
              Print the value of the HOME environment variable.

       echo "Current directory: $(pwd)"
              Print a message with command substitution.

       echo -n "No newline"
              Print without a trailing newline.

SEE ALSO
       printf(1), bash(1)`,

  man: `MAN(1)                    Manual pager utils              MAN(1)

NAME
       man - an interface to the system reference manuals

SYNOPSIS
       man [OPTION]... [COMMAND]...

DESCRIPTION
       man displays manual pages (man pages) - the built-in documentation
       for most commands and system interfaces. Each man page is a reference
       document that explains what a command does, its options, and often
       includes examples.

       Manual sections:
         1    User commands (ls, cat, echo)
         2    System calls
         3    Library functions
         4    Special files (/dev)
         5    File formats (/etc/passwd, etc.)
         8    System administration (dnf, ip)

       When you are learning a new command, run man <command> first. It is
       the most authoritative source for how a tool works.

EXAMPLES
       man ls
              Display the manual page for ls.

       man man
              Display this manual page (meta!).

       man ip
              Learn about the ip command for network configuration.

       man dnf
              Learn about package management with dnf.

SEE ALSO
       apropos(1), whatis(1), less(1), info(1)`,

  nano: `NANO(1)                  General Commands Manual         NANO(1)

NAME
       nano - small and friendly text editor inspired by Pico

SYNOPSIS
       nano [options] [[+line[,column]] file]...

DESCRIPTION
       nano is a simple, beginner-friendly text editor. It runs in the
       terminal and shows key bindings at the bottom of the screen. In this
       simulation, nano opens an in-browser editor for editing files.

       When given a filename, nano opens it if it exists, or creates it if
       it does not. Common uses: editing config files, writing scripts,
       taking notes.

KEY BINDINGS
       ^O     Write (Save) the current file to disk.

       ^X     Exit nano (prompts to save if modified).

       ^K     Cut the current line.

       ^U     Paste (Uncut) from the cutbuffer.

       ^W     Search for a string.

       ^G     Display the help text.

EXAMPLES
       nano myfile.txt
              Open or create myfile.txt for editing.

       nano /etc/hosts
              Edit the hosts file (may require sudo).

SEE ALSO
       vi(1), vim(1), pico(1)`,
};

/**
 * Get the manual page for a command, or null if not found.
 */
export function getManPage(command: string): string | null {
  const key = command.toLowerCase();
  return MAN_PAGES[key] ?? null;
}

/**
 * Check if a manual page exists for the given command.
 */
export function hasManPage(command: string): boolean {
  return command.toLowerCase() in MAN_PAGES;
}
