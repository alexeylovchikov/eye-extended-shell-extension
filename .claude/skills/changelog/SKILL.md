---
name: changelog
description: Update the changelog of the Eye and Mouse Extended GNOME Shell extension (CHANGELOG.md in the repository root, in English) from the git commits made since the last commit already covered. Use when asked to update or put together the changelog or "what's new", on the /changelog command, and before a version is uploaded to extensions.gnome.org.
---

# The Eye and Mouse Extended changelog

The changelog is `CHANGELOG.md` in the repository root. It is read on GitHub and copied into
the release notes when a version goes to extensions.gnome.org (EGO), so it is in English
only, like the extension's description.

It says what has changed **for the person using the extension**, in plain words. It is not
a list of commits.

## Versions

EGO numbers the uploads itself (1, 2, 3, …); the `version` in
`eye-extended@als.kz/metadata.json` is not that number and is not changed for a release.
So changes go into `## Unreleased` first, and the section gets its number only when the
version is uploaded.

- The number of the version on EGO now is in its public info (the largest `version` in
  `shell_version_map`):
  ```bash
  curl -s 'https://extensions.gnome.org/extension-info/?uuid=eye-extended@als.kz'
  ```
  The next upload gets the next number, unless the person says otherwise.

## Format

```markdown
# Changelog

<!-- last-commit: <full hash of the last commit covered> -->

## Unreleased

### New
- ...

### Fixed
- ...

## Version 22 — 27.11.2026
...
```

- Sections go newest first: `## Unreleased` (when there is something not uploaded yet),
  then `## Version <EGO number> — <DD.MM.YYYY>`, where the date is the day of the upload.
  The dash is an em dash, `—`.
- A section has only two groups, in this order. Leave out a group that would be empty.
  - `### New`
  - `### Fixed`
- There is one `<!-- last-commit: ... -->` line, right after `# Changelog`: the commit up to
  which the changelog is written.
- Plain GitHub Markdown: headings, items starting with `- `, `**bold**`, `` `code` ``.
  No tables, images or nested lists.

## Steps

1. Read the `last-commit` mark in `CHANGELOG.md` and list the commits made since:
   ```bash
   git log <last-commit>..HEAD --no-merges --reverse --format='%H|%ad|%s' --date=short
   ```
2. Drop what the person using the extension does not see (see below).
3. When a commit message does not make clear what changed, look at `git show --stat <hash>`
   and, if needed, at the diff, to find out what the person sees. Do not make up anything
   that is not in the code.
4. Several commits about the same thing become one item. A fix of something that was added
   in the same unreleased section is not a separate item: the item about the feature just
   describes it as it works now.
5. Add the items to `## Unreleased`; make that section, right after the `last-commit` line,
   when it is not there.
6. When nothing visible has changed at all, add nothing (no empty `Unreleased` section) and
   only move the mark.
7. Set `last-commit` to the full hash of the last commit looked at (`HEAD`), even when that
   commit itself did not make it into the changelog.
8. **When the version is being uploaded** (asked to "release", "close the version", or
   given a number): rename `## Unreleased` to `## Version <number> — <today, DD.MM.YYYY>`,
   with the number from **Versions** above.
9. **Do not commit** unless asked. Show the resulting section and the list of commits left
   out, each with its reason in one line.

## What stays out

- Commits marked `[chore]`, `[docs]`, `[refactor]`, `[test]`, `[ci]`: README, promo GIFs
  and pictures in `assets/`, the description in `metadata.json`, CLAUDE.md, this skill.
- Building and packaging: `scripts/`, the zip, `.gitignore`, `.github/`.
- Things that exist only for development: test harnesses, probe extensions, debug logging.
- A `[feat]` or `[fix]` that is internal through and through (changes nothing the person
  sees or does) is left out too. A fix asked for by the EGO review with no visible effect
  (an unused file removed, a timer stopped on disable) is left out.
- Translations count only as a whole new language or a whole area translated, not as wording
  fixes.

## How to write

- In the words of the person using the extension: "Added …", "The eye can now …",
  "The settings now have …", "Fixed: … did not …".
- Names of tabs, settings, menu items and values are written exactly as in the interface,
  in English: the tabs **Eye**, **Mouse indicator**, **Pointer trail**, **Cat**; the eye
  menu items **Mouse indicator**, **Pointer trail (hold Ctrl)**, **Cat**, **Settings**;
  settings like **Refresh interval (ms)**, **Click colors**, **Show** → **Always**. Take
  them from the code (`_('…')` in `eye-extended@als.kz/prefs.js` and `extension.js`); do
  not invent or reword them.
- A big new feature is in bold: `**Desktop cat**`. Keys are in code: `` `Ctrl` ``.
- Mention GNOME Shell versions, Wayland, X11 or remote desktop (RDP) only where the change
  is about them.
- No commit hashes, no names of source files, no GSettings keys, no internal names of
  classes and functions.
- One item is one change, in one or two sentences.
