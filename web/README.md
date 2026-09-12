# Loan Calculator — web

React frontend for the loan calculator. Vite 8 + React 19 + [Base UI](https://base-ui.com),
deployed to Vercel alongside the Python model.

## Stack

| Piece | Choice |
| --- | --- |
| Bundler | Vite 8 (Rolldown) |
| React plugin | `@vitejs/plugin-react` with `compiler: true` |
| React Compiler | `oxc-transform-react` — the Rust port, no Babel in the pipeline |
| Components | `@base-ui/react` (NumberField, Switch, Field, Tabs, Accordion) |
| Styling | Plain CSS with custom properties, light/dark via `prefers-color-scheme` |
| Hosting | Vercel — static output plus a Python Function |

## Where the maths happens

Nowhere in here. The frontend is a thin client over `/api/schedule`, a Vercel
Python Function that calls `loan_calculator.py` at the repo root. `src/lib/api.ts`
holds the request and response types, and nothing else in `src/` knows how a
loan works.

- `GET /api/schedule` returns the defaults from `config.py`, which seed the
  equity input and the **Assumptions** panel.
- `POST /api/schedule` returns the projected balance, interest, dividend,
  deduction and monthly cost series.

`src/lib/useSchedule.ts` debounces edits by 200 ms and aborts any request a
newer edit has superseded, so dragging a stepper doesn't queue up calls. The
previous result stays on screen, dimmed, while the next one is in flight.

## Commands

Run both halves — the API first, then the dev server, which proxies `/api` to it:

```sh
npm run dev:api                 # or: ../.venv/bin/python ../scripts/dev_api.py
npm run dev                     # :5173, proxies /api to :8000
```

Set `API_PORT` if 8000 is taken; `vite.config.ts` reads it.

```sh
npm install
npm run build      # type-check, then build to dist/
npm run preview
npm run typecheck
```

Tests live with the model, in `tests/` at the repo root.

## Deploying

The Vercel project root is the **repo root**, not this directory, so the build
can see both `web/` and `api/`. `vercel.json` at the root sets the install and
build commands, points `outputDirectory` at `web/dist`, and rewrites everything
except `/api/*` to `index.html`.
