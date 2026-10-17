import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type AuthResult = { error: string | null; sessionCreated?: boolean };
type SignupProfile = { firstName: string; lastName: string };
type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  isConfigured: boolean;
  sessionError: string | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (
    email: string,
    password: string,
    profile: SignupProfile,
  ) => Promise<AuthResult>;
  signOut: () => Promise<AuthResult>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Authentication failed. Please try again.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setSessionError(null);
      setIsLoading(false);
    });

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) throw error;
        setUser(data.session?.user ?? null);
        setSessionError(null);
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setUser(null);
        setSessionError(errorMessage(error));
        setIsLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isConfigured: supabase !== null,
      sessionError,
      async signIn(email, password) {
        if (!supabase)
          return {
            error:
              "Account sign-in is not configured. Add the Supabase URL and public anon key to the VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.",
          };
        try {
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          return { error: error?.message ?? null };
        } catch (error) {
          return { error: errorMessage(error) };
        }
      },
      async signUp(email, password, profile) {
        if (!supabase)
          return {
            error:
              "Account sign-up is not configured. Add the Supabase URL and public anon key to the VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.",
          };
        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: window.location.origin,
              data: {
                first_name: profile.firstName.trim(),
                last_name: profile.lastName.trim(),
                full_name: `${profile.firstName.trim()} ${profile.lastName.trim()}`,
              },
            },
          });
          return {
            error: error?.message ?? null,
            sessionCreated: Boolean(data.session),
          };
        } catch (error) {
          return { error: errorMessage(error) };
        }
      },
      async signOut() {
        if (!supabase) return { error: "Authentication is not configured." };
        try {
          const { error } = await supabase.auth.signOut();
          return { error: error?.message ?? null };
        } catch (error) {
          return { error: errorMessage(error) };
        }
      },
    }),
    [isLoading, sessionError, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider.");
  return context;
}
