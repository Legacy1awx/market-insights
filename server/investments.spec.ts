import { describe, expect, it } from "vitest";
import {
  investmentMovementSchema,
  managedInvestmentSchema,
  sumInvestedUsdByUser,
} from "./routes/admin";
import { isChartMigrationMissing } from "./routes/investments";

describe("admin-managed investment validation", () => {
  const validInvestment = {
    userId: "1f3f8c57-28bd-4dcf-8715-1341cf09eb70",
    symbol: "BTC",
    investedUsd: "1000.00",
    returnUsd: "125.50",
    movementDirection: "paused",
    movementAmount: "1.00",
  };

  it("accepts USD investment and return amounts for supported assets", () => {
    expect(managedInvestmentSchema.safeParse(validInvestment).success).toBe(
      true,
    );
    expect(
      managedInvestmentSchema.safeParse({
        ...validInvestment,
        symbol: "SOL",
        returnUsd: "-1000.00",
        movementDirection: "down",
      }).success,
    ).toBe(true);
  });

  it("requires a supported chart direction and positive movement amount", () => {
    expect(
      managedInvestmentSchema.safeParse({
        ...validInvestment,
        movementDirection: "paused",
        movementAmount: "1.25",
      }).success,
    ).toBe(true);
    expect(
      managedInvestmentSchema.safeParse({
        ...validInvestment,
        movementDirection: "sideways",
        movementAmount: "1.25",
      }).success,
    ).toBe(false);
    expect(
      managedInvestmentSchema.safeParse({
        ...validInvestment,
        movementDirection: "up",
        movementAmount: "0",
      }).success,
    ).toBe(false);
    expect(
      managedInvestmentSchema.safeParse({
        ...validInvestment,
        movementDirection: "continuous",
        movementAmount: "2.50",
      }).success,
    ).toBe(true);
    expect(
      managedInvestmentSchema.safeParse({
        userId: validInvestment.userId,
        symbol: validInvestment.symbol,
        investedUsd: validInvestment.investedUsd,
        returnUsd: validInvestment.returnUsd,
      }),
    ).toMatchObject({
      success: true,
      data: {
        movementDirection: "paused",
        movementAmount: "1.00",
      },
    });
  });

  describe("admin user investment totals", () => {
    it("sums invested principal by user without losing cents", () => {
      expect(
        sumInvestedUsdByUser([
          { user_id: "user-1", invested_usd: "1000.10" },
          { user_id: "user-1", invested_usd: "25.25" },
          { user_id: "user-2", invested_usd: "0.99" },
        ]),
      ).toEqual(
        new Map([
          ["user-1", "1025.35"],
          ["user-2", "0.99"],
        ]),
      );
    });
  });

  it("rejects an unsupported asset, invalid amounts, and negative total value", () => {
    expect(
      managedInvestmentSchema.safeParse({
        ...validInvestment,
        symbol: "DOGE",
      }).success,
    ).toBe(false);
    expect(
      managedInvestmentSchema.safeParse({
        ...validInvestment,
        investedUsd: "0",
      }).success,
    ).toBe(false);
    expect(
      managedInvestmentSchema.safeParse({
        ...validInvestment,
        returnUsd: "-1000.01",
      }).success,
    ).toBe(false);
    expect(
      managedInvestmentSchema.safeParse({
        ...validInvestment,
        investedUsd: "1e6",
        movementDirection: "paused",
        movementAmount: "1.00",
      }).success,
    ).toBe(false);
  });

});

describe("investment movement interval", () => {
  const base = {
    userId: "1f3f8c57-28bd-4dcf-8715-1341cf09eb70",
    symbol: "BTC",
    investedUsd: "1000.00",
    returnUsd: "0",
    movementDirection: "up",
    movementAmount: "5.00",
  };

  it("accepts intervals from 1 minute to 24 hours and defaults to 1 minute", () => {
    const parsed = managedInvestmentSchema.safeParse(base);
    expect(parsed.success && parsed.data.movementIntervalSeconds).toBe(60);
    for (const seconds of [60, 15 * 60, 2 * 3600, 86_400]) {
      expect(
        managedInvestmentSchema.safeParse({
          ...base,
          movementIntervalSeconds: seconds,
        }).success,
      ).toBe(true);
    }
  });

  it("rejects intervals outside 1 minute to 24 hours or fractional seconds", () => {
    for (const seconds of [0, 30, 59, 86_401, 90.5]) {
      expect(
        managedInvestmentSchema.safeParse({
          ...base,
          movementIntervalSeconds: seconds,
        }).success,
      ).toBe(false);
    }
  });

  it("lets quick movement changes optionally set the interval", () => {
    expect(
      investmentMovementSchema.safeParse({ movementDirection: "paused" })
        .success,
    ).toBe(true);
    expect(
      investmentMovementSchema.safeParse({
        movementDirection: "down",
        movementAmount: "2.50",
        movementIntervalSeconds: 3600,
      }).success,
    ).toBe(true);
    expect(
      investmentMovementSchema.safeParse({
        movementDirection: "down",
        movementIntervalSeconds: 10,
      }).success,
    ).toBe(false);
  });
});

describe("investment chart migration detection", () => {
  it("identifies missing chart database objects", () => {
    expect(isChartMigrationMissing({ code: "PGRST202" })).toBe(true);
    expect(isChartMigrationMissing({ code: "42703" })).toBe(true);
    expect(isChartMigrationMissing({ code: "42501" })).toBe(false);
  });
});
