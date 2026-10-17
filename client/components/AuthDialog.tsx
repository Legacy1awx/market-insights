import { useState, type FormEvent } from "react";
import { ArrowRight, Mail, ShieldCheck, UserRound, X } from "lucide-react";
import { useAuth } from "@/lib/auth";

type Props = {
  onClose: () => void;
  onEmailUpdates: () => void;
};

export default function AuthDialog({ onClose, onEmailUpdates }: Props) {
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
      setMessage("Enter your first and last name.");
      return;
    }
    if (mode === "sign-up" && password !== confirmPassword) {
      setIsError(true);
      setMessage("The passwords do not match.");
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
            ? "Account created. You’re signed in."
            : "Account created. Check your inbox for a confirmation link before signing in.",
        );
        if (!result.sessionCreated) setMode("sign-in");
        setPassword("");
        setConfirmPassword("");
      } else {
        setIsError(false);
        setMessage("You’re signed in.");
        setPassword("");
      }
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Authentication failed. Please try again.",
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
      setMessage(result.error ?? "You’re signed out.");
    } catch (error) {
      setIsError(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not sign out. Please try again.",
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
            <span className="eyebrow">NORTHSTAR ACCOUNT</span>
            <h2 id="auth-title">
              {user
                ? "Your account"
                : mode === "sign-in"
                  ? "Welcome back"
                  : "Create your account"}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close account"
          >
            <X size={18} />
          </button>
        </div>

        <p className="account-intro">
          {user
            ? "Your Northstar account is signed in on this device."
            : "Sign in or create an account to use Northstar across your devices."}
        </p>

        {!isConfigured && (
          <div className="email-service-callout" role="status">
            <ShieldCheck size={16} />
            <span>
              <b>Account sign-in needs setup</b>
              Add your Supabase project URL and public anon key as
              VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the
              development server.
            </span>
          </div>
        )}
        {sessionError && (
          <p className="account-notice error" role="alert">
            Could not restore your saved sign-in: {sessionError}
          </p>
        )}

        {user ? (
          <div className="auth-signed-in">
            <div className="email-subscriber-address">
              <UserRound size={16} />
              <span>{user.email ?? "Signed-in user"}</span>
              <i>Signed in</i>
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
              {busy ? "Signing out…" : "Sign out"}
            </button>
          </div>
        ) : (
          <>
            <div className="auth-mode-switch" aria-label="Account access">
              <button
                type="button"
                className={mode === "sign-in" ? "selected" : ""}
                aria-pressed={mode === "sign-in"}
                onClick={() => {
                  setMode("sign-in");
                  setMessage("");
                }}
              >
                Sign in
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
                Sign up
              </button>
            </div>
            <form className="account-form" onSubmit={submit}>
              {mode === "sign-up" && (
                <>
                  <label className="account-field">
                    <span>First name</span>
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
                    <span>Last name</span>
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
                <span>Email address</span>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={254}
                  required
                />
              </label>
              <label className="account-field">
                <span>Password</span>
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
                  <span>Confirm password</span>
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
                    ? "Signing in…"
                    : "Creating account…"
                  : mode === "sign-in"
                    ? "Sign in"
                    : "Create account"}{" "}
                <ArrowRight size={14} />
              </button>
            </form>
            <p className="account-preferences-note">
              {mode === "sign-up"
                ? "You may need to confirm your email before signing in."
                : "New to Northstar? Choose Sign up to create an account."}
            </p>
          </>
        )}

        <button
          className="text-button email-resend auth-email-updates"
          type="button"
          onClick={onEmailUpdates}
        >
          <Mail size={14} /> Manage email updates
        </button>
      </section>
    </div>
  );
}
