import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { logAuthFailure } from "../supabase-env.ts";
import { z } from "zod";
import { createAdminWithdrawalRouter } from "./withdrawals.ts";

const symbols = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "AVAX", "LINK"];
const contentSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(500),
  category: z.string().trim().min(1).max(60),
  readMinutes: z.number().int().min(1).max(60),
  published: z.boolean(),
});
const marketOverrideSchema = z.object({
  symbol: z.enum(symbols as [string, ...string[]]),
  price: z.number().positive().finite().nullable(),
  change: z.number().finite().min(-100).max(1000).nullable(),
});
const alertActionSchema = z.object({
  action: z.enum(["disable", "unsubscribe"]),
});
export const depositReviewSchema = z
  .object({
    status: z.enum(["confirmed", "rejected"]),
    note: z.string().trim().max(500),
    verifiedOnExplorer: z.boolean(),
    // USD amount added to the user's investment in the transferred currency.
    creditUsd: z
      .string()
      .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/)
      .optional(),
  })
  .refine(
    (review) =>
      (review.status !== "confirmed" || review.verifiedOnExplorer) &&
      (review.status !== "rejected" || review.note.length > 0),
  )
  .refine(
    (review) =>
      review.status !== "confirmed" ||
      (review.creditUsd !== undefined && Number(review.creditUsd) > 0),
    { path: ["creditUsd"], message: "Enter the USD amount to credit." },
  );

// Movement interval: 1 minute to 24 hours (the database allows up to 86,400 s).
export const movementIntervalSeconds = z.number().int().min(60).max(86_400);

const usdAmount = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);
const signedUsdAmount = z
  .string()
  .regex(/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/);

function usdToCents(value: string) {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return negative ? -cents : cents;
}

export function sumInvestedUsdByUser(
  investments: { user_id: string; invested_usd: string | number }[],
) {
  const totals = new Map<string, bigint>();
  for (const investment of investments) {
    const userTotal = totals.get(investment.user_id) ?? 0n;
    totals.set(
      investment.user_id,
      userTotal + usdToCents(String(investment.invested_usd)),
    );
  }

  return new Map(
    [...totals].map(([userId, cents]) => [userId, centsToUsd(cents)]),
  );
}

function centsToUsd(cents: bigint) {
  const sign = cents < 0n ? "-" : "";
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

/** Adds a confirmed transfer's USD value to the user's investment in that currency. */
async function creditDepositToInvestment(
  database: SupabaseClient,
  adminUserId: string,
  depositId: string,
  creditUsd: string,
) {
  const { data: deposit, error: depositError } = await database
    .from("deposit_submissions")
    .select("user_id, symbol")
    .eq("id", depositId)
    .single();
  if (depositError || !deposit) throw depositError ?? new Error("missing");
  const { data: existing, error: lookupError } = await database
    .from("managed_investments")
    .select("id, invested_usd")
    .eq("user_id", deposit.user_id)
    .eq("symbol", deposit.symbol)
    .maybeSingle();
  if (lookupError) throw lookupError;
  const now = new Date().toISOString();
  if (existing) {
    const { error } = await database
      .from("managed_investments")
      .update({
        invested_usd: centsToUsd(
          usdToCents(String(existing.invested_usd)) + usdToCents(creditUsd),
        ),
        updated_by: adminUserId,
        updated_at: now,
      })
      .eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await database.from("managed_investments").insert({
      user_id: deposit.user_id,
      symbol: deposit.symbol,
      invested_usd: creditUsd,
      return_usd: "0",
      movement_direction: "paused",
      movement_amount: "1.00",
      movement_interval_seconds: 60,
      next_movement_at: new Date(Date.now() + 60_000).toISOString(),
      updated_by: adminUserId,
      updated_at: now,
    });
    if (error) throw error;
  }
  return deposit.symbol as string;
}

function fullNameFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
) {
  const existingName = metadata?.full_name ?? metadata?.name;
  if (typeof existingName === "string" && existingName.trim()) {
    return existingName.trim();
  }
  const firstName =
    typeof metadata?.first_name === "string" ? metadata.first_name.trim() : "";
  const lastName =
    typeof metadata?.last_name === "string" ? metadata.last_name.trim() : "";
  return [firstName, lastName].filter(Boolean).join(" ") || null;
}

