import { createHmac, timingSafeEqual } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import {
  createEmailToken,
  createUnsubscribeToken,
  createVerificationCode,
  EmailConfigurationError,
  getEmailServices,
  hashEmailSecret,
  sendEmail,
  type EmailServices,
} from "../email-service.ts";

const symbols = [
  "BTC",
  "ETH",
  "SOL",
  "BNB",
  "XRP",
  "ADA",
  "AVAX",
  "LINK",
] as const;
const ruleSchema = z.object({
  id: z.string().min(1).max(100),
  symbol: z.enum(symbols),
  kind: z.enum(["above", "below", "up", "down"]),
  target: z.number().positive().finite(),
  referencePrice: z.number().positive().finite(),
  enabled: z.boolean(),
});
const preferencesSchema = z.object({
  priceAlerts: z.boolean(),
  weeklyBrief: z.boolean(),
  alerts: z.array(ruleSchema).max(50),
});
const subscribeSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    priceAlerts: z.boolean(),
    weeklyBrief: z.boolean(),
    alerts: z.array(ruleSchema).max(50),
  })
  .refine(
    (subscription) => subscription.priceAlerts || subscription.weeklyBrief,
  );
const verifySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  code: z.string().regex(/^\d{6}$/),
});
const emailRouter = Router();
const COOKIE_NAME = "northstar_email_session";
const SESSION_SECONDS = 30 * 24 * 60 * 60;

emailRouter.get("/status", async (request, response) => {
  const services = servicesFor(request, response);
  if (!services) return;
  try {
    const { error: databaseError } = await services.database
      .from("email_subscribers")
      .select("id", { head: true, count: "exact" })
      .limit(0);
    const senderDomain = services.from.match(/@([^>\s]+)/)?.[1]?.toLowerCase();
    if (databaseError || !senderDomain) {
      response.status(503).json({ ready: false });
      return;
    }
    const { data: domainResponse, error: domainError } =
      await services.resend.domains.list();
    const verifiedSender = domainResponse?.data?.some(
      (domain) =>
        domain.name.toLowerCase() === senderDomain &&
        domain.status === "verified" &&
        domain.capabilities.sending === "enabled",
    );
    if (domainError || !verifiedSender) {
      response.status(503).json({ ready: false });
      return;
    }
    response.json({ ready: true });
  } catch {
    response.status(503).json({ ready: false });
  }
});

function servicesFor(
  request: Request,
  response: Response,
  allowExternalOrigin = false,
) {
  response.set("Cache-Control", "no-store");
  response.set("X-Content-Type-Options", "nosniff");
  response.set("Referrer-Policy", "no-referrer");
  let services: EmailServices;
  try {
    services = getEmailServices();
  } catch (error) {
    if (!(error instanceof EmailConfigurationError)) {
      console.error("Email service initialization failed.");
    }
    response.status(503).json({ error: "email_service_unavailable" });
    return null;
  }
  const origin = request.get("origin");
  if (origin && !allowExternalOrigin) {
    try {
      if (new URL(origin).origin !== services.siteUrl.origin) {
        response.status(403).json({ error: "cross_origin_request" });
        return null;
      }
    } catch {
      response.status(403).json({ error: "cross_origin_request" });
      return null;
    }
  }
  return services;
}

async function consumeLimit(
  services: EmailServices,
  request: Request,
  bucket: string,
  limit: number,
  windowSeconds: number,
) {
  const ip = request.ip || request.socket.remoteAddress || "unknown";
  const bucketHash = hashEmailSecret(`${bucket}:${ip}`, services.tokenSecret);
  const { data, error } = await services.database.rpc("consume_email_attempt", {
    p_bucket_hash: bucketHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error("Email rate limit check failed.");
  return data === true;
}

function emailCookie(request: Request) {
  const cookieHeader = request.headers.cookie ?? "";
  const value = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  return value ? decodeURIComponent(value) : "";
}

function setEmailCookie(request: Request, response: Response, value: string) {
  const secure = request.secure || request.get("x-forwarded-proto") === "https";
  response.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/api/email; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure ? "; Secure" : ""}`,
  );
}

function clearEmailCookie(request: Request, response: Response) {
  const secure = request.secure || request.get("x-forwarded-proto") === "https";
  response.append(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/api/email; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`,
  );
}

