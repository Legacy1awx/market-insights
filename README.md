# Northstar Markets

A calm, dark-first crypto market dashboard prototype focused on fast market context, asset discovery, and a persistent watchlist. This workspace is a React/Vite app, so the prototype follows the repository's React runtime rather than the requested standalone HTML/vanilla-JS packaging. No private API keys are used in the browser.

## Run it

- `pnpm install`
- `pnpm dev`
- `pnpm typecheck`
- `pnpm build`

The dashboard opens at `/`. Northstar uses the app's existing Vite setup and Tailwind configuration; its visual tokens and responsive rules live in `client/global.css`.

## Password accounts

Password sign-up and sign-in use Supabase Auth. Copy `.env.example` to `.env` and set:

- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — the project's public anon or publishable key; this key is intended for browser use

Enable email/password sign-in in Supabase Authentication and configure the site's allowed redirect URLs for local development (`http://localhost:8080`) and your deployed site origin. If email confirmation is enabled, users must follow the confirmation link sent by Supabase before signing in. Restart Vite after editing `.env`; set the same public variables in the deployment build environment.

Never put `SUPABASE_SERVICE_ROLE_KEY` in a `VITE_` variable or expose it to the browser. The account dialog reports when the public Auth settings are missing.

## Email delivery setup

Email delivery uses Resend, Supabase Postgres, and Netlify scheduled functions. Apply `supabase/migrations/202610070001_email_subscriptions.sql` to the Supabase project, verify a sending domain in Resend, and set these server-only environment variables in the deployment environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` — a sender address on the verified Resend domain
- `PUBLIC_SITE_URL` — the deployed HTTPS site origin
- `EMAIL_TOKEN_SECRET` — a randomly generated secret of at least 32 characters

Never expose these values through `VITE_` variables. The email-preferences dialog reports whether the database and verified sender are ready. Netlify runs price checks every five minutes and queues a weekly market brief on Mondays at 13:00 UTC; email subscriptions remain disabled until the migration and provider settings are configured.

## Admin workspace

The protected admin workspace is available at `/admin` and from Settings for admin accounts. It manages global market price/change overrides, published market stories, email subscriber alert preferences, registered user profiles, and user-submitted token transfer reviews. Admin access is checked on the server against the signed-in user's Supabase `app_metadata.role`; hiding the link in the UI is not the security boundary.

1. Apply the Supabase migrations in order: `202610070001_email_subscriptions.sql`, `202610150001_admin_workspace.sql`, `202610150002_deposit_tracking.sql`, `202610150003_managed_investments.sql`, `202610160001_managed_investment_charts.sql`, then `202610160002_continuous_investment_movement.sql`.
2. Configure server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` values for the Express/Netlify API. Never add the service-role key to a `VITE_` variable. Netlify serves the API through `netlify/functions/api.ts`.
3. In the Supabase SQL editor, grant the role to each intended administrator using their exact account email:

   ```sql
   update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
   where email = 'admin@example.com';
   ```

   The user must sign out and back in for the updated role claim to appear in their session. Do not use `user_metadata` for admin roles; users can edit that metadata themselves.

If the investment API reports that the chart migration is missing after it has been applied, refresh the Supabase PostgREST schema cache from the SQL editor with `NOTIFY pgrst, 'reload schema';`.

Market overrides affect all visitors and take precedence over feed values until cleared. Content is only displayed publicly after it is published. Admin subscriber actions can pause price-alert emails or unsubscribe an address from all email delivery.

## Sending funds

The **Send funds** navigation item opens `/send`. Users select USDT on TRON (TRC-20), BTC on Bitcoin, ETH on Ethereum, or SOL on Solana to reveal the receiving address. After transferring from an external wallet, a signed-in user can submit the amount and network transaction ID, with their public sender address optional. The app records submissions as **pending** and exposes the user's own status and any admin review note.

Admins can view all registered Supabase Auth profiles and browse all transfer submissions in paginated views in `/admin`. The review queue refreshes while open, and the user's submission history checks for status changes every 15 seconds while visible; submission, new-review, and decision notifications appear as pop-ups. Before confirming, an admin must open the relevant network explorer and verify the transaction, destination, asset, and amount. Rejections require a reason. Reviews record the admin, timestamp, status, and note in an audit table. This is a manual, self-reported review workflow: the app does not monitor chains, independently verify a transaction, accept custody of funds, or credit a balance. Never mark a transfer confirmed unless it has actually been verified on-chain.

## Account investments

After applying `202610150003_managed_investments.sql`, `202610160001_managed_investment_charts.sql`, and `202610160002_continuous_investment_movement.sql`, admins can use the **Investments** section in `/admin` to assign one USD investment record per user and supported asset (USDT, BTC, ETH, or SOL). The admin enters the invested amount and return amount; returns can be negative but cannot reduce the assigned value below zero. Admins can pause movement or configure an upward, downward, or continuous fluctuating value movement and its amount. The portfolio records the balance history and refreshes while open. Users can see the assigned amount, return, total, chart, and last update in the **Admin-assigned investments** section of Portfolio after signing in.

These records are manually managed account information, not live wallet balances, market-driven investment performance, or guaranteed returns. Configured chart movement is simulated and changes the assigned value; it is not a record of actual trades. Deposit submissions do not automatically create or change investment records; an admin must separately assign and update them. The existing editable personal portfolio tracker is stored locally in the user's browser and is separate from these account records.