export const managedInvestmentSchema = z
  .object({
    userId: z.string().uuid(),
    symbol: z.enum(["USDT", "BTC", "ETH", "SOL"]),
    investedUsd: usdAmount,
    returnUsd: signedUsdAmount,
    movementDirection: z
      .enum(["up", "down", "continuous", "paused"])
      .default("paused"),
    movementAmount: usdAmount.default("1.00"),
    movementIntervalSeconds: movementIntervalSeconds.default(60),
  })
  .superRefine((investment, context) => {
    if (
      !usdAmount.safeParse(investment.investedUsd).success ||
      !signedUsdAmount.safeParse(investment.returnUsd).success
    )
      return;
    if (usdToCents(investment.investedUsd) <= 0n) {
      context.addIssue({
        code: "custom",
        path: ["investedUsd"],
        message: "Investment amount must be greater than zero.",
      });
    }
    if (usdToCents(investment.movementAmount) <= 0n) {
      context.addIssue({
        code: "custom",
        path: ["movementAmount"],
        message: "Movement amount must be greater than zero.",
      });
    }
    if (
      usdToCents(investment.returnUsd) <
      -usdToCents(investment.investedUsd)
    ) {
      context.addIssue({
        code: "custom",
        path: ["returnUsd"],
        message: "Return cannot reduce the investment below zero.",
      });
    }
  });

type AdminRequest = Request & {
  adminDatabase?: SupabaseClient;
  adminUserId?: string;
};

function createAdminDatabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Admin service is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sendDatabaseError(response: Response) {
  response.status(503).json({ error: "admin_storage_unavailable" });
}

const chartMigrationErrorCodes = new Set([
  "PGRST202",
  "PGRST204",
  "PGRST205",
  "42P01",
  "42703",
  "42883",
]);

function sendInvestmentChartDatabaseError(
  response: Response,
  error: { code?: string; message?: string },
) {
  // The original direction constraint only allows up/down/paused.
  if (
    error.code === "23514" &&
    error.message?.includes("movement_direction_check")
  ) {
    response
      .status(503)
      .json({ error: "continuous_movement_migration_required" });
    return;
  }
  if (error.code && chartMigrationErrorCodes.has(error.code)) {
    response
      .status(503)
      .json({ error: "investment_chart_migration_required" });
    return;
  }
  sendDatabaseError(response);
}

export const publicAdminDataRouter = Router();

publicAdminDataRouter.get("/market-overrides", async (_request, response) => {
  try {
    const { data, error } = await createAdminDatabase()
      .from("market_overrides")
      .select("symbol, price_override, change_override");
    if (error) throw error;
    response.set("Cache-Control", "no-store").json(
      (data ?? []).map((row) => ({
        symbol: row.symbol,
        price: row.price_override === null ? null : Number(row.price_override),
        change:
          row.change_override === null ? null : Number(row.change_override),
      })),
    );
  } catch {
    sendDatabaseError(response);
  }
});

publicAdminDataRouter.get("/content", async (_request, response) => {
  try {
    const { data, error } = await createAdminDatabase()
      .from("market_content")
      .select("id, title, summary, category, read_minutes, published_at")
      .eq("published", true)
      .order("published_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    response.set("Cache-Control", "no-store").json(
      (data ?? []).map((article) => ({
        id: article.id,
        title: article.title,
        summary: article.summary,
        category: article.category,
        readMinutes: article.read_minutes,
        publishedAt: article.published_at,
      })),
    );
  } catch {
    sendDatabaseError(response);
  }
});

const adminRouter = Router();