async function getSession(
  request: Request,
  response: Response,
  services: EmailServices,
) {
  const token = emailCookie(request);
  if (!token) {
    response.status(401).json({ error: "email_session_required" });
    return null;
  }
  const tokenHash = hashEmailSecret(token, services.tokenSecret);
  const { data, error } = await services.database
    .from("email_subscribers")
    .select("id, email, price_alerts, weekly_brief")
    .eq("status", "active")
    .eq("management_token_hash", tokenHash)
    .gt("management_token_expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error("Email session lookup failed.");
  if (!data) {
    clearEmailCookie(request, response);
    response.status(401).json({ error: "email_session_required" });
    return null;
  }
  return data;
}

function unsubscribeSignature(
  subscriberId: string,
  issuedAt: string,
  secret: string,
) {
  return createHmac("sha256", secret)
    .update(`unsubscribe:${subscriberId}:${issuedAt}`)
    .digest("hex");
}

function parseUnsubscribeToken(value: unknown, secret: string) {
  if (typeof value !== "string") return null;
  const [subscriberId, issuedAt, signature, extra] = value.split(".");
  const timestamp = Number(issuedAt);
  if (
    extra ||
    !/^[0-9a-f-]{36}$/i.test(subscriberId) ||
    !/^\d{13}$/.test(issuedAt) ||
    !Number.isFinite(timestamp) ||
    timestamp > Date.now() + 60_000 ||
    timestamp < Date.now() - 365 * 24 * 60 * 60_000 ||
    !/^[0-9a-f]{64}$/i.test(signature)
  ) {
    return null;
  }
  const expected = unsubscribeSignature(subscriberId, issuedAt, secret);
  if (
    !timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex"),
    )
  ) {
    return null;
  }
  return subscriberId;
}

emailRouter.post("/subscribe", async (request, response) => {
  const parsed = subscribeSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "invalid_subscription" });
    return;
  }
  const services = servicesFor(request, response);
  if (!services) return;

  try {
    if (
      !(await consumeLimit(
        services,
        request,
        `subscribe:${parsed.data.email}`,
        3,
        3600,
      )) ||
      !(await consumeLimit(services, request, "subscribe-ip", 20, 3600))
    ) {
      response.status(429).json({ error: "too_many_requests" });
      return;
    }

    const code = createVerificationCode();
    const verificationHash = hashEmailSecret(
      `verification:${parsed.data.email}:${code}`,
      services.tokenSecret,
    );
    const { data: subscriberId, error } = await services.database.rpc(
      "begin_email_subscription",
      {
        p_email: parsed.data.email,
        p_price_alerts: parsed.data.priceAlerts,
        p_weekly_brief: parsed.data.weeklyBrief,
        p_alert_rules: parsed.data.alerts,
        p_code_hash: verificationHash,
        p_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
    );
    if (error || !subscriberId)
      throw new Error("Email subscription could not be stored.");

    const accountUrl = new URL("/account", services.siteUrl).toString();
    await sendEmail(services, {
      to: parsed.data.email,
      subject: "Your Northstar email verification code",
      text: `Your Northstar verification code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.\n\n${accountUrl}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#18232d"><p style="color:#188b68;font-size:12px;letter-spacing:2px">NORTHSTAR</p><h1 style="font-size:24px">Verify your email</h1><p>Enter this code in the Northstar account window to confirm your email preferences.</p><p style="font-size:32px;font-weight:bold;letter-spacing:8px">${code}</p><p>This code expires in 10 minutes. If you did not request it, ignore this message.</p><p><a href="${accountUrl}">Return to Northstar</a></p></div>`,
      idempotencyKey: `verify:${verificationHash}`,
    });
    response.status(202).json({ message: "verification_code_sent" });
  } catch (error) {
    console.error("Email subscription request failed.");
    response.status(503).json({ error: "email_request_failed" });
  }
});

