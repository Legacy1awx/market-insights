import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Check, Mail, ShieldCheck, X } from "lucide-react";
import i18n from "@/i18n";

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
  if (response.status === 503) return i18n.t("email.errors.notConfigured");
  if (response.status === 429) return i18n.t("email.errors.tooMany");
  if (body.error === "invalid_or_expired_code")
    return i18n.t("email.errors.badCode");
  if (response.status === 401) return i18n.t("email.errors.expired");
  return i18n.t("email.errors.generic");
}

export default function EmailAccountDialog({ onClose, onAccount }: Props) {
  const { t } = useTranslation();
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
      showError(t("email.errors.chooseOne"));
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
      showSuccess(t("email.codeSent"));
    } catch {
      showError(t("email.errors.unreachable"));
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
      showSuccess(t("email.verified"));
    } catch {
      showError(t("email.errors.verifyFailed"));
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
      showSuccess(t("email.saved"));
    } catch {
      showError(t("email.errors.saveFailed"));
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
      setMessage(t("email.signedOut"));
    } catch {
      showError(t("auth.errors.signOutFailed"));
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
            <span className="eyebrow">{t("email.eyebrow")}</span>
            <h2 id="account-title">
              {subscriber ? t("email.titleManage") : t("email.titleSubscribe")}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("email.close")}
          >
            <X size={18} />
          </button>
        </div>
        <p className="account-intro">
          {t("email.intro")}
        </p>
        <button
          className="text-button email-resend account-switch"
          type="button"
          onClick={onAccount}
        >
          {t("email.backToAccount")}
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
                ? t("email.service.checking")
                : ready
                  ? t("email.service.ready")
                  : t("email.service.setup")}
            </b>
            {ready === null
              ? t("email.service.checkingText")
              : ready
                ? t("email.service.readyText")
                : t("email.service.setupText")}
          </span>
        </div>

        {subscriber ? (
          <div className="email-subscriber-state">
            <div className="email-subscriber-address">
              <Mail size={15} />
              <span>{subscriber.email}</span>
              <i>{t("email.verifiedTag")}</i>
            </div>
            <EmailPreferenceFields
              preferences={preferences}
              onChange={setPreferences}
            />
            <div className="email-alert-sync-note">
              {preferences.priceAlerts
                ? t("email.alertSync", { count: alerts.length })
                : t("email.alertsOff")}
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
                {t("email.save")}
              </button>
              <button
                className="button button-subtle"
                disabled={busy}
                onClick={signOut}
              >
                {t("email.signOut")}
              </button>
            </div>
            <p className="account-preferences-note">
              {t("email.unsubscribeNote")}
            </p>
          </div>
        ) : (
          <>
            <form className="account-form" onSubmit={subscribe}>
              <label className="account-field">
                <span>{t("auth.email")}</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder={t("auth.emailPlaceholder")}
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
                {busy ? t("email.sending") : t("email.sendCode")}{" "}
                <ArrowRight size={14} />
              </button>
            </form>
            {verificationPending && (
              <form
                className="account-form verification-form"
                onSubmit={verify}
              >
                <label className="account-field">
                  <span>{t("email.codeLabel")}</span>
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
                  {busy ? t("email.verifying") : t("email.verify")}{" "}
                  <Check size={14} />
                </button>
                <button
                  className="text-button email-resend"
                  type="button"
                  disabled={busy}
                  onClick={() => setVerificationPending(false)}
                >
                  {t("email.another")}
                </button>
              </form>
            )}
            <p className="account-preferences-note">
              {t("email.separateNote")}
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
  const { t } = useTranslation();
  return (
    <div className="account-preferences">
      <div className="account-preferences-heading">
        <Mail size={16} />
        <div>
          <b>{t("email.preferences")}</b>
          <span>{t("email.preferencesText")}</span>
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
          <b>{t("email.priceAlerts")}</b>
          <small>{t("email.priceAlertsText")}</small>
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
          <b>{t("email.weeklyBrief")}</b>
          <small>{t("email.weeklyBriefText")}</small>
        </span>
      </label>
    </div>
  );
}