adminRouter.use(
  async (request: AdminRequest, response: Response, next: NextFunction) => {
    const token = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      response.status(401).json({ error: "authentication_required" });
      return;
    }
    try {
      const database = createAdminDatabase();
      const { data, error } = await database.auth.getUser(token);
      if (error || !data.user) {
        console.warn(
          "[admin] Sign-in token rejected:",
          error?.message ?? "no user",
        );
        response.status(401).json({ error: "authentication_required" });
        return;
      }
      if (data.user.app_metadata?.role !== "admin") {
        response.status(403).json({ error: "admin_access_required" });
        return;
      }
      request.adminDatabase = database;
      request.adminUserId = data.user.id;
      next();
    } catch (error) {
      logAuthFailure("admin", error);
      response.status(503).json({ error: "admin_service_unavailable" });
    }
  },
);

adminRouter.use(
  "/withdrawals",
  createAdminWithdrawalRouter((metadata) => fullNameFromMetadata(metadata)),
);

adminRouter.get(
  "/market-overrides",
  async (request: AdminRequest, response) => {
    const { data, error } = await request
      .adminDatabase!.from("market_overrides")
      .select("symbol, price_override, change_override, updated_at")
      .order("symbol");
    if (error) return sendDatabaseError(response);
    response.json(
      (data ?? []).map((row) => ({
        symbol: row.symbol,
        price: row.price_override === null ? null : Number(row.price_override),
        change:
          row.change_override === null ? null : Number(row.change_override),
        updatedAt: row.updated_at,
      })),
    );
  },
);

adminRouter.put(
  "/market-overrides",
  async (request: AdminRequest, response) => {
    const parsed = marketOverrideSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "invalid_market_override" });
      return;
    }
    const { symbol, price, change } = parsed.data;
    if (price === null && change === null) {
      response.status(400).json({ error: "override_value_required" });
      return;
    }
    const { error } = await request
      .adminDatabase!.from("market_overrides")
      .upsert({
        symbol,
        price_override: price,
        change_override: change,
        updated_at: new Date().toISOString(),
      });
    if (error) return sendDatabaseError(response);
    response.status(204).end();
  },
);

adminRouter.delete(
  "/market-overrides/:symbol",
  async (request: AdminRequest, response) => {
    const symbol = z
      .enum(symbols as [string, ...string[]])
      .safeParse(request.params.symbol);
    if (!symbol.success) {
      response.status(400).json({ error: "invalid_asset_symbol" });
      return;
    }
    const { error } = await request
      .adminDatabase!.from("market_overrides")
      .delete()
      .eq("symbol", symbol.data);
    if (error) return sendDatabaseError(response);
    response.status(204).end();
  },
);

adminRouter.get("/content", async (request: AdminRequest, response) => {
  const { data, error } = await request
    .adminDatabase!.from("market_content")
    .select(
      "id, title, summary, category, read_minutes, published, published_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return sendDatabaseError(response);
  response.json(
    (data ?? []).map((article) => ({
      id: article.id,
      title: article.title,
      summary: article.summary,
      category: article.category,
      readMinutes: article.read_minutes,
      published: article.published,
      publishedAt: article.published_at,
    })),
  );
});

adminRouter.post("/content", async (request: AdminRequest, response) => {
  const parsed = contentSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "invalid_content" });
    return;
  }
  const { title, summary, category, readMinutes, published } = parsed.data;
  const { data, error } = await request
    .adminDatabase!.from("market_content")
    .insert({
      title,
      summary,
      category,
      read_minutes: readMinutes,
      published,
      published_at: published ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) return sendDatabaseError(response);
  response.status(201).json({ id: data.id });
});