emailRouter.post("/verify", async (request, response) => {
  const parsed = verifySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "invalid_verification" });
    return;
  }
  const services = servicesFor(request, response);
  if (!services) return;

  try {
    if (
      !(await consumeLimit(
        services,
        request,
        `verify:${parsed.data.email}`,
        8,
        600,
      )) ||
      !(await consumeLimit(services, request, "verify-ip", 40, 600))
    ) {
      response.status(429).json({ error: "too_many_attempts" });
      return;
    }
    const codeHash = hashEmailSecret(
      `verification:${parsed.data.email}:${parsed.data.code}`,
      services.tokenSecret,
    );
    const { data, error } = await services.database.rpc(
      "verify_email_subscription",
      { p_email: parsed.data.email, p_code_hash: codeHash },
    );
    if (error) throw new Error("Email verification failed.");
    const subscriber = Array.isArray(data) ? data[0] : null;
    if (!subscriber) {
      response.status(400).json({ error: "invalid_or_expired_code" });
      return;
    }

    const sessionToken = createEmailToken();
    const sessionHash = hashEmailSecret(sessionToken, services.tokenSecret);
    const { error: sessionError } = await services.database
      .from("email_subscribers")
      .update({
        management_token_hash: sessionHash,
        management_token_expires_at: new Date(
          Date.now() + SESSION_SECONDS * 1000,
        ).toISOString(),
      })
      .eq("id", subscriber.subscriber_id);
    if (sessionError) throw new Error("Email session could not be created.");

    setEmailCookie(request, response, sessionToken);
    response.json({
      email: subscriber.email,
      priceAlerts: subscriber.price_alerts,
      weeklyBrief: subscriber.weekly_brief,
    });
  } catch (error) {
    console.error("Email verification request failed.");
    response.status(503).json({ error: "email_verification_unavailable" });
  }
});

emailRouter.get("/preferences", async (request, response) => {
  const services = servicesFor(request, response);
  if (!services) return;
  try {
    const subscriber = await getSession(request, response, services);
    if (!subscriber) return;
    const { data: alerts, error } = await services.database
      .from("email_alert_rules")
      .select("id, symbol, kind, target, reference_price, enabled")
      .eq("subscriber_id", subscriber.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error("Email alert preferences could not be loaded.");
    response.json({
      email: subscriber.email,
      priceAlerts: subscriber.price_alerts,
      weeklyBrief: subscriber.weekly_brief,
      alerts: (alerts ?? []).map((alert) => ({
        id: alert.id,
        symbol: alert.symbol,
        kind: alert.kind,
        target: Number(alert.target),
        referencePrice: Number(alert.reference_price),
        enabled: alert.enabled,
      })),
    });
  } catch {
    response.status(503).json({ error: "email_preferences_unavailable" });
  }
});

emailRouter.patch("/preferences", async (request, response) => {
  const parsed = preferencesSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "invalid_preferences" });
    return;
  }
  const services = servicesFor(request, response);
  if (!services) return;
  try {
    const subscriber = await getSession(request, response, services);
    if (!subscriber) return;
    const { error } = await services.database.rpc("save_email_preferences", {
      p_subscriber_id: subscriber.id,
      p_price_alerts: parsed.data.priceAlerts,
      p_weekly_brief: parsed.data.weeklyBrief,
      p_rules: parsed.data.alerts,
    });
    if (error) throw new Error("Email preferences could not be saved.");
    response.json({ saved: true });
  } catch {
    response.status(503).json({ error: "email_preferences_unavailable" });
  }
});

