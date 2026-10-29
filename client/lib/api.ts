import i18n from "@/i18n";
import { formatDate } from "@/i18n/format";
import { supabase } from "@/lib/supabase";

/** Error body returned by the API: a code plus optional field messages. */
type ApiFailure = {
  error?: string;
  details?: Record<string, string[] | undefined>;
};

/**
 * Calls one of the app's /api endpoints as the signed-in user and returns the
 * parsed JSON. Errors become friendly messages: the first field-level detail,
 * else the message mapped from the error code, else a generic fallback.
 */
export async function authorizedFetch<T>(
  path: string,
  init: RequestInit = {},
  messages: Record<string, string> = {},
): Promise<T> {
  if (!supabase) throw new Error(i18n.t("api.notConfigured"));
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token)
    throw new Error(i18n.t("api.sessionExpired"));
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = body as ApiFailure | null;
    const detail = failure?.details
      ? Object.values(failure.details).flat()[0]
      : undefined;
    throw new Error(
      detail ??
        messages[failure?.error ?? ""] ??
        i18n.t("api.generic"),
    );
  }
  return body as T;
}

export function formatDateTime(value: string | null) {
  return value ? formatDate(value) : "—";
}

export function shortenMiddle(value: string, keep = 8) {
  return value.length > keep * 2 + 3
    ? `${value.slice(0, keep)}…${value.slice(-keep)}`
    : value;
}