adminRouter.put("/content/:id", async (request: AdminRequest, response) => {
  const id = z.string().uuid().safeParse(request.params.id);
  const parsed = contentSchema.safeParse(request.body);
  if (!id.success || !parsed.success) {
    response.status(400).json({ error: "invalid_content" });
    return;
  }
  const { data: previous, error: readError } = await request
    .adminDatabase!.from("market_content")
    .select("published_at")
    .eq("id", id.data)
    .maybeSingle();
  if (readError) return sendDatabaseError(response);
  if (!previous) {
    response.status(404).json({ error: "content_not_found" });
    return;
  }
  const { title, summary, category, readMinutes, published } = parsed.data;
  const { error } = await request
    .adminDatabase!.from("market_content")
    .update({
      title,
      summary,
      category,
      read_minutes: readMinutes,
      published,
      published_at: published
        ? (previous.published_at ?? new Date().toISOString())
        : null,
    })
    .eq("id", id.data);
  if (error) return sendDatabaseError(response);
  response.status(204).end();
});

adminRouter.delete("/content/:id", async (request: AdminRequest, response) => {
  const id = z.string().uuid().safeParse(request.params.id);
  if (!id.success) {
    response.status(400).json({ error: "invalid_content_id" });
    return;
  }
  const { error, count } = await request
    .adminDatabase!.from("market_content")
    .delete({ count: "exact" })
    .eq("id", id.data);
  if (error) return sendDatabaseError(response);
  if (count === 0) {
    response.status(404).json({ error: "content_not_found" });
    return;
  }
  response.status(204).end();
});

