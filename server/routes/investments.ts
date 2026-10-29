import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { logAuthFailure } from "../supabase-env.ts";

type InvestmentRequest = Request & {
  investmentDatabase?: SupabaseClient;
  investmentUserId?: string;
};

const chartMigrationErrorCodes = new Set([
  "PGRST202",
  "PGRST204",
  "PGRST205",
  "42P01",
  "42703",
  "42883",
]);

function isChartMigrationMissing(error: { code?: string }) {
  return Boolean(error.code && chartMigrationErrorCodes.has(error.code));
}

function sendPortfolioError(response: Response, error: { code?: string }) {
  if (isChartMigrationMissing(error)) {
    console.error("Investment chart migration is missing.", error.code);
    response.status(503).json({ error: "investment_chart_migration_required" });
    return;
  }
  console.error("User investment portfolio request failed.", error.code);
  response.status(503).json({ error: "investment_portfolio_unavailable" });
}

const investmentsRouter = Router();

function createInvestmentDatabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Investment service is not configured.");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

investmentsRouter.use(
  async (
    request: InvestmentRequest,
    response: Response,
    next: NextFunction,
  ) => {
    const token = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      response.status(401).json({ error: "authentication_required" });
      return;
    }
    try {
      const database = createInvestmentDatabase();
      const { data, error } = await database.auth.getUser(token);
      if (error || !data.user) {
        console.warn(
          "[investments] Sign-in token rejected:",
          error?.message ?? "no user",
        );
        response.status(401).json({ error: "authentication_required" });
        return;
      }
      request.investmentDatabase = database;
      request.investmentUserId = data.user.id;
      next();
    } catch (error) {
      logAuthFailure("investments", error);
      response.status(503).json({ error: "investment_service_unavailable" });
    }
  },
);

investmentsRouter.get("/mine", async (request: InvestmentRequest, response) => {
  const database = request.investmentDatabase!;
  const { error: advanceError } = await database.rpc(
    "advance_managed_investments",
    { p_user_id: request.investmentUserId! },
  );
  if (advanceError) {
    sendPortfolioError(response, advanceError);
    return;
  }
  const { data, error } = await request
    .investmentDatabase!.from("managed_investments")
    .select(
      "id, symbol, invested_usd, return_usd, movement_direction, movement_amount, movement_interval_seconds, updated_at",
    )
    .eq("user_id", request.investmentUserId!)
    .order("symbol");
  if (error) {
    sendPortfolioError(response, error);
    return;
  }

  const investmentIds = (data ?? []).map((investment) => investment.id);
  const { data: history, error: historyError } = investmentIds.length
    ? await database
        .from("managed_investment_history")
        .select("managed_investment_id, balance_usd, recorded_at")
        .in("managed_investment_id", investmentIds)
        .order("recorded_at", { ascending: true })
    : { data: [], error: null };
  if (historyError) {
    sendPortfolioError(response, historyError);
    return;
  }
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

  const investments = (data ?? []).map((investment) => ({
    id: investment.id,
    symbol: investment.symbol,
    investedUsd: String(investment.invested_usd),
    returnUsd: String(investment.return_usd),
    movementDirection: investment.movement_direction,
    movementAmount: String(investment.movement_amount),
    movementIntervalSeconds: investment.movement_interval_seconds,
    history: historyByInvestment.get(investment.id) ?? [],
    totalUsd: String(
      Number(investment.invested_usd) + Number(investment.return_usd),
    ),
    updatedAt: investment.updated_at,
  }));
  response.set("Cache-Control", "no-store").json({
    investments,
    totals: investments.reduce(
      (totals, investment) => ({
        investedUsd: totals.investedUsd + Number(investment.investedUsd),
        returnUsd: totals.returnUsd + Number(investment.returnUsd),
        totalUsd: totals.totalUsd + Number(investment.totalUsd),
      }),
      { investedUsd: 0, returnUsd: 0, totalUsd: 0 },
    ),
  });
});

investmentsRouter.use(
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
    console.error("Investment API request failed.");
    response.status(503).json({ error: "investment_service_unavailable" });
  },
);

export { isChartMigrationMissing, investmentsRouter };
