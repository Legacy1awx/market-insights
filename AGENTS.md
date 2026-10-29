# Fusion Starter

A production-ready full-stack React application template with integrated Express server, featuring React Router 6 SPA mode, TypeScript, Vitest, Zod and modern tooling.

While the starter comes with a express server, only create endpoint when strictly neccesary, for example to encapsulate logic that must leave in the server, such as private keys handling, or certain DB operations, db...

## Tech Stack

- **PNPM**: Prefer pnpm
- **Frontend**: React 18 + React Router 6 (spa) + TypeScript + Vite + TailwindCSS 3
- **Backend**: Express server integrated with Vite dev server
- **Testing**: Vitest
- **UI**: Radix UI + TailwindCSS 3 + Lucide React icons

## Project Structure

```
client/                   # React SPA frontend
├── pages/                # Route components (Index.tsx = home)
├── components/ui/        # Pre-built UI component library
├── App.tsx                # App entry point and with SPA routing setup
└── global.css            # TailwindCSS 3 theming and global styles

server/                   # Express API backend
├── index.ts              # Main server setup (express config + routes)
└── routes/               # API handlers

shared/                   # Types used by both client & server
└── api.ts                # Example of how to share api interfaces
```

## Key Features

## SPA Routing System

The routing system is powered by React Router 6:

- `client/pages/Index.tsx` represents the home page.
- Routes are defined in `client/App.tsx` using the `react-router-dom` import
- Route files are located in the `client/pages/` directory

For example, routes can be defined with:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";

<Routes>
  <Route path="/" element={<Index />} />
  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
  <Route path="*" element={<NotFound />} />
</Routes>;
```

### Styling System

- **Primary**: TailwindCSS 3 utility classes
- **Theme and design tokens**: Configure in `client/global.css` 
- **UI components**: Pre-built library in `client/components/ui/`
- **Utility**: `cn()` function combines `clsx` + `tailwind-merge` for conditional classes

```typescript
// cn utility usage
className={cn(
  "base-classes",
  { "conditional-class": condition },
  props.className  // User overrides
)}
```

### Translations (i18n)

User-facing text is translated with `react-i18next`. Don't hard-code UI strings.

- Dictionaries live in `client/i18n/locales/` (`en.ts` is the source; `es`, `fr`, `de`, `pt`, `zh` must have the same keys — the `Translation` type enforces it).
- In components: `const { t } = useTranslation();` then `t("section.key", { name })`. Outside React (hooks' toasts, `lib/`), use `i18n.t` from `@/i18n`.
- Plurals use `_one` / `_other` suffixes with a `count` option; inline markup uses `<Trans i18nKey="…" components={{ b: <b /> }} />`.
- Format money and dates with `formatUsd`, `usdFormat`, `numberFormat`, `formatDate`, `dateFormat` from `@/i18n/format` (never `Intl.*("en-US")`).
- To add a language: add it to `client/i18n/languages.ts`, create `locales/<code>.ts`, and register its loader in `client/i18n/index.ts`. RTL codes are listed in `languages.ts`.
- `pnpm test` runs `client/i18n/locales.spec.ts`, which fails on missing keys, mismatched `{{placeholders}}`, or `t()` keys that don't exist.
- The admin workspace (`Admin.tsx`, `AdminUserProfile.tsx`, `components/admin/`) is not translated yet.

### Market data

All prices and charts come from the live market. Never hard-code market numbers.

- `client/lib/market.ts` is the single data layer: Binance's public market-data hosts (`data-api.binance.vision`, `data-stream.binance.vision`) for prices, candles and the live stream, plus CoinGecko for market caps, supply, 7-day sparklines and global totals. CoinGecko is also the fallback where Binance is blocked. Requests are cached briefly and shared.
- In components, use the hooks in `client/hooks/use-market.ts` (`useLiveTickers`, `useCandles`, `useAssetMarkets`, `useGlobalMarket`, `useFearGreed`).
- Charts: `components/market/MarketChart.tsx` (interactive, responsive) and `components/market/Sparkline.tsx`. Labels are HTML, not SVG text, so they stay readable on phones.
- Show `—` while a value is loading or unavailable; never fall back to made-up numbers. The dashboard's "simulation mode" (Settings) is the only place sample prices are used, and it is off by default.

### Express Server Integration

- **Development**: Single port (8080) for both frontend/backend
- **Hot reload**: Both client and server code
- **API endpoints**: Prefixed with `/api/`

#### Example API Routes
- `GET /api/ping` - Simple ping api
- `GET /api/demo` - Demo endpoint  

### Shared Types
Import consistent types in both client and server:
```typescript
import { DemoResponse } from '@shared/api';
```

Path aliases:
- `@shared/*` - Shared folder
- `@/*` - Client folder

## Development Commands

```bash
pnpm dev        # Start dev server (client + server)
pnpm build      # Production build
pnpm start      # Start production server
pnpm typecheck  # TypeScript validation
pnpm test          # Run Vitest tests
```

## Adding Features

### Add new colors to the theme

Open `client/global.css` and `tailwind.config.ts` and add new tailwind colors.

### New API Route
1. **Optional**: Create a shared interface in `shared/api.ts`:
```typescript
export interface MyRouteResponse {
  message: string;
  // Add other response properties here
}
```

2. Create a new route handler in `server/routes/my-route.ts`:
```typescript
import { RequestHandler } from "express";
import { MyRouteResponse } from "@shared/api"; // Optional: for type safety

export const handleMyRoute: RequestHandler = (req, res) => {
  const response: MyRouteResponse = {
    message: 'Hello from my endpoint!'
  };
  res.json(response);
};
```

3. Register the route in `server/index.ts`:
```typescript
import { handleMyRoute } from "./routes/my-route";

// Add to the createServer function:
app.get("/api/my-endpoint", handleMyRoute);
```

4. Use in React components with type safety:
```typescript
import { MyRouteResponse } from '@shared/api'; // Optional: for type safety

const response = await fetch('/api/my-endpoint');
const data: MyRouteResponse = await response.json();
```

### New Page Route
1. Create component in `client/pages/MyPage.tsx`
2. Add route in `client/App.tsx`:
```typescript
<Route path="/my-page" element={<MyPage />} />
```

## Production Deployment

- **Standard**: `pnpm build`
- **Binary**: Self-contained executables (Linux, macOS, Windows)
- **Cloud Deployment**: Use either Netlify or Vercel via their MCP integrations for easy deployment. Both providers work well with this starter template.

### Vercel

- `vercel.json` runs `pnpm run build:vercel`, serves `dist/spa` as static files, and rewrites all non-API paths to `index.html` for client-side routing.
- `build:vercel` also bundles the Express API (`server/vercel.ts`, via `vite.config.vercel.ts`) into `dist/vercel/app.mjs`. The function `api/index.mjs` re-exports it, and every `/api/*` request is rewritten to it.
- Set the variables from `.env.example` in the Vercel project settings. `VITE_*` values are read at build time, so redeploy after changing them.

## Architecture Notes

- Single-port development with Vite + Express integration
- TypeScript throughout (client, server, shared)
- Full hot reload for rapid development
- Production-ready with multiple deployment options
- Comprehensive UI component library included
- Type-safe API communication via shared interfaces
