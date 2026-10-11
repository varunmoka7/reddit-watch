# reddit-watch

A Claude Code mod (an add-on that changes how Claude Code behaves) that watches subreddits you pick and shows the posts that could improve how you use Claude Code, in a side pane with links.

## Why you might want it

Good Claude Code tricks (a way to save notes between sessions, a way to use fewer tokens) get posted on Reddit all day, and you will not read them all. Tokens are the units AI usage is measured in, roughly pieces of words. By default this watches r/ClaudeCode posts with the "Built with Claude" flair. Claude's small model (Haiku) reads each new post once and keeps only the ones that give you something specific to try. Example of a post it would show: "r/ClaudeCode: saves your notes between sessions".

## Install

Type these two lines in a terminal (not inside Claude Code):

```
claude plugin marketplace add varunmoka7/reddit-watch
claude plugin install reddit-watch@reddit-watch
```

Needs Claude Code 2.1.287 or newer (mods are on by default from that version). It uses only Claude Code's own features and plain web requests, so it should work on any system Claude Code runs on. It has only been tried on macOS.

## How to use

Type these inside Claude Code. It is off after install. Nothing is fetched and no model is called until you type `/reddit on`.

- `/reddit on` turns it on and scans the latest posts now. It then checks again every hour while Claude Code is open.
- `/reddit off` turns it off. A check already under way stops before its next step; a request already sent to Haiku may still finish.
- `/reddit scan` checks for new posts now. It only works while watching is on.
- `/reddit` opens the side pane.
- `/reddit add <subreddit> [flair]` watches another subreddit, for example `/reddit add ClaudeAI Built with Claude`. Replace `<subreddit>` with the subreddit's name. `[flair]` is an optional label; type it without the brackets. It limits the watch to posts with that label.
- `/reddit remove <subreddit>` stops watching one.
- `/reddit list` shows what is watched, whether it is on, and how many tokens Haiku has used ("in" is the text it read, "out" is the text it wrote).
- `/reddit clear` empties the list of posts shown in the pane.
- `/reddit reset` forgets which posts were already read and starts over. If watching is on, it reads them all again right away, which costs tokens. If watching is off, nothing is read until you run `/reddit on`.

## What it touches

- Network: only `www.reddit.com` (its public RSS feeds, which are Reddit's lists of new posts, no login), plus Claude's own model call. Nothing else.
- Files: it reads and writes only its own small saved state (settings, the posts already read, the posts shown) in the folder where Claude Code keeps its own settings. It does not touch your project files.
- Model calls: Haiku, one short call per new post, each post read once. The author's real use was about 29,000 input tokens and 1,900 output tokens to read 100 posts, which is roughly 300 tokens per post. After the first scan, an hourly check only pays for posts that are new.
- Default: off until you run `/reddit on`.

## Turn it off or uninstall

`/reddit off` stops all fetching and model calls. To remove it:

```
claude plugin uninstall reddit-watch@reddit-watch
```

## Known limits

- It only knows the last 50 posts each feed returns. A busy subreddit can push a post out before the next check.
- Reddit may refuse requests when it is busy (error 429). The mod says so and tries again at the next check.
- If the model fails to answer for a post three times, that post is skipped. It stays skipped while the mod still remembers it (see the next item) or until you run `/reddit reset`.
- It remembers the last 1500 posts it read. Watching more than about 30 subreddits at once can make it re-read old posts.
- If you run several Claude Code windows at once, each one checks on its own and pays for its own calls. They also save to the same place, so the last window to finish can overwrite what another just saved (posts shown, which posts were read, token counts). Some posts may then be read twice.
- Haiku's picks are a guess. Some good posts will be missed and some weak ones shown.

## License

MIT. See LICENSE.
