# Agent verification — before moving on

Anyone (including AI agents) making changes to this repository **must** confirm dependencies are installed and the project **lints, tests, and builds** before starting new work or ending a session.

## Required checks

1. **Dependencies**
   - From the repo root: `npm install` (or `npm ci` for a clean install matching `package-lock.json`).
   - If `npm install` fails, **stop** and fix lockfile or network issues; do not proceed on a broken tree.

2. **Lint**
   - `npm run lint` must complete with **exit code 0**.

3. **Unit & component tests**
   - `npm run test` must complete with **exit code 0** (Vitest + Testing Library; `src/**/*.test.{ts,tsx}`).

4. **Production build**
   - `npm run build` must complete with **exit code 0** (runs `tsc -b` and `vite build`).

## One command (after install)

```bash
npm run verify
```

This runs **lint**, then **test**, then **build**. It does not install packages; run `npm install` first if `node_modules` is missing or stale.

- **`npm run test:watch`** — Vitest in watch mode during development.
- **`npm run test:coverage`** — coverage report (output under `coverage/`; gitignored).

## Clean-room check (CI parity)

To match what GitHub Actions runs:

```bash
npm run verify:install
```

This runs `npm ci` then `npm run verify`. Use when validating from a fresh clone or before a release.

## When to run

| Situation | Action |
|-----------|--------|
| Start of a task / new clone | `npm install` then `npm run verify` |
| After editing dependencies | `npm install` then `npm run verify` |
| Before commit / PR | `npm run verify` |
| Before marking work “done” | `npm run verify` (and push so **CI** runs) |

## What CI enforces

The **CI** workflow (`.github/workflows/ci.yml`) runs `npm ci` and `npm run verify` on every push and pull request to `main` and `cursor/**` branches. **Do not merge or hand off work that fails CI.**

## Optional manual smoke test

After `npm run verify`, you may run `npm run dev` and click through the app locally. Automated CI does not start a browser; critical UX checks are manual.

---

*Keep this checklist aligned with `package.json` scripts.*
