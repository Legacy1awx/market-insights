import { describe, expect, it } from "vitest";
import {
  isFinalWithdrawalStatus,
  isValidWithdrawalAddress,
} from "../shared/withdrawals";
import {
  withdrawalRequestSchema,
  withdrawalStatusSchema,
} from "./routes/withdrawals";

const valid = {
  symbol: "ETH",
  amountUsd: "250.00",
  destinationAddress: "0x40B8D54d0518169f20BEBF0f962DD6161C58e0A0",
};

describe("withdrawal request validation", () => {
  it("accepts a positive USD amount and a matching wallet address", () => {
    expect(withdrawalRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      withdrawalRequestSchema.safeParse({ ...valid, amountUsd: "0.01" })
        .success,
    ).toBe(true);
  });

  it("rejects zero, negative or over-precise amounts", () => {
    for (const amountUsd of ["0", "-5", "10.123", "abc", ""]) {
      expect(
        withdrawalRequestSchema.safeParse({ ...valid, amountUsd }).success,
      ).toBe(false);
    }
  });

  it("rejects an address for the wrong token", () => {
    expect(
      withdrawalRequestSchema.safeParse({
        ...valid,
        symbol: "BTC",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields and tokens", () => {
    expect(
      withdrawalRequestSchema.safeParse({ ...valid, userId: "someone" })
        .success,
    ).toBe(false);
    expect(
      withdrawalRequestSchema.safeParse({ ...valid, symbol: "DOGE" }).success,
    ).toBe(false);
  });
});

describe("wallet address formats", () => {
  it.each([
    ["USDT", "TYqFs9VwDRvWZtWDbYnCz7k8p69D7EEyV9", true],
    ["USDT", "0x40B8D54d0518169f20BEBF0f962DD6161C58e0A0", false],
    ["BTC", "bc1qarlvunv38mhewdrdz6mfurjdnq0fe6gdreydlk", true],
    ["BTC", "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2", true],
    ["BTC", "TYqFs9VwDRvWZtWDbYnCz7k8p69D7EEyV9", false],
    ["ETH", "0x40B8D54d0518169f20BEBF0f962DD6161C58e0A0", true],
    ["ETH", "0x123", false],
    ["SOL", "HEihqsuKbAEtkCrr3BraCS2r12UxrgdsaED7PcM2f8sx", true],
    ["SOL", "not a solana address!", false],
  ])("%s %s → %s", (symbol, address, expected) => {
    expect(isValidWithdrawalAddress(symbol, address)).toBe(expected);
  });
});

describe("withdrawal status changes", () => {
  it("accepts the four statuses and treats completed/rejected as final", () => {
    for (const status of ["pending", "processing", "completed", "rejected"]) {
      expect(withdrawalStatusSchema.safeParse({ status }).success).toBe(true);
    }
    expect(withdrawalStatusSchema.safeParse({ status: "sent" }).success).toBe(
      false,
    );
    expect(isFinalWithdrawalStatus("completed")).toBe(true);
    expect(isFinalWithdrawalStatus("rejected")).toBe(true);
    expect(isFinalWithdrawalStatus("processing")).toBe(false);
  });
});
