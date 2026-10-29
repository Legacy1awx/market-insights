/**
 * Names of the server-side Supabase variables that are missing, so failures
 * can be logged precisely (values are never logged).
 */
export function missingSupabaseEnv() {
  return ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(
    (name) => !process.env[name],
  );
}

/** Logs why an API request couldn't be authenticated or served. */
export function logAuthFailure(area: string, error: unknown) {
  const missing = missingSupabaseEnv();
  if (missing.length) {
    console.error(
      `[${area}] Server is missing environment variables: ${missing.join(", ")}. Add them in the hosting settings and redeploy.`,
    );
    return;
  }
  console.error(
    `[${area}] Request failed during sign-in check:`,
    error instanceof Error ? error.message : error,
  );
}
