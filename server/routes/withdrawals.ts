import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { logAuthFailure } from "../supabase-env.ts";
import { z } from "zod";
import {
  USD_AMOUNT_PATTERN,
  WITHDRAWAL_STATUSES,
  WITHDRAWAL_SYMBOLS,
  isValidWithdrawalAddress,
  type WithdrawalStatus,
} from "../../shared/withdrawals.ts";

const MAX_OPEN_REQUESTS = 5;
const PAGE_SIZE = 50;

/** Postgres/PostgREST codes meaning the withdrawals migration isn't applied. */
const MIGRATION_ERROR_CODES = new Set([
  "PGRST202",
  "PGRST204",
  "PGRST205",
  "42P01",
  "42703",
  "42883",
]);

const WITHDRAWAL_COLUMNS =
  "id, user_id, symbol, amount_usd, destination_address, status, admin_note, created_at, updated_at";

type WithdrawalRow = {
  id: string;
  user_id: string;
  symbol: string;
  amount_usd: string | number;
  destination_address: string;
  status: WithdrawalStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
};
type EventRow = {
  withdrawal_id: string;
  status: WithdrawalStatus;
  note: string | null;
  created_at: string;
};

export const withdrawalRequestSchema = z
  .object({
    symbol: z.enum(WITHDRAWAL_SYMBOLS),
    amountUsd: z
      .string()
      .trim()
      .regex(USD_AMOUNT_PATTERN, "Enter a USD amount with up to two decimals.")
      .refine(
        (value) => Number(value) > 0,
        "Amount must be greater than zero.",
      ),
    destinationAddress: z.string().trim().min(20).max(150),
  })
  .strict()
  .superRefine((value, context) => {
    if (!isValidWithdrawalAddress(value.symbol, value.destinationAddress)) {
      context.addIssue({
        code: "custom",
        path: ["destinationAddress"],
        message: `That doesn't look like a valid ${value.symbol} address.`,
      });
    }
  });

export const withdrawalStatusSchema = z.object({
  status: z.enum(WITHDRAWAL_STATUSES),
  note: z.string().trim().max(500).optional().default(""),
});

function sendDatabaseError(response: Response, error: { code?: string }) {
  if (error.code && MIGRATION_ERROR_CODES.has(error.code)) {
    response.status(503).json({ error: "withdrawals_migration_required" });
    return;
  }
  console.error("Withdrawal request failed.", error.code);
  response.status(503).json({ error: "withdrawals_unavailable" });
}

function toCents(value: string | number) {
  return Math.round(Number(value) * 100);
}

function centsToUsd(cents: number) {
  return (cents / 100).toFixed(2);
}

function toWithdrawal(row: WithdrawalRow, events: EventRow[]) {
  return {
    id: row.id,
    symbol: row.symbol,
    amountUsd: Number(row.amount_usd).toFixed(2),
    destinationAddress: row.destination_address,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    history: events
      .filter((event) => event.withdrawal_id === row.id)
      .map((event) => ({
        status: event.status,
        note: event.note,
        at: event.created_at,
      })),
  };
}

async function loadEvents(database: SupabaseClient, ids: string[]) {
  if (ids.length === 0) return { data: [] as EventRow[], error: null };
  const { data, error } = await database
    .from("withdrawal_events")
    .select("withdrawal_id, status, note, created_at")
    .in("withdrawal_id", ids)
    .order("created_at", { ascending: true });
  return { data: (data ?? []) as EventRow[], error };
}

/**
 * Current value of each of the user's investments, how much is reserved by
 * open withdrawal requests, and what is still available to withdraw.
 */
