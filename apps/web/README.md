# PDF Craft web app

The user interface for [PDF Craft](../../README.md): Next.js 16, React 19,
TypeScript and Tailwind CSS 4.

## Run

```bash
npm ci
npm run dev          # http://localhost:3000, expects the API on http://127.0.0.1:8000
npm run lint
npm run build        # production build (standalone server in .next/standalone)
```

The app calls the backend through the `/api/backend/*` path, which Next.js
forwards to the address in `API_INTERNAL_URL` (default `http://127.0.0.1:8000`,
read when the app is built or the dev server starts).

## Structure

```
src/app/                       page, layout, global CSS (design tokens, legacy colour bridge)
src/components/workflows/      one screen per tool
  registry.tsx                   tool id -> screen, each loaded on demand
  shared/                        upload area, page preview, result card, hooks
src/components/layout/         app shell (sidebar, top bar) and the Ctrl K command palette
src/components/dashboard/      tools page and files page
src/components/settings/       settings, theme picker and the custom theme creator
src/components/theme/          theme provider (applies colours before first paint)
src/components/ui/             small shared controls (button, input, segmented, toaster)
src/components/auth/           sign-in page and gate
src/lib/api.ts                 every call to the backend
src/lib/tools.ts               the tool list shown on the tools page
src/lib/themes.ts              built-in themes, theme derivation and contrast checks
```

## Adding a tool

1. Add an entry to `src/lib/tools.ts` (id, name, category, icon).
2. Write the screen in `src/components/workflows/`. Copy a small one such as
   `AddTextWorkflow.tsx` and use the building blocks in `shared/`.
3. Add its API call to `src/lib/api.ts`.
4. Register it in `src/components/workflows/registry.tsx`.

Next.js 16 differs from older versions; consult `node_modules/next/dist/docs/`
before changing routing or configuration.

For deployment, see [docs/self-hosting.md](../../docs/self-hosting.md).