adminRouter.get("/alerts", async (request: AdminRequest, response) => {
  const database = request.adminDatabase!;
  const { data: subscribers, error } = await database
    .from("email_subscribers")
    .select("id, email, status, price_alerts, weekly_brief, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return sendDatabaseError(response);
  const ids = (subscribers ?? []).map((subscriber) => subscriber.id);
  const { data: rules, error: rulesError } = ids.length
    ? await database
        .from("email_alert_rules")
        .select("subscriber_id")
        .in("subscriber_id", ids)
    : { data: [], error: null };
  if (rulesError) return sendDatabaseError(response);
  const counts = new Map<string, number>();
  for (const rule of rules ?? []) {
    counts.set(rule.subscriber_id, (counts.get(rule.subscriber_id) ?? 0) + 1);
  }
  response.json(
    (subscribers ?? []).map((subscriber) => ({
      id: subscriber.id,
      email: subscriber.email,
      status: subscriber.status,
      priceAlerts: subscriber.price_alerts,
      weeklyBrief: subscriber.weekly_brief,
      ruleCount: counts.get(subscriber.id) ?? 0,
      createdAt: subscriber.created_at,
    })),
  );
});

adminRouter.get("/investments", async (request: AdminRequest, response) => {
  const userId = z.string().uuid().safeParse(request.query.userId);
  if (!userId.success) {
    response.status(400).json({ error: "invalid_investment_user" });
    return;
  }
  const database = request.adminDatabase!;
  const { error: advanceError } = await database.rpc(
    "advance_managed_investments",
    { p_user_id: userId.data },
  );
  if (advanceError)
    return sendInvestmentChartDatabaseError(response, advanceError);
  const { data, error } = await request
    .adminDatabase!.from("managed_investments")
    .select(
      "id, symbol, invested_usd, return_usd, movement_direction, movement_amount, movement_interval_seconds, updated_at",
    )
    .eq("user_id", userId.data)
    .order("symbol");
  if (error) return sendInvestmentChartDatabaseError(response, error);
  const investmentIds = (data ?? []).map((investment) => investment.id);
  const { data: history, error: historyError } = investmentIds.length
    ? await database
        .from("managed_investment_history")
        .select("managed_investment_id, balance_usd, recorded_at")
        .in("managed_investment_id", investmentIds)
        .order("recorded_at", { ascending: true })
    : { data: [], error: null };
  if (historyError)
    return sendInvestmentChartDatabaseError(response, historyError);
  const historyByInvestment = new Map<
    string,
    { recordedAt: string; balanceUsd: string }[]
  >();
  for (const point of history ?? []) {
    const points = historyByInvestment.get(point.managed_investment_id) ?? [];
    points.push({
      recordedAt: point.recorded_at,
      balanceUsd: String(point.balance_usd),
    });
    historyByInvestment.set(point.managed_investment_id, points);
  }
  response.set("Cache-Control", "no-store").json(
    (data ?? []).map((investment) => ({
      id: investment.id,
      symbol: investment.symbol,
      investedUsd: String(investment.invested_usd),
      returnUsd: String(investment.return_usd),
      movementDirection: investment.movement_direction,
      movementAmount: String(investment.movement_amount),
      movementIntervalSeconds: investment.movement_interval_seconds,
      history: historyByInvestment.get(investment.id) ?? [],
      updatedAt: investment.updated_at,
    })),
  );
});

adminRouter.put("/investments", async (request: AdminRequest, response) => {
  const parsed = managedInvestmentSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "invalid_managed_investment",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }
  const {
    userId,
    symbol,
    investedUsd,
    returnUsd,
    movementDirection,
    movementAmount,
    movementIntervalSeconds: intervalSeconds,
  } = parsed.data;
  const { error } = await request.adminDatabase!.from("managed_investments").upsert(
    {
      user_id: userId,
      symbol,
      invested_usd: investedUsd,
      return_usd: returnUsd,
      movement_direction: movementDirection,
      movement_amount: movementAmount,
      movement_interval_seconds: intervalSeconds,
      next_movement_at: new Date(
        Date.now() + intervalSeconds * 1000,
      ).toISOString(),
      updated_by: request.adminUserId!,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,symbol" },
  );
  if (error) return sendInvestmentChartDatabaseError(response, error);
  response.status(204).end();
});

export const investmentMovementSchema = z.object({
  movementDirection: z.enum(["up", "down", "continuous", "paused"]),
  movementAmount: usdAmount
    .refine((amount) => usdToCents(amount) > 0n)
    .optional(),
  movementIntervalSeconds: movementIntervalSeconds.optional(),
});

adminRouter.patch(
  "/investments/:id/movement",
  async (request: AdminRequest, response) => {
    const id = z.string().uuid().safeParse(request.params.id);
    const parsed = investmentMovementSchema.safeParse(request.body);
    if (!id.success || !parsed.success) {
      response.status(400).json({
        error: "invalid_investment_movement",
        details: parsed.success
          ? undefined
          : parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const database = request.adminDatabase!;
    const { data: investment, error: lookupError } = await database
      .from("managed_investments")
      .select("user_id, movement_interval_seconds")
      .eq("id", id.data)
      .maybeSingle();
    if (lookupError)
      return sendInvestmentChartDatabaseError(response, lookupError);
    if (!investment) {
      response.status(404).json({ error: "investment_not_found" });
      return;
    }
    // Settle movement owed under the old direction before switching.
    const { error: advanceError } = await database.rpc(
      "advance_managed_investments",
      { p_user_id: investment.user_id },
    );
    if (advanceError)
      return sendInvestmentChartDatabaseError(response, advanceError);
    const { movementDirection, movementAmount } = parsed.data;
    const intervalSeconds =
      parsed.data.movementIntervalSeconds ??
      investment.movement_interval_seconds;
    const { error } = await database
      .from("managed_investments")
      .update({
        movement_direction: movementDirection,
        ...(movementAmount ? { movement_amount: movementAmount } : {}),
        movement_interval_seconds: intervalSeconds,
        next_movement_at: new Date(
          Date.now() + intervalSeconds * 1000,
        ).toISOString(),
        updated_by: request.adminUserId!,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id.data);
    if (error) return sendInvestmentChartDatabaseError(response, error);
    response.status(204).end();
  },
);

adminRouter.delete(
  "/investments/:id",
  async (request: AdminRequest, response) => {
    const id = z.string().uuid().safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ error: "invalid_investment_id" });
      return;
    }
    const { count, error } = await request
      .adminDatabase!.from("managed_investments")
      .delete({ count: "exact" })
      .eq("id", id.data);
    if (error) return sendDatabaseError(response);
    if (count === 0) {
      response.status(404).json({ error: "investment_not_found" });
      return;
    }
    response.status(204).end();
  },
);

adminRouter.get("/deposits", async (request: AdminRequest, response) => {
  const status = z
    .enum(["all", "pending", "confirmed", "rejected"])
    .safeParse(request.query.status ?? "all");
  const page = z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .safeParse(request.query.page ?? "1");
  const userId = z.string().uuid().optional().safeParse(request.query.userId);
  if (!status.success || !page.success || !userId.success) {
    response.status(400).json({ error: "invalid_deposit_query" });
    return;
  }
  const perPage = 50;
  let query = request
    .adminDatabase!.from("deposit_submissions")
    .select(
      "id, user_id, symbol, network, amount, transaction_hash, sender_address, recipient_address, status, review_note, reviewed_by, reviewed_at, submitted_at",
      { count: "exact" },
    )
    .order("submitted_at", { ascending: false })
    .range((page.data - 1) * perPage, page.data * perPage - 1);
  if (status.data !== "all") query = query.eq("status", status.data);
  if (userId.data) query = query.eq("user_id", userId.data);
  const { data: deposits, count, error } = await query;
  if (error) return sendDatabaseError(response);

  const userIds = [
    ...new Set((deposits ?? []).map((deposit) => deposit.user_id)),
  ];
  const users = await Promise.all(
    userIds.map(async (id) => {
      const { data, error: userError } =
        await request.adminDatabase!.auth.admin.getUserById(id);
      if (userError) throw userError;
      return data.user;
    }),
  );
  const profiles = new Map(users.map((user) => [user.id, user]));
  const depositIds = (deposits ?? []).map((deposit) => deposit.id);
  const { data: reviewEvents, error: reviewError } = depositIds.length
    ? await request
        .adminDatabase!.from("deposit_review_events")
        .select("id, submission_id, admin_id, new_status, note, created_at")
        .in("submission_id", depositIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (reviewError) return sendDatabaseError(response);
  const reviewerIds = [
    ...new Set((reviewEvents ?? []).flatMap((event) => event.admin_id ?? [])),
  ];
  const reviewers = await Promise.all(
    reviewerIds.map(async (id) => {
      const { data, error: reviewerError } =
        await request.adminDatabase!.auth.admin.getUserById(id);
      if (reviewerError) throw reviewerError;
      return data.user;
    }),
  );
  const reviewerProfiles = new Map(
    reviewers.map((reviewer) => [reviewer.id, reviewer]),
  );
  const eventsByDeposit = new Map<string, typeof reviewEvents>();
  for (const event of reviewEvents ?? []) {
    const events = eventsByDeposit.get(event.submission_id) ?? [];
    events.push(event);
    eventsByDeposit.set(event.submission_id, events);
  }

  const total = count ?? 0;
  response.set("Cache-Control", "no-store").json({
    deposits: (deposits ?? []).map((deposit) => {
      const profile = profiles.get(deposit.user_id);
      return {
        id: deposit.id,
        user: {
          id: deposit.user_id,
          email: profile?.email ?? null,
          fullName: fullNameFromMetadata(profile?.user_metadata),
          createdAt: profile?.created_at ?? null,
        },
        symbol: deposit.symbol,
        network: deposit.network,
        amount: String(deposit.amount),
        transactionHash: deposit.transaction_hash,
        senderAddress: deposit.sender_address,
        recipientAddress: deposit.recipient_address,
        status: deposit.status,
        reviewNote: deposit.review_note,
        reviewedBy: deposit.reviewed_by
          ? (reviewerProfiles.get(deposit.reviewed_by)?.email ?? null)
          : null,
        reviewedAt: deposit.reviewed_at,
        submittedAt: deposit.submitted_at,
        reviewHistory: (eventsByDeposit.get(deposit.id) ?? []).map((event) => ({
          status: event.new_status,
          note: event.note,
          reviewedBy: event.admin_id
            ? (reviewerProfiles.get(event.admin_id)?.email ?? null)
            : null,
          reviewedAt: event.created_at,
        })),
      };
    }),
    page: page.data,
    perPage,
    total,
    lastPage: Math.max(1, Math.ceil(total / perPage)),
  });
});

adminRouter.post(
  "/deposits/:id/review",
  async (request: AdminRequest, response) => {
    const id = z.string().uuid().safeParse(request.params.id);
    const parsed = depositReviewSchema.safeParse(request.body);
    if (!id.success || !parsed.success) {
      response.status(400).json({
        error: "invalid_deposit_review",
        details: parsed.success
          ? undefined
          : parsed.error.flatten().fieldErrors,
      });
      return;
    }
    const { data, error } = await request.adminDatabase!.rpc(
      "review_deposit_submission",
      {
        p_submission_id: id.data,
        p_admin_id: request.adminUserId!,
        p_status: parsed.data.status,
        p_note: parsed.data.note,
      },
    );
    if (error) return sendDatabaseError(response);
    if (data !== true) {
      response.status(409).json({ error: "deposit_already_reviewed" });
      return;
    }
    if (parsed.data.status === "confirmed" && parsed.data.creditUsd) {
      try {
        const symbol = await creditDepositToInvestment(
          request.adminDatabase!,
          request.adminUserId!,
          id.data,
          parsed.data.creditUsd,
        );
        response.json({ creditedUsd: parsed.data.creditUsd, symbol });
      } catch {
        // The review is already recorded; tell the admin to credit manually.
        response.status(502).json({ error: "deposit_confirmed_credit_failed" });
      }
      return;
    }
    response.status(204).end();
  },
);

adminRouter.get("/users", async (request: AdminRequest, response) => {
  const parsedPage = z.coerce
    .number()
    .int()
    .min(1)
    .max(10_000)
    .safeParse(request.query.page ?? "1");
  if (!parsedPage.success) {
    response.status(400).json({ error: "invalid_users_page" });
    return;
  }
  const perPage = 50;
  const userResult = await request.adminDatabase!.auth.admin.listUsers({
    page: parsedPage.data,
    perPage,
  });
  if (userResult.error) return sendDatabaseError(response);
  const userPage = userResult.data;
  const ids = userPage.users.map((account) => account.id);
  const { data: submissions, error: submissionsError } = ids.length
    ? await request.adminDatabase!.rpc("count_user_deposit_submissions", {
        p_user_ids: ids,
      })
    : { data: [], error: null };
  if (submissionsError) return sendDatabaseError(response);
  const depositCounts = new Map<string, number>();
  for (const submission of submissions ?? []) {
    depositCounts.set(submission.user_id, Number(submission.deposit_count));
  }
  const { data: investments, error: investmentsError } = ids.length
    ? await request
        .adminDatabase!.from("managed_investments")
        .select("user_id, invested_usd")
        .in("user_id", ids)
    : { data: [], error: null };
  if (investmentsError) return sendDatabaseError(response);
  const investedAmounts = sumInvestedUsdByUser(investments ?? []);
  const total =
    "total" in userPage && typeof userPage.total === "number"
      ? userPage.total
      : userPage.users.length;
  const lastPage =
    "lastPage" in userPage && typeof userPage.lastPage === "number"
      ? userPage.lastPage
      : Math.max(1, Math.ceil(total / perPage));
  response.set("Cache-Control", "no-store").json({
    users: userPage.users.map((account) => ({
      id: account.id,
      email: account.email ?? null,
      fullName: fullNameFromMetadata(account.user_metadata),
      phone: account.phone ?? null,
      createdAt: account.created_at,
      lastSignInAt: account.last_sign_in_at,
      emailConfirmedAt: account.email_confirmed_at,
      role: account.app_metadata?.role ?? "user",
      depositCount: depositCounts.get(account.id) ?? 0,
      investedUsd: investedAmounts.get(account.id) ?? "0.00",
    })),
    page: parsedPage.data,
    perPage,
    total,
    lastPage,
  });
});

adminRouter.get("/users/:id", async (request: AdminRequest, response) => {
  const id = z.string().uuid().safeParse(request.params.id);
  if (!id.success) {
    response.status(400).json({ error: "invalid_user_id" });
    return;
  }
  const database = request.adminDatabase!;
  const { data, error } = await database.auth.admin.getUserById(id.data);
  if (error || !data.user) {
    response.status(404).json({ error: "user_not_found" });
    return;
  }
  const [submissions, investments] = await Promise.all([
    database.rpc("count_user_deposit_submissions", { p_user_ids: [id.data] }),
    database
      .from("managed_investments")
      .select("user_id, invested_usd")
      .eq("user_id", id.data),
  ]);
  if (submissions.error || investments.error) return sendDatabaseError(response);
  const account = data.user;
  response.set("Cache-Control", "no-store").json({
    id: account.id,
    email: account.email ?? null,
    fullName: fullNameFromMetadata(account.user_metadata),
    phone: account.phone ?? null,
    createdAt: account.created_at,
    lastSignInAt: account.last_sign_in_at,
    emailConfirmedAt: account.email_confirmed_at,
    role: account.app_metadata?.role ?? "user",
    depositCount: Number(submissions.data?.[0]?.deposit_count ?? 0),
    investedUsd:
      sumInvestedUsdByUser(investments.data ?? []).get(account.id) ?? "0.00",
  });
});

adminRouter.delete("/users/:id", async (request: AdminRequest, response) => {
  const id = z.string().uuid().safeParse(request.params.id);
  if (!id.success) {
    response.status(400).json({ error: "invalid_user_id" });
    return;
  }
  if (id.data === request.adminUserId) {
    response.status(409).json({ error: "cannot_delete_self" });
    return;
  }
  const database = request.adminDatabase!;
  const { data, error: lookupError } =
    await database.auth.admin.getUserById(id.data);
  if (lookupError || !data.user) {
    response.status(404).json({ error: "user_not_found" });
    return;
  }
  if (data.user.app_metadata?.role === "admin") {
    response.status(409).json({ error: "cannot_delete_admin" });
    return;
  }
  // Transfers, investments, and balance history cascade with the auth user.
  const { error } = await database.auth.admin.deleteUser(id.data);
  if (error) return sendDatabaseError(response);
  response.status(204).end();
});

adminRouter.post("/alerts/:id", async (request: AdminRequest, response) => {
  const id = z.string().uuid().safeParse(request.params.id);
  const parsed = alertActionSchema.safeParse(request.body);
  if (!id.success || !parsed.success) {
    response.status(400).json({ error: "invalid_alert_action" });
    return;
  }
  const database = request.adminDatabase!;
  const { data: subscriber, error: readError } = await database
    .from("email_subscribers")
    .select("id")
    .eq("id", id.data)
    .maybeSingle();
  if (readError) return sendDatabaseError(response);
  if (!subscriber) {
    response.status(404).json({ error: "subscriber_not_found" });
    return;
  }
  const update =
    parsed.data.action === "unsubscribe"
      ? {
          status: "unsubscribed",
          price_alerts: false,
          weekly_brief: false,
        }
      : { price_alerts: false };
  const { error } = await database
    .from("email_subscribers")
    .update(update)
    .eq("id", id.data);
  if (error) return sendDatabaseError(response);
  if (parsed.data.action === "unsubscribe") {
    const { error: rulesError } = await database
      .from("email_alert_rules")
      .delete()
      .eq("subscriber_id", id.data);
    if (rulesError) return sendDatabaseError(response);
  }
  response.status(204).end();
});

adminRouter.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    next: NextFunction,
  ) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    console.error("Admin API request failed.");
    sendDatabaseError(response);
  },
);

export { adminRouter };
