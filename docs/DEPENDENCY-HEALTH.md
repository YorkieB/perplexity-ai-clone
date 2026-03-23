# Dependency health

This document describes how JavaScript dependencies are managed in this repository, what was done to keep them secure and consistent, and how to verify everything locally.

## Scope

- **Package manager**: npm (`package.json` + `package-lock.json` at the repository root).
- **Runtime**: there is no separate backend `package.json`; the app is a Vite + React + TypeScript client.

## Principles

1. **Lockfile is source of truth for CI and reproducible installs** — use `npm ci` (not `npm install`) when you need an install that exactly matches `package-lock.json`.
2. **Keep direct dependencies aligned** — dev tools that declare peers (for example ESLint and `@eslint/js`) must use compatible major lines.
3. **Prefer automated fixes** — run `npm audit` regularly; apply `npm audit fix` when it resolves issues without forcing unsafe overrides.

## Changes introduced (dependency-health work)

The following items were addressed so installs resolve cleanly, audits pass, and types match the declared stack:

| Area | Change |
|------|--------|
| ESLint peers | `@eslint/js` is pinned to the **9.x** line to match **eslint** ^9. Using `@eslint/js` 10.x with eslint 9 causes `ERESOLVE` peer conflicts. |
| Lockfile | `package-lock.json` was regenerated after that alignment; `npm audit fix` and `npm update` (within existing semver ranges) were applied. |
| Security | `npm audit` reports **0** vulnerabilities for the current tree (re-run after any dependency change). |
| Recharts 3 | Custom chart helpers in `src/components/ui/chart.tsx` use **`TooltipContentProps`** and **`DefaultLegendContentProps`**, because Recharts 3 no longer exposes tooltip/legend payload fields on the wrapper component prop types. |
| Vite build noise | `vite.config.ts` sets `build.chunkSizeWarningLimit` so the expected large main bundle does not trigger Rollup’s default 500 kB warning (the app bundles charts, Three.js, and related UI in one chunk until route-level splitting is added). |
| One-shot check | `package.json` includes script **`npm run verify`** (lint → production build → `npm audit`). |

## Commands

### Routine verification (recommended)

From a clean or existing tree:

```bash
npm run verify
```

This runs, in order: **`npm run lint`**, **`npm run build`** (`tsc -b` then `vite build`), **`npm audit`**.

### Strict CI-style check (clean install)

Use this before a release or when debugging “works on my machine” issues:

```bash
rm -rf node_modules dist
npm ci
npm run verify
npx eslint . --max-warnings 0
```

### Production-only audit

To see advisories affecting only runtime dependencies (excluding devDependencies):

```bash
npm audit --omit=dev
```

### Preview smoke test (optional)

After a successful build:

```bash
npm run preview
```

Then open the printed local URL and confirm the app loads (HTTP 200 on `/`).

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| `ERESOLVE` involving `@eslint/js` and `eslint` | Ensure `@eslint/js` major matches **eslint** (9.x with eslint 9, or upgrade both to a supported eslint 10 set together with plugins). |
| `npm ci` fails | Regenerate the lockfile with `npm install` **only** after intentional `package.json` edits, then commit the updated `package-lock.json`. Do not hand-edit the lockfile. |
| `invalid` packages in `npm ls` (e.g. wrong major for `zod`) | Remove `node_modules` and run **`npm ci`** so the tree matches the lockfile. |
| Type errors in `chart.tsx` after a Recharts upgrade | Compare with Recharts 3 exports: custom tooltip/legend content should use **`TooltipContentProps`** / **`DefaultLegendContentProps`**, not wrapper-only types. |

## Related files

| File | Role |
|------|------|
| `package.json` | Dependency declarations and scripts (`verify`, `build`, `lint`, …). |
| `package-lock.json` | Locked versions for reproducible installs. |
| `vite.config.ts` | Build options, including `chunkSizeWarningLimit`. |
| `eslint.config.js` | ESLint flat config. |
| `src/components/ui/chart.tsx` | Recharts-based chart primitives and typings. |

## Maintenance checklist (when bumping dependencies)

1. Edit `package.json` (or use `npm update` / targeted `npm install <pkg>@<range>`).
2. Run `npm install` to refresh `package-lock.json` if you changed direct dependencies.
3. Run `npm run verify` and fix any TypeScript or ESLint issues.
4. Run `npm audit`; apply `npm audit fix` where safe.
5. Commit **`package.json` and `package-lock.json`** together.
