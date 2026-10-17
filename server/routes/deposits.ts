import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { DEPOSIT_ASSETS } from "../../shared/deposit-assets.ts";

export const depositSubmissionSchema = z
  .object({
    symbol: z.enum(["USDT", "BTC", "ETH", "SOL"]),
    amount: z.string().regex(/^(?:0|[1-9]\d{0,21})(?:\.\d{1,18})?$/),
    transactionHash: z.string().trim().min(64).max(100),
    senderAddress: z.string().trim().max(150).optional().or(z.literal("")),
  })
  .strict()
  .refine((value) => Number(value.amount) > 0, {
    path: ["amount"],
    message: "Amount must be greater than zero.",
  })
  .superRefine((value, context) => {
    const hashValid =
      value.symbol === "SOL"
        ? /^[1-9A-HJ-NP-Za-km-z]{80,100}$/.test(value.transactionHash)
        : /^(?:0x)?[a-fA-F0-9]{64}$/.test(value.transactionHash);
    if (!hashValid) {
      context.addIssue({
        code: "custom",
        path: ["transactionHash"],
        message:
          value.symbol === "SOL"
            ? "Enter the Solana transaction signature."
            : "Enter the 64-character transaction hash.",
      });
    }
  });

type DepositRequest = Request & {
  depositDatabase?: SupabaseClient;
  depositUser?: { id: string };
};

const depositRouter = Router();

const DEPOSIT_COLUMNS =
  "id, symbol, network, amount, transaction_hash, sender_address, recipient_address, status, review_note, reviewed_at, submitted_at";

type DepositRow = {
  id: string;
  symbol: string;
  network: string;
  amount: string | number;
  transaction_hash: string;
  sender_address: string | null;
  recipient_address: string;
  status: string;
  review_note: string | null;
  reviewed_at: string | null;
  submitted_at: string;
};

function toDepositResponse(row: DepositRow) {
  return {
    id: row.id,
    symbol: row.symbol,
    network: row.network,
    amount: String(row.amount),
    transactionHash: row.transaction_hash,
    senderAddress: row.sender_address,
    recipientAddress: row.recipient_address,
    status: row.status,
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    submittedAt: row.submitted_at,
  };
}

function makeDatabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Deposit service is not configured.");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

depositRouter.use(
  async (request: DepositRequest, response: Response, next: NextFunction) => {
    const token = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      response.status(401).json({ error: "authentication_required" });
      return;
    }
    try {
      const database = makeDatabase();
      const { data, error } = await database.auth.getUser(token);
      if (error || !data.user) {
        response.status(401).json({ error: "authentication_required" });
        return;
      }
      request.depositDatabase = database;
      request.depositUser = { id: data.user.id };
      next();
    } catch {
      response.status(503).json({ error: "deposit_service_unavailable" });
    }
  },
);

depositRouter.get("/mine", async (request: DepositRequest, response) => {
  const { data, error } = await request
    .depositDatabase!.from("deposit_submissions")
    .select(DEPOSIT_COLUMNS)
    .eq("user_id", request.depositUser!.id)
    .order("submitted_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error("User deposit history could not be loaded.");
    response.status(503).json({ error: "deposit_history_unavailable" });
    return;
  }
  response
    .set("Cache-Control", "no-store")
    .json(((data ?? []) as DepositRow[]).map(toDepositResponse));
});

depositRouter.post("/", async (request: DepositRequest, response) => {
  const parsed = depositSubmissionSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "invalid_deposit_submission",
      details: parsed.error.flatten().fieldErrors,
    });
    return;
  }
  const { symbol, amount, transactionHash, senderAddress } = parsed.data;
  const { count: pendingCount, error: pendingError } = await request
    .depositDatabase!.from("deposit_submissions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", request.depositUser!.id)
    .eq("status", "pending");
  if (pendingError) {
    console.error("Pending deposit limit could not be checked.");
    response.status(503).json({ error: "deposit_submission_unavailable" });
    return;
  }
  if ((pendingCount ?? 0) >= 10) {
    response.status(429).json({ error: "too_many_pending_submissions" });
    return;
  }

  const wallet = DEPOSIT_ASSETS.find((asset) => asset.symbol === symbol);
  if (!wallet) {
    response.status(400).json({ error: "unsupported_deposit_asset" });
    return;
  }
  const normalizedHash =
    symbol === "SOL"
      ? transactionHash
      : transactionHash.toLowerCase().replace(/^0x/, "");
  const { data, error } = await request
    .depositDatabase!.from("deposit_submissions")
    .insert({
      user_id: request.depositUser!.id,
      symbol,
      network: wallet.networkCode,
      amount,
      transaction_hash: normalizedHash,
      sender_address: senderAddress?.trim() || null,
      recipient_address: wallet.address,
    })
    .select(DEPOSIT_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      response.status(409).json({ error: "transaction_already_submitted" });
      return;
    }
    console.error("Deposit submission could not be saved.");
    response.status(503).json({ error: "deposit_submission_unavailable" });
    return;
  }
  response.status(201).json(toDepositResponse(data as DepositRow));
});

depositRouter.use(
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
    console.error("Deposit API request failed.");
    response.status(503).json({ error: "deposit_service_unavailable" });
  },
);

export { depositRouter };