## Product decisions

**Audience and personas**

- A first-time investor who needs plain-language context and clear source labels before exploring an asset.
- An active trader who wants a quick read on price action, timeframes, and momentum without a crowded terminal.
- A long-term holder who needs a short watchlist and an at-a-glance portfolio trend.

**Three key journeys**

1. Scan market cap, volume, dominance, and sentiment on Overview; this reduces the need to compare several sources before understanding the day's direction.
2. Search for an asset or choose a mover/watchlist row; inspect its price, range, volume, and coverage on the asset detail view. This avoids hiding asset context behind an advanced screen.
3. Add or remove a watchlist asset and choose theme, color-safe palette, or simulated/live data in Settings; immediate feedback and local persistence make changes reversible and demos reliable.

**Sitemap and navigation**

- Overview — the working dashboard and first screen.
- Asset detail — opened from search, movers, or watchlist.
- Markets — searchable/sortable asset directory with gainers/losers filters and watchlist controls.
- Portfolio — admin-assigned account investment balances and returns, plus a separate locally stored personal holdings tracker with editable quantity/cost basis, calculated P&L, allocation, and range selector.
- Alerts — create/edit/pause/delete price and percent rules with reached-state review; in-app checks run while the dashboard is open, and verified subscribers can opt into background email alerts.
- Screener — price, market-cap, volume, move, and direction filters with sortable results and locally saved screens.
- Global search and Settings — accessible from the top bar; mobile navigation uses a bottom tab bar.
- Accounts — sign up and sign in with an email and password through Supabase Auth; sessions persist on the device.
- Email preferences — manage double-opt-in price alerts and weekly market briefs separately from the password account.

## Wireframe descriptions

- **Desktop Overview:** persistent left navigation; slim top bar with search and connection state; market snapshot strip; large chart and movers/news column beside watchlist, portfolio summary, and trust note.
- **Mobile Overview:** compact top bar; two-column market snapshot; full-width chart with swipe-friendly timeframe controls; stacked movers, news, and watchlist; fixed bottom navigation.
- **Asset detail:** back-to-markets control, asset identity and price, four key stats, full-width chart, then news and asset context. On mobile the stats become two columns and supporting cards stack.
- **Markets:** desktop shows summary metrics and a sortable directory; mobile keeps the table horizontally scrollable and the watchlist filter reachable.
- **Portfolio:** value trend and allocation cards sit above an editable holdings table; on mobile the cards stack and the positions table scrolls horizontally.
- **Alerts:** the rule composer sits beside the alert list on desktop and stacks above it on mobile; reached, paused, and active states are labeled.
- **Screener:** filter panel and results table share a two-column desktop layout; on mobile the filter controls stack above the scrollable results.

## Design system

Core colors, semantic HSL tokens, dark/light themes, and color-safe chart colors are defined in `client/global.css`; matching semantic Tailwind color names are in `tailwind.config.ts`. The system uses Manrope for display headings, DM Sans for UI, tabular numerals, a 4/8px spacing rhythm, restrained green market accents, and muted positive/negative states. Components include responsive navigation, badges, search/settings dialogs, buttons, chart controls, indicator toggles, watchlist rows, toast feedback, and empty/skeleton states.

## Chart and data behavior

- Area, line, and candlestick modes; 1D through ALL timeframe controls; pointer crosshair with OHLC values; keyboard arrow-key inspection; 20-period moving average; volume bars; RSI (14); optional normalized comparison overlay.
- Simulated prices are enabled by default and move locally for offline demos. Switch to the public Binance feed in Settings for REST price bootstrap and throttled WebSocket ticker updates.
- The WebSocket reconnects with exponential backoff and pauses when the tab is hidden; hidden-tab simulation ticks are paused too. The header shows the feed mode and last update time.
- Chart data is a lightweight custom SVG implementation to avoid another runtime dependency. Detailed candle history, custom date range, MACD/Bollinger, chart error/retry states, and production-grade feed-health monitoring remain future work.

## Accessibility and trust checklist

- [x] Semantic landmarks, named navigation, dialog roles, and polite price-update region.
- [x] Visible keyboard focus; `Ctrl/Cmd + K` opens search and `Escape` closes dialogs.
- [x] Chart is keyboard focusable and has a plain-language screen-reader summary.
- [x] Reduced-motion preference, dark/light themes, and optional color-safe price palette.
- [x] Tabular number formatting, source label, update time, and an unobtrusive not-financial-advice disclaimer.
- [x] Watchlist, theme, simulation mode, color palette, and recent searches stay in localStorage on this browser.

## Trade-offs and next steps

Portfolio totals and editorial content are illustrative. Password authentication requires the Supabase public project URL and anon/publishable key; email subscriptions use separate server-side verification and durable preferences when Supabase, Resend, and Netlify are configured, and remain unavailable until the database migration and verified sender are ready. Password recovery is not currently provided. Binance USDT prices are shown as USD estimates; a production product should make quote-currency and delay assumptions explicit, validate feed freshness, and proxy any private or licensed data through a backend. The requested plain HTML/CSS/ES-module deliverable conflicts with this repository's React/Vite runtime; for a standalone non-React project, use a connected repo or the Builder VS Code extension/CLI workflow.
