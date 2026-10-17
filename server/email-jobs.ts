import {
  createUnsubscribeToken,
  escapeEmailHtml,
  getEmailServices,
  sendEmail,
} from "./email-service";

type MarketSnapshot = {
  symbol: string;
  price: number;
  change: number;
};
type OutboxJob = {
  id: string;
  subscriber_id: string;
  dedupe_key: string;
  kind: "price_alert" | "weekly_brief";
  payload: Record<string, unknown>;
  attempts: number;
};

const symbols = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "AVAX", "LINK"];
const symbolNames: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  BNB: "BNB",
  XRP: "XRP",
  ADA: "Cardano",
  AVAX: "Avalanche",
  LINK: "Chainlink",
};
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

async function getMarketSnapshot() {
  const query = encodeURIComponent(
    JSON.stringify(symbols.map((symbol) => `${symbol}USDT`)),
  );
  const response = await fetch(
    `https://api.binance.com/api/v3/ticker/24hr?symbols=${query}`,
    { signal: AbortSignal.timeout(10_000) },
  );
  if (!response.ok) throw new Error("Market price lookup failed.");
  const data = (await response.json()) as Array<{
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
  }>;
  return new Map<string, MarketSnapshot>(
    data.map((ticker) => {
      const symbol = ticker.symbol.slice(0, -4);
      return [
        symbol,
        {
          symbol,
          price: Number(ticker.lastPrice),
          change: Number(ticker.priceChangePercent),
        },
      ];
    }),
  );
}

export async function queueReachedPriceAlerts() {
  const services = getEmailServices();
  const snapshot = await getMarketSnapshot();
  const prices = Object.fromEntries(
    [...snapshot].map(([symbol, market]) => [symbol, market.price]),
  );
  const { data, error } = await services.database.rpc(
    "queue_reached_price_alerts",
    { p_prices: prices },
  );
  if (error) throw new Error("Triggered alerts could not be queued.");
  return { queued: Number(data ?? 0) };
}

export async function queueWeeklyBriefs() {
  const services = getEmailServices();
  const snapshot = await getMarketSnapshot();
  const assets = symbols.flatMap((symbol) => {
    const market = snapshot.get(symbol);
    return market ? [market] : [];
  });
  const week = new Date().toISOString().slice(0, 10);
  let offset = 0;
  let queued = 0;
  while (true) {
    const { data: subscribers, error } = await services.database
      .from("email_subscribers")
      .select("id")
      .eq("status", "active")
      .eq("weekly_brief", true)
      .range(offset, offset + 499);
    if (error) throw new Error("Weekly subscribers could not be loaded.");
    if (!subscribers?.length) break;
    const { error: queueError } = await services.database
      .from("email_outbox")
      .upsert(
        subscribers.map((subscriber) => ({
          subscriber_id: subscriber.id,
          dedupe_key: `weekly:${subscriber.id}:${week}`,
          kind: "weekly_brief",
          payload: { assets, week },
        })),
        { onConflict: "dedupe_key", ignoreDuplicates: true },
      );
    if (queueError) throw new Error("Weekly briefs could not be queued.");
    queued += subscribers.length;
    if (subscribers.length < 500) break;
    offset += 500;
  }
  return { queued };
}

