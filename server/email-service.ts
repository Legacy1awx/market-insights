import { createHmac, randomBytes, randomInt } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export type EmailServices = {
  database: SupabaseClient;
  resend: Resend;
  from: string;
  siteUrl: URL;
  tokenSecret: string;
};

export class EmailConfigurationError extends Error {}

export function getEmailServices(): EmailServices {
  const databaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const publicSiteUrl = process.env.PUBLIC_SITE_URL;
  const tokenSecret = process.env.EMAIL_TOKEN_SECRET;

  if (
    !databaseUrl ||
    !serviceRoleKey ||
    !resendApiKey ||
    !from ||
    !publicSiteUrl ||
    !tokenSecret ||
    tokenSecret.length < 32
  ) {
    throw new EmailConfigurationError("Email service is not configured.");
  }

  let siteUrl: URL;
  try {
    siteUrl = new URL(publicSiteUrl);
  } catch {
    throw new EmailConfigurationError("Email service is not configured.");
  }
  if (siteUrl.protocol !== "https:" && siteUrl.hostname !== "localhost") {
    throw new EmailConfigurationError("Email service is not configured.");
  }

  return {
    database: createClient(databaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    resend: new Resend(resendApiKey),
    from,
    siteUrl,
    tokenSecret,
  };
}

export function hashEmailSecret(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function createUnsubscribeToken(subscriberId: string, secret: string) {
  const issuedAt = Date.now().toString();
  const signature = createHmac("sha256", secret)
    .update(`unsubscribe:${subscriberId}:${issuedAt}`)
    .digest("hex");
  return `${subscriberId}.${issuedAt}.${signature}`;
}

export function createEmailToken() {
  return randomBytes(32).toString("base64url");
}

export function createVerificationCode() {
  return String(randomInt(100_000, 1_000_000));
}

export async function sendEmail(
  services: EmailServices,
  message: {
    to: string;
    subject: string;
    text: string;
    html: string;
    headers?: Record<string, string>;
    idempotencyKey?: string;
  },
) {
  const { idempotencyKey, ...payload } = message;
  const { error } = await services.resend.emails.send(
    { from: services.from, ...payload },
    idempotencyKey ? { idempotencyKey } : undefined,
  );
  if (error) throw new Error("Email provider rejected the message.");
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}