async function loadBalances(database: SupabaseClient, userId: string) {
  const { error: advanceError } = await database.rpc(
    "advance_managed_investments",
    { p_user_id: userId },
  );
  if (advanceError) return { error: advanceError };
  const [investments, openRequests] = await Promise.all([
    database
      .from("managed_investments")
      .select("symbol, invested_usd, return_usd")
      .eq("user_id", userId),
    database
      .from("withdrawal_requests")
      .select("symbol, amount_usd")
      .eq("user_id", userId)
      .in("status", ["pending", "processing"]),
  ]);
  if (investments.error) return { error: investments.error };
  if (openRequests.error) return { error: openRequests.error };
  const reserved = new Map<string, number>();
  for (const request of openRequests.data ?? []) {
    reserved.set(
      request.symbol,
      (reserved.get(request.symbol) ?? 0) + toCents(request.amount_usd),
    );
  }
  const balances = (investments.data ?? []).map((investment) => {
    const value =
      toCents(investment.invested_usd) + toCents(investment.return_usd);
    const held = reserved.get(investment.symbol) ?? 0;
    return {
      symbol: investment.symbol as string,
      valueUsd: centsToUsd(value),
      reservedUsd: centsToUsd(held),
      availableUsd: centsToUsd(Math.max(0, value - held)),
    };
  });
  return { balances, openCount: openRequests.data?.length ?? 0 };
}

function createDatabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Withdrawals are not configured.");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// User routes: /api/withdrawals
// ---------------------------------------------------------------------------

type UserRequest = Request & {
  withdrawalDatabase?: SupabaseClient;
  withdrawalUserId?: string;
};

export const withdrawalRouter = Router();

withdrawalRouter.use(
  async (request: UserRequest, response: Response, next: NextFunction) => {
    const token = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      response.status(401).json({ error: "authentication_required" });
      return;
    }
    try {
      const database = createDatabase();
      const { data, error } = await database.auth.getUser(token);
      if (error || !data.user) {
        console.warn(
          "[withdrawals] Sign-in token rejected:",
          error?.message ?? "no user",
        );
        response.status(401).json({ error: "authentication_required" });
        return;
      }
      request.withdrawalDatabase = database;
      request.withdrawalUserId = data.user.id;
      next();
    } catch (error) {
      logAuthFailure("withdrawals", error);
      response.status(503).json({ error: "withdrawals_unavailable" });
    }
  },
);

withdrawalRouter.get("/mine", async (request: UserRequest, response) => {
  const database = request.withdrawalDatabase!;
  const userId = request.withdrawalUserId!;
  const balanceResult = await loadBalances(database, userId);
  if ("error" in balanceResult && balanceResult.error)
    return sendDatabaseError(response, balanceResult.error);
  const { data, error } = await database
    .from("withdrawal_requests")
    .select(WITHDRAWAL_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return sendDatabaseError(response, error);
  const rows = (data ?? []) as WithdrawalRow[];
  const events = await loadEvents(
    database,
    rows.map((row) => row.id),
  );
  if (events.error) return sendDatabaseError(response, events.error);
  response.set("Cache-Control", "no-store").json({
    balances: balanceResult.balances,
    withdrawals: rows.map((row) => toWithdrawal(row, events.data)),
  });
});

withdrawalRouter.post("/", async (request: UserRequest, response) => {
  const parsed = withdrawalRequestSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "invalid_withdrawal_request",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }
  const database = request.withdrawalDatabase!;
  const userId = request.withdrawalUserId!;
  const { symbol, amountUsd, destinationAddress } = parsed.data;

  const balanceResult = await loadBalances(database, userId);
  if ("error" in balanceResult && balanceResult.error)
    return sendDatabaseError(response, balanceResult.error);
  if (balanceResult.openCount >= MAX_OPEN_REQUESTS) {
    response.status(429).json({ error: "too_many_open_withdrawals" });
    return;
  }
  const balance = balanceResult.balances.find((item) => item.symbol === symbol);
  if (!balance || toCents(amountUsd) > toCents(balance.availableUsd)) {
    response.status(409).json({
      error: "insufficient_balance",
      availableUsd: balance?.availableUsd ?? "0.00",
    });
    return;
  }

  const { data, error } = await database
    .from("withdrawal_requests")
    .insert({
      user_id: userId,
      symbol,
      amount_usd: amountUsd,
      destination_address: destinationAddress,
    })
    .select(WITHDRAWAL_COLUMNS)
    .single();
  if (error) return sendDatabaseError(response, error);
  const row = data as WithdrawalRow;
  const events = await loadEvents(database, [row.id]);
  response.status(201).json(toWithdrawal(row, events.data));
});

