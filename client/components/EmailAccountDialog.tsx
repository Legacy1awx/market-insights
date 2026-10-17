import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Check, Mail, ShieldCheck, X } from "lucide-react";

type EmailPreferences = { priceAlerts: boolean; weeklyBrief: boolean };
type EmailPriceAlert = {
  id: string;
  symbol: string;
  kind: "above" | "below" | "up" | "down";
  target: number;
  referencePrice: number;
  enabled: boolean;
};
type EmailSubscriber = { email: string } & EmailPreferences;
type Props = { onClose: () => void; onAccount: () => void };

const symbols = new Set([
  "BTC",
  "ETH",
  "SOL",
  "BNB",
  "XRP",
  "ADA",
  "AVAX",
  "LINK",
]);
const kinds = new Set(["above", "below", "up", "down"]);

function readLocalAlerts(): EmailPriceAlert[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem("northstar-alerts") ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((value): EmailPriceAlert[] => {
      if (!value || typeof value !== "object") return [];
      const alert = value as Record<string, unknown>;
      const referencePrice = Number(alert.reference ?? alert.referencePrice);
      const target = Number(alert.target);
      if (
        typeof alert.id !== "string" ||
        typeof alert.symbol !== "string" ||
        !symbols.has(alert.symbol) ||
        typeof alert.kind !== "string" ||
        !kinds.has(alert.kind) ||
        !Number.isFinite(target) ||
        target <= 0 ||
        !Number.isFinite(referencePrice) ||
        referencePrice <= 0
      )
        return [];
      return [
        {
          id: alert.id,
          symbol: alert.symbol,
          kind: alert.kind as EmailPriceAlert["kind"],
          target,
          referencePrice,
          enabled: alert.enabled !== false,
        },
      ];
    });
  } catch {
    return [];
  }
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (response.status === 503)
    return "Email delivery is not configured. Set the Supabase and Resend server credentials and apply the email migration.";
  if (response.status === 429)
    return "Too many attempts. Wait a little before trying again.";
  if (body.error === "invalid_or_expired_code")
    return "That code is incorrect or expired. Request a new code and try again.";
  if (response.status === 401)
    return "Your email session expired. Verify your email again to manage these preferences.";
  return "We couldn’t complete that request. Check your connection and try again.";
}

