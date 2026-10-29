import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Mail, ShieldCheck, UserRound, X } from "lucide-react";
import { useAuth } from "@/lib/auth";

type Props = {
  onClose: () => void;
  onEmailUpdates: () => void;
};

export default function AuthDialog({ onClose, onEmailUpdates }: Props) {
  const { t } = useTranslation();
  const { user, isConfigured, sessionError, signIn, signOut, signUp } =
    useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    if (
      mode === "sign-up" &&
      (!firstName.trim() || !lastName.trim())
    ) {
      setIsError(true);
      setMessage(t("auth.errors.nameRequired"));
      return;
    }
    if (mode === "sign-up" && password !== confirmPassword) {
      setIsError(true);
      setMessage(t("auth.errors.passwordMismatch"));
      return;
    }

    setBusy(true);
    try {
      const result =
        mode === "sign-in"
          ? await signIn(email.trim(), password)
          : await signUp(email.trim(), password, {
              firstName: firstName.trim(),
              lastName: lastName.trim(),
            });
      if (result.error) {
        setIsError(true);
        setMessage(result.error);
      } else if (mode === "sign-up") {
        setIsError(false);
        setMessage(
          result.sessionCreated
            ? t("auth.createdSignedIn")
            : t("auth.createdConfirmEmail"),
        );
        if (!result.sessionCreated) setMode("sign-in");
        setPassword("");
        setConfirmPassword("");
      } else {
        setIsError(false);
        setMessage(t("auth.signedInMessage"));
        setPassword("");
      }
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : t("auth.errors.failed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setMessage("");
    try {
      const result = await signOut();
      setIsError(Boolean(result.error));
      setMessage(result.error ?? t("auth.signedOutMessage"));
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : t("auth.errors.signOutFailed"),
      );
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
        aria-labelledby="auth-title"
      >
        <div className="settings-modal-heading">
          <div>
            <span className="eyebrow">{t("auth.eyebrow")}</span>
            <h2 id="auth-title">
              {user
                ? t("auth.titleAccount")
                : mode === "sign-in"
                  ? t("auth.titleSignIn")
                  : t("auth.titleSignUp")}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("auth.close")}
          >
            <X size={18} />
          </button>
        </div>

        <p className="account-intro">
          {user
            ? t("auth.introSignedIn")
            : t("auth.introSignedOut")}
        </p>

        {!isConfigured && (
          <div className="email-service-callout" role="status">
            <ShieldCheck size={16} />
            <span>
              <b>{t("auth.setupTitle")}</b>
              {t("auth.setupText")}
            </span>
          </div>
        )}
        {sessionError && (
          <p className="account-notice error" role="alert">
            {t("auth.sessionError", { error: sessionError })}
          </p>
        )}

        {user ? (
          <div className="auth-signed-in">
            <div className="email-subscriber-address">
              <UserRound size={16} />
              <span>{user.email ?? t("auth.signedInUser")}</span>
              <i>{t("auth.signedIn")}</i>
            </div>
            {message && (
              <p
                className={isError ? "account-notice error" : "account-notice"}
                role="status"
              >
                {message}
              </p>
            )}
            <button
              className="button button-primary account-submit"
              disabled={busy}
              onClick={handleSignOut}
            >
              {busy ? t("auth.signingOut") : t("auth.signOut")}
            </button>
          </div>
        ) : (
          <>
            <div className="auth-mode-switch" aria-label={t("auth.accessLabel")}>
              <button
                type="button"
                className={mode === "sign-in" ? "selected" : ""}
                aria-pressed={mode === "sign-in"}
                onClick={() => {
                  setMode("sign-in");
                  setMessage("");
                }}
              >
                {t("common.signIn")}
              </button>
              <button
                type="button"
                className={mode === "sign-up" ? "selected" : ""}
                aria-pressed={mode === "sign-up"}
                onClick={() => {
                  setMode("sign-up");
                  setMessage("");
                }}
              >
                {t("auth.signUp")}
              </button>
            </div>
            <form className="account-form" onSubmit={submit}>
              {mode === "sign-up" && (
                <>
                  <label className="account-field">
                    <span>{t("auth.firstName")}</span>
                    <input
                      type="text"
                      autoComplete="given-name"
                      value={firstName}
                      onChange={(event) => setFirstName(event.target.value)}
                      maxLength={80}
                      required
                    />
                  </label>
                  <label className="account-field">
                    <span>{t("auth.lastName")}</span>
                    <input
                      type="text"
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(event) => setLastName(event.target.value)}
                      maxLength={80}
                      required
                    />
                  </label>
                </>
              )}
              <label className="account-field">
                <span>{t("auth.email")}</span>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder={t("auth.emailPlaceholder")}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={254}
                  required
                />
              </label>
              <label className="account-field">
                <span>{t("auth.password")}</span>
                <input
                  type="password"
                  autoComplete={
                    mode === "sign-in" ? "current-password" : "new-password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={6}
                  maxLength={128}
                  required
                />
              </label>
              {mode === "sign-up" && (
                <label className="account-field">
                  <span>{t("auth.confirmPassword")}</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={6}
                    maxLength={128}
                    required
                  />
                </label>
              )}
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
                disabled={busy || !isConfigured}
              >
                {busy
                  ? mode === "sign-in"
                    ? t("auth.signingIn")
                    : t("auth.creatingAccount")
                  : mode === "sign-in"
                    ? t("common.signIn")
                    : t("auth.createAccount")}{" "}
                <ArrowRight size={14} />
              </button>
            </form>
            <p className="account-preferences-note">
              {mode === "sign-up"
                ? t("auth.confirmEmailNote")
                : t("auth.newHereNote")}
            </p>
          </>
        )}

        <button
          className="text-button email-resend auth-email-updates"
          type="button"
          onClick={onEmailUpdates}
        >
          <Mail size={14} /> {t("auth.manageEmail")}
        </button>
      </section>
    </div>
  );
}
