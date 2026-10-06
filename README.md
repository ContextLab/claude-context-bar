# claude-context-bar

A [Claude Code](https://claude.com/claude-code) mod that draws the context window as a stacked bar under the prompt: one coloured run per `/context` category, the free space behind them, and a running `used/max percent` total at the right. A legend below the bar names each category with its token count.

![The context bar under the Claude Code prompt](assets/screenshot.png)

Close-up of the bar and its legend:

![Close-up of the bar and legend](assets/bar.png)

## Install

Run this in a terminal:

```sh
claude plugin marketplace add ContextLab/claude-context-bar && claude plugin install context-bar@claude-context-bar
```

Then start a new Claude Code session. The bar appears under the prompt.

## Use

- The bar updates as the context changes and after each compaction.
- `/context-bar` hides the bar; running it again shows it.

The token counts are Claude Code's local estimates (the same summary `/context` starts from), so the mod sends no extra requests.

On a short terminal window Claude Code may clip the legend when it wraps onto a second row; the bar itself is unaffected.

## Uninstall

```sh
claude plugin uninstall context-bar@claude-context-bar && claude plugin marketplace remove claude-context-bar
```

## Develop

The mod is a hooks module with no build step and no dependencies.

| Path | What it holds |
|-|-|
| `hooks/register.tsx` | The hooks: the `/context-bar` command, the refresh on context changes, and the drawing |
| `hooks/cells.ts` | Splitting the bar's width among categories, and token-count formatting |
| `hooks/register.test.ts` | Tests |
| `types/index.d.ts` | The mod's state contract |
| `.claude-plugin/` | The plugin manifest and the marketplace file that makes this repository installable |

Run it from a clone, then test and validate:

```sh
claude --plugin-dir .      # load the mod from this folder for one session
claude plugin test .       # run the tests
claude plugin validate .   # check the manifests and the hooks module
```

Loading the mod writes Claude Code's type definitions to `.claude-plugin/types/` (git-ignored); after that, `npx -p typescript tsc -p .` type-checks it.