function unsubscribeUrl(
  services: ReturnType<typeof getEmailServices>,
  subscriberId: string,
) {
  const token = createUnsubscribeToken(subscriberId, services.tokenSecret);
  const url = new URL("/api/email/unsubscribe", services.siteUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

function priceAlertCopy(payload: Record<string, unknown>) {
  const symbol = String(payload.symbol ?? "");
  const kind = String(payload.kind ?? "");
  const target = Number(payload.target);
  const currentPrice = Number(payload.currentPrice);
  const referencePrice = Number(payload.referencePrice);
  const move =
    Number.isFinite(referencePrice) && referencePrice > 0
      ? (currentPrice / referencePrice - 1) * 100
      : 0;
  const condition =
    kind === "above"
      ? `reached ${usd.format(target)}`
      : kind === "below"
        ? `fell below ${usd.format(target)}`
        : `${move >= 0 ? "rose" : "fell"} ${Math.abs(move).toFixed(2)}%`;
  return {
    subject: `${symbol} price alert: ${condition}`,
    text: `${symbol} (${symbolNames[symbol] ?? symbol}) ${condition}. Current price: ${usd.format(currentPrice)}.\n\nThis is a market notification, not investment advice.`,
    html: `<p><strong>${escapeEmailHtml(symbol)}</strong> (${escapeEmailHtml(symbolNames[symbol] ?? symbol)}) ${escapeEmailHtml(condition)}.</p><p>Current price: <strong>${escapeEmailHtml(usd.format(currentPrice))}</strong></p><p style="color:#667085;font-size:12px">Market data is indicative and not investment advice.</p>`,
  };
}

function weeklyBriefCopy(payload: Record<string, unknown>) {
  const assets = Array.isArray(payload.assets)
    ? (payload.assets as MarketSnapshot[])
    : [];
  const lines = assets.map((asset) => {
    const sign = asset.change >= 0 ? "+" : "−";
    return `${asset.symbol}: ${usd.format(asset.price)} (${sign}${Math.abs(asset.change).toFixed(2)}%)`;
  });
  const rows = assets.map((asset) => {
    const name = symbolNames[asset.symbol] ?? asset.symbol;
    const color = asset.change >= 0 ? "#118767" : "#c4515a";
    return `<tr><td style="padding:10px 0;border-bottom:1px solid #e5e7eb"><strong>${escapeEmailHtml(name)}</strong> <span style="color:#667085">${escapeEmailHtml(asset.symbol)}</span></td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right">${escapeEmailHtml(usd.format(asset.price))}</td><td style="padding:10px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:${color}">${asset.change >= 0 ? "+" : "−"}${Math.abs(asset.change).toFixed(2)}%</td></tr>`;
  });
  return {
    subject: "Your Northstar weekly market brief",
    text: `This week's market snapshot (24-hour changes)\n\n${lines.join("\n")}\n\nMarket prices are indicative and not investment advice.`,
    html: `<h1 style="font-size:22px">This week in markets</h1><p>A concise snapshot of major digital assets. Percent changes are over the past 24 hours.</p><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Asset</th><th style="text-align:right">Price</th><th style="text-align:right">24h</th></tr></thead><tbody>${rows.join("")}</tbody></table><p style="color:#667085;font-size:12px">Market data is indicative and not investment advice.</p>`,
  };
}

export async function deliverEmailOutbox(limit = 50) {
  const services = getEmailServices();
  const { data: jobs, error: claimError } = await services.database.rpc(
    "claim_email_outbox",
    { p_limit: limit },
  );
  if (claimError) throw new Error("Email queue could not be claimed.");

  let sent = 0;
  for (const job of (jobs ?? []) as OutboxJob[]) {
    try {
      const { data: subscriber, error: subscriberError } =
        await services.database
          .from("email_subscribers")
          .select("id, email, status, price_alerts, weekly_brief")
          .eq("id", job.subscriber_id)
          .maybeSingle();
      if (subscriberError) throw new Error("Email subscriber lookup failed.");
      const optedIn =
        job.kind === "price_alert"
          ? subscriber?.price_alerts
          : subscriber?.weekly_brief;
      if (!subscriber || subscriber.status !== "active" || !optedIn) {
        await services.database
          .from("email_outbox")
          .update({ status: "failed", last_error: "Subscription inactive." })
          .eq("id", job.id);
        continue;
      }

      const content =
        job.kind === "price_alert"
          ? priceAlertCopy(job.payload)
          : weeklyBriefCopy(job.payload);
      const unsubscribe = unsubscribeUrl(services, subscriber.id);
      await sendEmail(services, {
        to: subscriber.email,
        subject: content.subject,
        text: `${content.text}\n\nManage Northstar emails: ${unsubscribe}`,
        html: `${content.html}<p style="margin-top:24px;color:#667085;font-size:12px"><a href="${unsubscribe}">Unsubscribe from Northstar emails</a></p>`,
        headers: {
          "List-Unsubscribe": `<${unsubscribe}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        idempotencyKey: job.dedupe_key,
      });
      const { error: sentError } = await services.database
        .from("email_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", job.id)
        .eq("status", "sending");
      if (sentError)
        throw new Error("Email delivery status could not be recorded.");
      if (job.kind === "weekly_brief") {
        await services.database
          .from("email_subscribers")
          .update({ last_weekly_sent_at: new Date().toISOString() })
          .eq("id", subscriber.id);
      }
      sent += 1;
    } catch {
      const retryable = job.attempts < 5;
      await services.database
        .from("email_outbox")
        .update({
          status: retryable ? "queued" : "failed",
          next_attempt_at: new Date(
            Date.now() + Math.min(60_000 * 2 ** job.attempts, 6 * 60 * 60_000),
          ).toISOString(),
          last_error: "Delivery attempt failed.",
        })
        .eq("id", job.id)
        .eq("status", "sending");
    }
  }
  return { sent, processed: jobs?.length ?? 0 };
}
