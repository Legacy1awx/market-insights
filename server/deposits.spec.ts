import { describe, expect, it } from "vitest";
import { depositReviewSchema } from "./routes/admin";
import { depositSubmissionSchema } from "./routes/deposits";
import { DEPOSIT_ASSETS } from "../shared/deposit-assets";

describe("deposit submission validation", () => {
  it("uses the supported public receiving addresses and networks", () => {
    expect(
      DEPOSIT_ASSETS.map(({ symbol, networkCode }) => [symbol, networkCode]),
    ).toEqual([
      ["USDT", "TRON-TRC20"],
      ["BTC", "BITCOIN"],
      ["ETH", "ETHEREUM"],
      ["SOL", "SOLANA"],
    ]);
    expect(DEPOSIT_ASSETS.every((asset) => asset.address.length >= 32)).toBe(
      true,
    );
  });

  it("accepts positive decimal amounts with valid network transaction IDs", () => {
    const cases = [
      { symbol: "USDT", amount: "12.3400", transactionHash: "ab".repeat(32) },
      {
        symbol: "BTC",
        amount: "0.00000001",
        transactionHash: "cd".repeat(32),
      },
      {
        symbol: "ETH",
        amount: "2",
        transactionHash: `0x${"ef".repeat(32)}`,
      },
      {
        symbol: "SOL",
        amount: "1.25",
        transactionHash: "1".repeat(87),
      },
    ];
    for (const submission of cases) {
      expect(depositSubmissionSchema.safeParse(submission).success).toBe(true);
    }
  });

  it("rejects zero amounts, invalid transaction IDs, and client-supplied addresses", () => {
    expect(
      depositSubmissionSchema.safeParse({
        symbol: "BTC",
        amount: "0",
        transactionHash: "ab".repeat(32),
      }).success,
    ).toBe(false);
    expect(
      depositSubmissionSchema.safeParse({
        symbol: "ETH",
        amount: "1",
        transactionHash: "not-a-hash",
      }).success,
    ).toBe(false);
    expect(
      depositSubmissionSchema.safeParse({
        symbol: "BTC",
        amount: "1",
        transactionHash: "ab".repeat(32),
        recipientAddress: "attacker-controlled",
      }).success,
    ).toBe(false);
  });
});

describe("admin transfer review validation", () => {
  it("requires explicit explorer verification before confirming", () => {
    expect(
      depositReviewSchema.safeParse({
        status: "confirmed",
        note: "",
        verifiedOnExplorer: false,
      }).success,
    ).toBe(false);
    expect(
      depositReviewSchema.safeParse({
        status: "confirmed",
        note: "",
        verifiedOnExplorer: true,
        creditUsd: "250.00",
      }).success,
    ).toBe(true);
  });

  it("requires a positive USD credit when confirming", () => {
    const confirm = { status: "confirmed", note: "", verifiedOnExplorer: true };
    expect(depositReviewSchema.safeParse(confirm).success).toBe(false);
    for (const creditUsd of ["0", "-5", "12.345", "abc"]) {
      expect(
        depositReviewSchema.safeParse({ ...confirm, creditUsd }).success,
      ).toBe(false);
    }
    expect(
      depositReviewSchema.safeParse({ ...confirm, creditUsd: "67541.27" })
        .success,
    ).toBe(true);
  });

  it("requires a reason when rejecting a submission", () => {
    expect(
      depositReviewSchema.safeParse({
        status: "rejected",
        note: "",
        verifiedOnExplorer: false,
      }).success,
    ).toBe(false);
    expect(
      depositReviewSchema.safeParse({
        status: "rejected",
        note: "Transaction was not found on the expected network.",
        verifiedOnExplorer: false,
      }).success,
    ).toBe(true);
  });
});
