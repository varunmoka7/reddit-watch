# reddit-watch

A Claude Code mod that watches subreddits you pick and shows the posts that could improve how you use Claude Code, in a side pane with links.

## Why you might want it

Good Claude Code tricks (a hook, a memory setup, a way to cut token use) get posted on Reddit all day, and you will not read them all. By default this watches r/ClaudeCode posts with the "Built with Claude" flair. Claude's small model (Haiku) reads each new post once and keeps only the ones that give you something specific to try. Example hit: "r/ClaudeCode: saves your notes between sessions".

## Install

```
claude plugin marketplace add varunmoka7/reddit-watch
claude plugin install reddit-watch@reddit-watch
```

Needs Claude Code 2.1.287 or newer with mods enabled. It uses only Claude Code's own features and plain web requests, so it should work on any system Claude Code runs on. It has only been tried on macOS.

## How to use

It is off after install. Nothing is fetched and no model is called until you type `/reddit on`.

- `/reddit on` turns it on and scans the latest posts now. It then checks again every hour while Claude Code is open.
- `/reddit off` turns it off.
- `/reddit scan` checks for new posts now.
- `/reddit` opens the side pane.
- `/reddit add <subreddit> [flair]` watches another subreddit, for example `/reddit add ClaudeAI Built with Claude`. The flair is optional and limits it to posts with that label.
- `/reddit remove <subreddit>` stops watching one.
- `/reddit list` shows what is watched, whether it is on, and how many Haiku tokens it has used.
- `/reddit clear` empties the list of hits.
- `/reddit reset` forgets which posts were already read and starts over. It reads them all again, which costs tokens.

## What it touches

- Network: only `www.reddit.com` (public RSS feeds, no login), plus Claude's own model call. Nothing else.
- Files: it reads and writes only its own small saved state (settings, the posts already read, the hits) in your Claude Code config folder. It does not touch your project files.
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
- If the model fails to answer for a post three times, that post is skipped for good.
- It remembers the last 1500 posts it read. Watching more than about 30 subreddits at once can make it re-read old posts.
- If you run several Claude Code windows at once, each one checks on its own and pays for its own calls.
- Haiku's picks are a guess. Some good posts will be missed and some weak ones shown.

## License

MIT. See LICENSE.
