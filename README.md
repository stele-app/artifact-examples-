# Stele artifact examples

Public artifacts that run in [Stele](https://stele.au) — paste a raw URL
into the landing page or use the canonical share link below.

## Layout

Drop each artifact at the repo root with a descriptive filename and a
`@stele-manifest` JSDoc block at the top. Examples:

```
othello-x.tsx
othello-o.tsx
two-party-budget.tsx
```

## Sharing

Once committed and pushed, an artifact at `myartifact.tsx` is reachable as:

**Raw source** (for pasting into the landing input on stele.au):
```
https://raw.githubusercontent.com/stele-app/artifact-examples-/main/myartifact.tsx
```

**Canonical share link** (one-click open in Stele Web):
```
https://stele.au/view?src=https%3A%2F%2Fraw.githubusercontent.com%2Fstele-app%2Fartifact-examples-%2Fmain%2Fmyartifact.tsx
```

For Archetype B artifacts that need a token, append `#token=...` to the
share link (the fragment stays local to the user's browser, never logged).

## Running locally on desktop

Drag the file into Stele Desktop, or use **Open URL…** in the Library
header and paste the raw URL.

## License

Each artifact carries its own license in the manifest's `author` /
description fields. Default for files without an explicit license is
unset — contributors should add a license header if they want their
work to be reusable.
