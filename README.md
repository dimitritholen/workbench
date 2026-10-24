# workbench

A Claude Code mod: one pane beside the chat with three tabs, for the folder the session runs in. Works on macOS, Linux (WSL included) and Windows.

- **Files**: a keyboard-driven list (click it, then `↑↓`/`jk`, `⏎` open, `⌫` up, `@` to prompt, `/` filter), file preview.
- **System**: a braille CPU graph, memory and load, disks, and the top 10 processes by CPU, each with a kill button that asks first.
- **Git**: branch and ahead/behind, stage and unstage per file, commit, pull (`--ff-only`), push (asks first), stash and pop, the last 15 commits.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install workbench --marketplace dimitritholen/workbench
```

Answer `y` to add the marketplace, then pick a scope. From a shell: `claude plugin install workbench --marketplace dimitritholen/workbench`. In the desktop app: + next to the prompt box, Plugins, Add marketplace with `dimitritholen/workbench`, then Add plugin.

## Use

The pane opens by itself once the terminal is wide enough, or with `/workbench`. Keys `1`, `2` and `3` switch tabs while the pane has focus.

## Develop

```sh
claude --plugin-dir .   # run it from a checkout
claude plugin validate .
claude plugin test .
```

`hooks/lib.ts` holds the parsers, `hooks/probes.ts` the per-OS commands, `tests/fixtures.ts` real output they are tested on (the macOS part is written by hand).