// ---------------------------------------------------------------------------
// Admin routes: mounted at /api/admin/withdrawals behind the admin check.
// ---------------------------------------------------------------------------

type AdminRequest = Request & {
  adminDatabase?: SupabaseClient;
  adminUserId?: string;
};

export function createAdminWithdrawalRouter(
  describeUser: (
    metadata: Record<string, unknown> | undefined,
  ) => string | null,
) {
  const router = Router();

  router.get("/", async (request: AdminRequest, response) => {
    const status = z
      .enum(["all", ...WITHDRAWAL_STATUSES])
      .safeParse(request.query.status ?? "all");
    const page = z.coerce
      .number()
      .int()
      .min(1)
      .max(10_000)
      .safeParse(request.query.page ?? "1");
    const userId = z.string().uuid().optional().safeParse(request.query.userId);
    if (!status.success || !page.success || !userId.success) {
      response.status(400).json({ error: "invalid_withdrawal_query" });
      return;
    }
    const database = request.adminDatabase!;
    let query = database
      .from("withdrawal_requests")
      .select(WITHDRAWAL_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range((page.data - 1) * PAGE_SIZE, page.data * PAGE_SIZE - 1);
    if (status.data !== "all") query = query.eq("status", status.data);
    if (userId.data) query = query.eq("user_id", userId.data);
    const { data, count, error } = await query;
    if (error) return sendDatabaseError(response, error);
    const rows = (data ?? []) as WithdrawalRow[];

    const userIds = [...new Set(rows.map((row) => row.user_id))];
    const [events, investments, users] = await Promise.all([
      loadEvents(
        database,
        rows.map((row) => row.id),
      ),
      userIds.length
        ? database
            .from("managed_investments")
            .select("user_id, symbol, invested_usd, return_usd")
            .in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
      Promise.all(
        userIds.map(async (id) => {
          const { data: result } = await database.auth.admin.getUserById(id);
          return result.user;
        }),
      ),
    ]);
    if (events.error) return sendDatabaseError(response, events.error);
    if (investments.error)
      return sendDatabaseError(response, investments.error);
    const profiles = new Map(
      users.filter(Boolean).map((user) => [user!.id, user!]),
    );
    const values = new Map(
      (investments.data ?? []).map((investment) => [
        `${investment.user_id}:${investment.symbol}`,
        centsToUsd(
          toCents(investment.invested_usd) + toCents(investment.return_usd),
        ),
      ]),
    );

    const total = count ?? 0;
    response.set("Cache-Control", "no-store").json({
      withdrawals: rows.map((row) => {
        const profile = profiles.get(row.user_id);
        return {
          ...toWithdrawal(row, events.data),
          user: {
            id: row.user_id,
            email: profile?.email ?? null,
            fullName: describeUser(profile?.user_metadata),
          },
          investmentValueUsd:
            values.get(`${row.user_id}:${row.symbol}`) ?? null,
        };
      }),
      page: page.data,
      total,
      lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  });

  router.post("/:id/status", async (request: AdminRequest, response) => {
    const id = z.string().uuid().safeParse(request.params.id);
    const parsed = withdrawalStatusSchema.safeParse(request.body);
    if (!id.success || !parsed.success) {
      response.status(400).json({ error: "invalid_withdrawal_status" });
      return;
    }
    if (parsed.data.status === "rejected" && !parsed.data.note) {
      response.status(400).json({ error: "rejection_note_required" });
      return;
    }
    const { data, error } = await request.adminDatabase!.rpc(
      "set_withdrawal_status",
      {
        p_withdrawal_id: id.data,
        p_admin_id: request.adminUserId!,
        p_status: parsed.data.status,
        p_note: parsed.data.note,
      },
    );
    if (error) return sendDatabaseError(response, error);
    const outcomes: Record<string, [number, string]> = {
      not_found: [404, "withdrawal_not_found"],
      final: [409, "withdrawal_already_final"],
      unchanged: [409, "withdrawal_status_unchanged"],
      insufficient_funds: [409, "withdrawal_insufficient_funds"],
    };
    const failure = outcomes[data as string];
    if (failure) {
      response.status(failure[0]).json({ error: failure[1] });
      return;
    }
    response.status(204).end();
  });

  return router;
}