export default function EmailAccountDialog({ onClose, onAccount }: Props) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [subscriber, setSubscriber] = useState<EmailSubscriber | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verificationPending, setVerificationPending] = useState(false);
  const [preferences, setPreferences] = useState<EmailPreferences>({
    priceAlerts: false,
    weeklyBrief: false,
  });
  const [alerts, setAlerts] = useState<EmailPriceAlert[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const status = await fetch("/api/email/status", {
          credentials: "same-origin",
        });
        if (!active) return;
        setReady(status.ok);
        if (!status.ok) return;
        const response = await fetch("/api/email/preferences", {
          credentials: "same-origin",
        });
        if (!active || !response.ok) return;
        const data = await response.json();
        setSubscriber({
          email: data.email,
          priceAlerts: data.priceAlerts,
          weeklyBrief: data.weeklyBrief,
        });
        setEmail(data.email);
        setPreferences({
          priceAlerts: data.priceAlerts,
          weeklyBrief: data.weeklyBrief,
        });
        setAlerts(data.alerts);
      } catch {
        if (active) setReady(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const showError = (text: string) => {
    setIsError(true);
    setMessage(text);
  };
  const showSuccess = (text: string) => {
    setIsError(false);
    setMessage(text);
  };

  const subscribe = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!preferences.priceAlerts && !preferences.weeklyBrief) {
      showError("Choose at least one type of email to continue.");
      return;
    }
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const submittedEmail = String(form.get("email") ?? "")
      .trim()
      .toLowerCase();
    try {
      const response = await fetch("/api/email/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: submittedEmail,
          ...preferences,
          alerts: preferences.priceAlerts ? readLocalAlerts() : [],
        }),
      });
      if (!response.ok) {
        showError(await responseError(response));
        return;
      }
      setEmail(submittedEmail);
      setVerificationPending(true);
      showSuccess(
        "We sent a one-time verification code. It expires in 10 minutes.",
      );
    } catch {
      showError("We couldn’t reach the email service. Please try again later.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/email/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (!response.ok) {
        showError(await responseError(response));
        return;
      }
      const data = await response.json();
      const activeSubscriber = {
        email: data.email,
        priceAlerts: data.priceAlerts,
        weeklyBrief: data.weeklyBrief,
      };
      setSubscriber(activeSubscriber);
      setEmail(data.email);
      setPreferences({
        priceAlerts: data.priceAlerts,
        weeklyBrief: data.weeklyBrief,
      });
      setVerificationPending(false);
      setCode("");
      const saved = await fetch("/api/email/preferences", {
        credentials: "same-origin",
      });
      if (saved.ok) {
        const savedData = await saved.json();
        setAlerts(savedData.alerts);
      }
      showSuccess("Email verified. Your selected updates are ready.");
    } catch {
      showError("We couldn’t verify that code. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const savePreferences = async () => {
    if (!subscriber) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/email/preferences", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...preferences,
          alerts: preferences.priceAlerts ? readLocalAlerts() : [],
        }),
      });
      if (!response.ok) {
        showError(await responseError(response));
        if (response.status === 401) setSubscriber(null);
        return;
      }
      setAlerts(preferences.priceAlerts ? readLocalAlerts() : []);
      setSubscriber({ ...subscriber, ...preferences });
      showSuccess("Your email preferences are saved.");
    } catch {
      showError("We couldn’t save your preferences. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch("/api/email/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      setSubscriber(null);
      setVerificationPending(false);
      setMessage("You’ve signed out of email preferences on this device.");
    } catch {
      showError("We couldn’t sign out. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="settings-modal account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-title"
      >
        <div className="settings-modal-heading">
          <div>
            <span className="eyebrow">EMAIL PREFERENCES</span>
            <h2 id="account-title">
              {subscriber ? "Manage your emails" : "Get Northstar by email"}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close email preferences"
          >
            <X size={18} />
          </button>
        </div>
        <p className="account-intro">
          Choose the market updates you want. We’ll only email the topics you
          select.
        </p>
        <button
          className="text-button email-resend account-switch"
          type="button"
          onClick={onAccount}
        >
          Return to password account
        </button>
        <div
          className={
            ready ? "email-service-callout ready" : "email-service-callout"
          }
          role="status"
        >
          <ShieldCheck size={16} />
          <span>
            <b>
              {ready === null
                ? "Checking email service"
                : ready
                  ? "Verified email delivery"
                  : "Email delivery needs setup"}
            </b>
            {ready === null
              ? "Checking the server configuration."
              : ready
                ? "Verification codes, price alerts, and weekly briefs are ready."
                : "Connect Supabase and Resend, configure the sender domain, and apply the email migration."}
          </span>
        </div>

        {subscriber ? (
          <div className="email-subscriber-state">
            <div className="email-subscriber-address">
              <Mail size={15} />
              <span>{subscriber.email}</span>
              <i>Email verified</i>
            </div>
            <EmailPreferenceFields
              preferences={preferences}
              onChange={setPreferences}
            />
            <div className="email-alert-sync-note">
              {preferences.priceAlerts
                ? `${alerts.length} saved price alert${alerts.length === 1 ? "" : "s"} will be checked every five minutes.`
                : "Price alert emails are turned off."}
            </div>
            {message && (
              <p
                className={isError ? "account-notice error" : "account-notice"}
                role="status"
              >
                {message}
              </p>
            )}
            <div className="email-account-actions">
              <button
                className="button button-primary account-submit"
                disabled={busy}
                onClick={savePreferences}
              >
                Save preferences
              </button>
              <button
                className="button button-subtle"
                disabled={busy}
                onClick={signOut}
              >
                Sign out of email preferences
              </button>
            </div>
            <p className="account-preferences-note">
              Unsubscribe links are included in every email. Each alert sends
              once when its condition is met; change the condition or create a
              new alert to receive another notification.
            </p>
          </div>
        ) : (
          <>
            <form className="account-form" onSubmit={subscribe}>
              <label className="account-field">
                <span>Email address</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={254}
                />
              </label>
              <EmailPreferenceFields
                preferences={preferences}
                onChange={setPreferences}
              />
              {message && !verificationPending && (
                <p
                  className={
                    isError ? "account-notice error" : "account-notice"
                  }
                  role="status"
                >
                  {message}
                </p>
              )}
              <button
                className="button button-primary account-submit"
                type="submit"
                disabled={
                  busy ||
                  !ready ||
                  (!preferences.priceAlerts && !preferences.weeklyBrief)
                }
              >
                {busy ? "Sending code…" : "Email me a verification code"}{" "}
                <ArrowRight size={14} />
              </button>
            </form>
            {verificationPending && (
              <form
                className="account-form verification-form"
                onSubmit={verify}
              >
                <label className="account-field">
                  <span>6-digit verification code</span>
                  <input
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    required
                  />
                </label>
                {message && (
                  <p
                    className={
                      isError ? "account-notice error" : "account-notice"
                    }
                    role="status"
                  >
                    {message}
                  </p>
                )}
                <button
                  className="button button-primary account-submit"
                  type="submit"
                  disabled={busy || code.length !== 6}
                >
                  {busy ? "Verifying…" : "Verify email"} <Check size={14} />
                </button>
                <button
                  className="text-button email-resend"
                  type="button"
                  disabled={busy}
                  onClick={() => setVerificationPending(false)}
                >
                  Use another email or request a new code
                </button>
              </form>
            )}
            <p className="account-preferences-note">
              Only verified email addresses are added. Email update preferences
              are managed separately from your Northstar password account.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

function EmailPreferenceFields({
  preferences,
  onChange,
}: {
  preferences: EmailPreferences;
  onChange: (preferences: EmailPreferences) => void;
}) {
  return (
    <div className="account-preferences">
      <div className="account-preferences-heading">
        <Mail size={16} />
        <div>
          <b>Email preferences</b>
          <span>Choose what you’d like to receive.</span>
        </div>
      </div>
      <label className="account-checkbox-row">
        <input
          type="checkbox"
          checked={preferences.priceAlerts}
          onChange={(event) =>
            onChange({ ...preferences, priceAlerts: event.target.checked })
          }
        />
        <span>
          <b>Price alert emails</b>
          <small>Updates when a saved asset reaches its alert threshold.</small>
        </span>
      </label>
      <label className="account-checkbox-row">
        <input
          type="checkbox"
          checked={preferences.weeklyBrief}
          onChange={(event) =>
            onChange({ ...preferences, weeklyBrief: event.target.checked })
          }
        />
        <span>
          <b>Weekly market brief</b>
          <small>A weekly roundup of major digital assets.</small>
        </span>
      </label>
    </div>
  );
}