emailRouter.put("/alerts", async (request, response) => {
  const parsed = z
    .object({ alerts: z.array(ruleSchema).max(50) })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "invalid_alert_rules" });
    return;
  }
  const services = servicesFor(request, response);
  if (!services) return;
  try {
    const subscriber = await getSession(request, response, services);
    if (!subscriber) return;
    if (!subscriber.price_alerts) {
      response.status(204).end();
      return;
    }
    const { error } = await services.database.rpc("replace_email_alert_rules", {
      p_subscriber_id: subscriber.id,
      p_rules: parsed.data.alerts,
    });
    if (error) throw new Error("Email alert rules could not be synchronized.");
    response.status(204).end();
  } catch {
    response.status(503).json({ error: "email_alert_sync_unavailable" });
  }
});

emailRouter.post("/logout", async (request, response) => {
  const services = servicesFor(request, response);
  if (!services) return;
  try {
    const token = emailCookie(request);
    if (token) {
      const { error } = await services.database
        .from("email_subscribers")
        .update({
          management_token_hash: null,
          management_token_expires_at: null,
        })
        .eq(
          "management_token_hash",
          hashEmailSecret(token, services.tokenSecret),
        );
      if (error) throw new Error("Email session could not be cleared.");
    }
    clearEmailCookie(request, response);
    response.status(204).end();
  } catch {
    response.status(503).json({ error: "email_logout_unavailable" });
  }
});

emailRouter.get("/unsubscribe", (request, response) => {
  const services = servicesFor(request, response);
  if (!services) return;
  const token =
    typeof request.query.token === "string" ? request.query.token : "";
  const subscriberId = parseUnsubscribeToken(token, services.tokenSecret);
  if (!subscriberId) {
    response.status(400).type("text").send("This unsubscribe link is invalid.");
    return;
  }
  response
    .set(
      "Content-Security-Policy",
      "default-src 'none'; form-action 'self'; style-src 'unsafe-inline'",
    )
    .set("X-Content-Type-Options", "nosniff")
    .type("html")
    .send(
      `<main style="font:16px Arial,sans-serif;max-width:520px;margin:12vh auto;padding:24px"><h1>Unsubscribe from Northstar emails?</h1><p>Confirm below to stop price alert and weekly brief emails.</p><form method="post" action="/api/email/unsubscribe?token=${encodeURIComponent(token)}"><button type="submit">Unsubscribe</button></form></main>`,
    );
});

emailRouter.post("/unsubscribe", async (request, response) => {
  const token =
    typeof request.query.token === "string"
      ? request.query.token
      : typeof request.body?.token === "string"
        ? request.body.token
        : "";
  const services = servicesFor(request, response, true);
  if (!services) return;
  try {
    let subscriberId: string | null;
    if (token) {
      subscriberId = parseUnsubscribeToken(token, services.tokenSecret);
      if (!subscriberId) {
        response.status(400).json({ error: "invalid_unsubscribe_link" });
        return;
      }
    } else {
      const subscriber = await getSession(request, response, services);
      if (!subscriber) return;
      subscriberId = subscriber.id;
    }
    const { error } = await services.database
      .from("email_subscribers")
      .update({
        status: "unsubscribed",
        price_alerts: false,
        weekly_brief: false,
        management_token_hash: null,
        management_token_expires_at: null,
      })
      .eq("id", subscriberId);
    if (error) throw new Error("Unsubscribe request failed.");
    clearEmailCookie(request, response);
    response
      .set(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'",
      )
      .set("X-Content-Type-Options", "nosniff")
      .type("html")
      .send(
        '<main style="font:16px Arial,sans-serif;max-width:520px;margin:12vh auto;padding:24px"><h1>You’re unsubscribed</h1><p>Northstar will no longer send you email alerts or weekly briefs.</p></main>',
      );
  } catch {
    response.status(503).json({ error: "unsubscribe_unavailable" });
  }
});

export { emailRouter };
