import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AdminUserProfile } from "@/components/AdminUserProfile";
import { InvestmentHistoryChart } from "@/components/InvestmentHistoryChart";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  Coins,
  LoaderCircle,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { explorerUrl } from "@shared/deposit-assets";
import {
  INTERVAL_ERROR,
  describeMovement,
  intervalToSeconds,
  secondsToInterval,
  type IntervalUnit,
} from "@/lib/movement";
import { supabase } from "@/lib/supabase";

const ASSETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "AVAX", "LINK"];
type Section =
  "market" | "content" | "alerts" | "deposits" | "investments" | "users";
type MarketOverride = {
  symbol: string;
  price: number | null;
  change: number | null;
  updatedAt?: string;
};
type Article = {
  id: string;
  title: string;
  summary: string;
  category: string;
  readMinutes: number;
  published: boolean;
  publishedAt: string | null;
};
type Subscriber = {
  id: string;
  email: string;
  status: string;
  priceAlerts: boolean;
  weeklyBrief: boolean;
  ruleCount: number;
  createdAt: string;
};
export type Deposit = {
  id: string;
  user: {
    id: string;
    email: string | null;
    fullName: string | null;
    createdAt: string | null;
  };
  symbol: string;
  network: string;
  amount: string;
  transactionHash: string;
  senderAddress: string | null;
  recipientAddress: string;
  status: "pending" | "confirmed" | "rejected";
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  reviewHistory: {
    status: "confirmed" | "rejected";
    note: string | null;
    reviewedBy: string | null;
    reviewedAt: string;
  }[];
};
export type AdminDepositPage = {
  deposits: Deposit[];
  page: number;
  perPage: number;
  total: number;
  lastPage: number;
};
export type AdminAccount = {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  role: string;
  depositCount: number;
  investedUsd: string;
};
type AdminAccountPage = {
  users: AdminAccount[];
  page: number;
  perPage: number;
  total: number;
  lastPage: number | null;
};
export type ManagedInvestment = {
  id: string;
  symbol: "USDT" | "BTC" | "ETH" | "SOL";
  investedUsd: string;
  returnUsd: string;
  movementDirection: "up" | "down" | "continuous" | "paused";
  movementAmount: string;
  movementIntervalSeconds: number;
  history: { recordedAt: string; balanceUsd: string }[];
  updatedAt: string;
};
type ArticleDraft = Omit<Article, "id" | "publishedAt"> & {
  id?: string;
  publishedAt?: string | null;
};

const emptyInvestmentDraft = {
  symbol: "BTC" as ManagedInvestment["symbol"],
  investedUsd: "",
  returnUsd: "0",
  movementDirection: "paused" as ManagedInvestment["movementDirection"],
  movementAmount: "1.00",
  movementEvery: "1",
  movementUnit: "minutes" as IntervalUnit,
};

class AdminRequestError extends Error {}

async function adminRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!supabase)
    throw new AdminRequestError("Supabase Auth is not configured.");
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new AdminRequestError(error.message);
  const token = data.session?.access_token;
  if (!token) throw new AdminRequestError("Sign in to continue.");
  const response = await fetch(`/api/admin${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      details?: Record<string, string[] | undefined>;
    } | null;
    if (response.status === 403)
      throw new AdminRequestError("This account does not have admin access.");
    if (response.status === 401)
      throw new AdminRequestError(
        "Your session expired. Please sign in again.",
      );
    if (body?.error === "investment_chart_migration_required") {
      throw new AdminRequestError(
        "Apply supabase/migrations/202610160001_managed_investment_charts.sql to enable investment charts and movement.",
      );
    }
    if (body?.error === "continuous_movement_migration_required") {
      throw new AdminRequestError(
        "Continuous movement isn't enabled in the database yet. Run supabase/migrations/202610160002_continuous_investment_movement.sql in the Supabase SQL editor, then try again.",
      );
    }
    if (body?.error === "deposit_confirmed_credit_failed") {
      throw new AdminRequestError(
        "The transfer was confirmed, but the amount couldn't be added to the user's investment. Add it manually on the Investments tab.",
      );
    }
    if (body?.error === "cannot_delete_self") {
      throw new AdminRequestError("You can't delete your own admin account.");
    }
    if (body?.error === "cannot_delete_admin") {
      throw new AdminRequestError(
        "Admin accounts can't be deleted from the dashboard. Remove the admin role first.",
      );
    }
    if (body?.error === "user_not_found") {
      throw new AdminRequestError("This user no longer exists.");
    }
    if (body?.error === "invalid_investment_movement") {
      throw new AdminRequestError(
        "Movement not updated. The amount must be a positive USD value with up to two decimal places.",
      );
    }
    if (body?.error === "invalid_managed_investment") {
      const fieldNames: Record<string, string> = {
        userId: "selected user",
        symbol: "asset",
        investedUsd: "invested amount",
        returnUsd: "return",
        movementDirection: "chart direction",
        movementAmount: "movement amount",
        movementIntervalSeconds: "movement interval",
      };
      const validationErrors = Object.entries(body.details ?? {}).flatMap(
        ([field, messages]) =>
          (messages ?? []).map(
            (message) => `${fieldNames[field] ?? field}: ${message}`,
          ),
      );
      throw new AdminRequestError(
        validationErrors.length
          ? `Investment not saved. ${validationErrors.join(" ")}`
          : "Investment not saved. Check the selected user, asset, and USD amounts. Amounts must be positive USD values with up to two decimal places.",
      );
    }
    throw new AdminRequestError(
      body?.error ?? `Admin request failed (${response.status}).`,
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function AdminAccessMessage({
  title,
  children,
}: {
  title: string;
  children: string;
}) {
  return (
    <main className="admin-access">
      <section className="panel admin-access-card">
        <ShieldCheck size={30} />
        <h1>{title}</h1>
        <p>{children}</p>
        <Link className="button button-primary" to="/">
          <ArrowLeft size={15} /> Return to Northstar
        </Link>
      </section>
    </main>
  );
}

export default function Admin() {
  const { user, isLoading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("market");
  const [market, setMarket] = useState<MarketOverride[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [depositsTotal, setDepositsTotal] = useState(0);
  const [depositsPage, setDepositsPage] = useState(1);
  const [accounts, setAccounts] = useState<AdminAccountPage>({
    users: [],
    page: 1,
    perPage: 50,
    total: 0,
    lastPage: 1,
  });
  const [usersPage, setUsersPage] = useState(1);
  const [investmentUserId, setInvestmentUserId] = useState("");
  const [managedInvestments, setManagedInvestments] = useState<
    ManagedInvestment[]
  >([]);
  const [investmentDraft, setInvestmentDraft] = useState(emptyInvestmentDraft);
  const [investmentLoading, setInvestmentLoading] = useState(false);
  const [profileAccount, setProfileAccount] = useState<AdminAccount | null>(
    null,
  );
  const [investmentRevision, setInvestmentRevision] = useState(0);
  const [investmentRefreshLoading, setInvestmentRefreshLoading] =
    useState(false);
  const [depositFilter, setDepositFilter] = useState<
    "all" | "pending" | "confirmed" | "rejected"
  >("all");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [creditDrafts, setCreditDrafts] = useState<Record<string, string>>(
    {},
  );
  const [usdPrices, setUsdPrices] = useState<Record<string, number>>({
    USDT: 1,
  });
  const [verifiedDeposits, setVerifiedDeposits] = useState<Set<string>>(
    () => new Set(),
  );
  const [drafts, setDrafts] = useState<
    Record<string, { price: string; change: string }>
  >({});
  const [articleDraft, setArticleDraft] = useState<ArticleDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const knownDepositIds = useRef(new Set<string>());
  const hasLoadedDeposits = useRef(false);

  const loadAdminData = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const [marketData, contentData, alertData, depositData, accountData] =
        await Promise.all([
          adminRequest<MarketOverride[]>("/market-overrides"),
          adminRequest<Article[]>("/content"),
          adminRequest<Subscriber[]>("/alerts"),
          adminRequest<AdminDepositPage>(
            `/deposits?status=${depositFilter}&page=${depositsPage}`,
          ),
          adminRequest<AdminAccountPage>(`/users?page=${usersPage}`),
        ]);
      setMarket(marketData);
      setArticles(contentData);
      setSubscribers(alertData);
      setDeposits(depositData.deposits);
      setDepositsTotal(depositData.total);
      knownDepositIds.current = new Set(
        depositData.deposits.map((deposit) => deposit.id),
      );
      hasLoadedDeposits.current = true;
      setAccounts(accountData);
      setInvestmentUserId((current) =>
        accountData.users.some((account) => account.id === current)
          ? current
          : (accountData.users[0]?.id ?? ""),
      );
      setDrafts(
        Object.fromEntries(
          marketData.map((item) => [
            item.symbol,
            {
              price: item.price === null ? "" : String(item.price),
              change: item.change === null ? "" : String(item.change),
            },
          ]),
        ),
      );
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not load admin data.",
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, [depositFilter, depositsPage, usersPage]);

  const refreshAdminData = async () => {
    setInvestmentRefreshLoading(true);
    try {
      const loaded = await loadAdminData();
      if (section === "investments") {
        setInvestmentRevision((revision) => revision + 1);
      }
      if (loaded) toast.success("Admin records refreshed");
    } finally {
      setInvestmentRefreshLoading(false);
    }
  };

  const refreshDeposits = useCallback(async () => {
    const page = await adminRequest<AdminDepositPage>(
      `/deposits?status=${depositFilter}&page=${depositsPage}`,
    );
    if (hasLoadedDeposits.current) {
      for (const deposit of page.deposits) {
        if (knownDepositIds.current.has(deposit.id)) continue;
        const submittedAt = new Date(deposit.submittedAt).getTime();
        if (Date.now() - submittedAt < 60_000) {
          toast.info("New transfer awaiting review", {
            description: `${deposit.amount} ${deposit.symbol} · ${deposit.user.email ?? "User account"}`,
          });
        }
      }
    }
    knownDepositIds.current = new Set(
      page.deposits.map((deposit) => deposit.id),
    );
    hasLoadedDeposits.current = true;
    setDeposits(page.deposits);
    setDepositsTotal(page.total);
  }, [depositFilter, depositsPage]);

  useEffect(() => {
    if (section !== "deposits" || loading) return;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void refreshDeposits().catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Could not refresh transfer submissions.",
        );
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(timer);
  }, [loading, refreshDeposits, section]);

  useEffect(() => {
    if (!investmentUserId || section !== "investments") {
      if (!investmentUserId) setManagedInvestments([]);
      return;
    }
    let active = true;
    setInvestmentLoading(true);
    const refreshInvestments = async (showLoading: boolean) => {
      if (showLoading) setInvestmentLoading(true);
      try {
        const data = await adminRequest<ManagedInvestment[]>(
          `/investments?userId=${encodeURIComponent(investmentUserId)}`,
        );
        if (active) {
          setManagedInvestments(data);
          setError("");
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Could not load the user's investments.",
          );
        }
      } finally {
        if (active && showLoading) setInvestmentLoading(false);
      }
    };
    void refreshInvestments(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshInvestments(false);
      }
    }, 10_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [investmentRevision, investmentUserId, section]);

  useEffect(() => {
    if (!authLoading && user?.app_metadata?.role === "admin") {
      void loadAdminData();
    } else {
      setLoading(false);
    }
  }, [authLoading, loadAdminData, user]);

  const openProfile = async (userId: string) => {
    const listed = accounts.users.find((account) => account.id === userId);
    if (listed) {
      setProfileAccount(listed);
      return;
    }
    try {
      setProfileAccount(await adminRequest<AdminAccount>(`/users/${userId}`));
    } catch (requestError) {
      toast.error("Could not open this user's profile", {
        description:
          requestError instanceof Error ? requestError.message : undefined,
      });
    }
  };

  const deleteUser = async (account: AdminAccount) => {
    const label = account.email ?? account.fullName ?? account.id;
    if (
      !window.confirm(
        `Permanently delete ${label}?

This removes their sign-in, all transfer submissions, and all assigned investments. This cannot be undone.`,
      )
    )
      return false;
    setError("");
    setNotice("");
    setSaving(true);
    try {
      await adminRequest<void>(`/users/${account.id}`, { method: "DELETE" });
      toast.success("User deleted", { description: label });
      setNotice(`${label} was deleted.`);
      setProfileAccount(null);
      if (investmentUserId === account.id) setInvestmentUserId("");
      await loadAdminData();
      return true;
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not delete this user.";
      setError(message);
      toast.error("User not deleted", { description: message });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateMarketOverride = async (symbol: string) => {
    const draft = drafts[symbol] ?? { price: "", change: "" };
    const price = draft.price.trim() === "" ? null : Number(draft.price);
    const change = draft.change.trim() === "" ? null : Number(draft.change);
    if (
      (price !== null && (!Number.isFinite(price) || price <= 0)) ||
      (change !== null &&
        (!Number.isFinite(change) || change < -100 || change > 1000))
    ) {
      setError(
        "Enter a positive price and a 24h change between -100% and 1000%.",
      );
      return;
    }
    if (price === null && change === null) {
      setError("Set a price or a 24h change. Use Clear to remove an override.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await adminRequest<void>("/market-overrides", {
        method: "PUT",
        body: JSON.stringify({ symbol, price, change }),
      });
      setNotice(`${symbol} market override saved.`);
      await loadAdminData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save market override.",
      );
    } finally {
      setSaving(false);
    }
  };

  const clearMarketOverride = async (symbol: string) => {
    setSaving(true);
    setError("");
    try {
      await adminRequest<void>(`/market-overrides/${symbol}`, {
        method: "DELETE",
      });
      setNotice(`${symbol} now uses the selected market feed.`);
      await loadAdminData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not clear override.",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveArticle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!articleDraft) return;
    setSaving(true);
    setError("");
    try {
      const { id, publishedAt: _publishedAt, ...body } = articleDraft;
      await adminRequest<void>(id ? `/content/${id}` : "/content", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(body),
      });
      setArticleDraft(null);
      setNotice(articleDraft.published ? "Content published." : "Draft saved.");
      await loadAdminData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save content.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteArticle = async (article: Article) => {
    if (!window.confirm(`Delete “${article.title}”?`)) return;
    setSaving(true);
    setError("");
    try {
      await adminRequest<void>(`/content/${article.id}`, { method: "DELETE" });
      setNotice("Content deleted.");
      await loadAdminData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not delete content.",
      );
    } finally {
      setSaving(false);
    }
  };

  const updateSubscriber = async (
    subscriber: Subscriber,
    action: "disable" | "unsubscribe",
  ) => {
    const label =
      action === "unsubscribe"
        ? "unsubscribe this address"
        : "pause its price alerts";
    if (!window.confirm(`Are you sure you want to ${label}?`)) return;
    setSaving(true);
    setError("");
    try {
      await adminRequest<void>(`/alerts/${subscriber.id}`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setNotice(
        action === "unsubscribe"
          ? "Subscriber unsubscribed."
          : "Price alerts paused.",
      );
      await loadAdminData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not update subscriber.",
      );
    } finally {
      setSaving(false);
    }
  };

  const hasPendingDeposits = deposits.some(
    (deposit) => deposit.status === "pending",
  );
  useEffect(() => {
    if (section !== "deposits" || !hasPendingDeposits) return;
    const controller = new AbortController();
    const fromBinance = async () => {
      const symbols = encodeURIComponent(
        JSON.stringify(["BTCUSDT", "ETHUSDT", "SOLUSDT"]),
      );
      const response = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbols=${symbols}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("Binance prices unavailable");
      const tickers = (await response.json()) as {
        symbol: string;
        price: string;
      }[];
      return Object.fromEntries(
        tickers.map((ticker) => [
          ticker.symbol.replace(/USDT$/, ""),
          Number(ticker.price),
        ]),
      );
    };
    // Binance is unavailable in some regions; CoinGecko is the fallback.
    const fromCoinGecko = async () => {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd",
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("CoinGecko prices unavailable");
      const prices = (await response.json()) as Record<string, { usd: number }>;
      return {
        BTC: prices.bitcoin?.usd,
        ETH: prices.ethereum?.usd,
        SOL: prices.solana?.usd,
      };
    };
    void fromBinance()
      .catch(fromCoinGecko)
      .then((prices) => {
        const next: Record<string, number> = { USDT: 1 };
        for (const [symbol, price] of Object.entries(prices)) {
          if (Number(price) > 0) next[symbol] = Number(price);
        }
        setUsdPrices(next);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [hasPendingDeposits, section]);

  const estimatedCreditUsd = (deposit: Deposit) => {
    const price = usdPrices[deposit.symbol];
    return price ? (Number(deposit.amount) * price).toFixed(2) : "";
  };
  const creditUsdFor = (deposit: Deposit) =>
    creditDrafts[deposit.id] ?? estimatedCreditUsd(deposit);

  const reviewDeposit = async (
    deposit: Deposit,
    status: "confirmed" | "rejected",
  ) => {
    const note = reviewNotes[deposit.id]?.trim() ?? "";
    const creditUsd = creditUsdFor(deposit).trim();
    if (
      status === "confirmed" &&
      (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(creditUsd) ||
        Number(creditUsd) <= 0)
    ) {
      setError(
        "Enter the USD amount to add to the user's investment (up to two decimal places).",
      );
      return;
    }
    if (status === "confirmed" && !verifiedDeposits.has(deposit.id)) {
      setError(
        "Confirm only after you verify this transaction on the correct network explorer.",
      );
      return;
    }
    if (status === "rejected" && !note) {
      setError("Add a review note explaining why this transfer was rejected.");
      return;
    }
    const action =
      status === "confirmed"
        ? `confirm this transfer and add ${Number(creditUsd).toLocaleString("en-US", { style: "currency", currency: "USD" })} to the user's ${deposit.symbol} investment`
        : "reject this transfer submission";
    if (!window.confirm(`Are you sure you want to ${action}?`)) return;
    setSaving(true);
    setError("");
    try {
      await adminRequest<void>(`/deposits/${deposit.id}/review`, {
        method: "POST",
        body: JSON.stringify({
          status,
          note,
          verifiedOnExplorer: verifiedDeposits.has(deposit.id),
          ...(status === "confirmed" ? { creditUsd } : {}),
        }),
      });
      setNotice(
        status === "confirmed"
          ? "Transfer verified and confirmed."
          : "Transfer submission rejected.",
      );
      toast.success(
        status === "confirmed" ? "Transfer confirmed" : "Transfer rejected",
        {
          description:
            status === "confirmed"
              ? `${Number(creditUsd).toLocaleString("en-US", { style: "currency", currency: "USD" })} added to the user's ${deposit.symbol} investment`
              : `${deposit.amount} ${deposit.symbol} · User can see your review note`,
        },
      );
      setVerifiedDeposits((current) => {
        const next = new Set(current);
        next.delete(deposit.id);
        return next;
      });
      await loadAdminData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not review transfer.",
      );
    } finally {
      setSaving(false);
    }
  };

  const saveManagedInvestment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!investmentUserId) return;
    setError("");
    setNotice("");
    const movementIntervalSeconds = intervalToSeconds(
      investmentDraft.movementEvery,
      investmentDraft.movementUnit,
    );
    if (!movementIntervalSeconds) {
      setError(INTERVAL_ERROR);
      return;
    }
    setSaving(true);
    try {
      await adminRequest<void>("/investments", {
        method: "PUT",
        body: JSON.stringify({
          userId: investmentUserId,
          symbol: investmentDraft.symbol,
          investedUsd: investmentDraft.investedUsd.trim(),
          returnUsd: investmentDraft.returnUsd.trim(),
          movementDirection: investmentDraft.movementDirection,
          movementAmount: investmentDraft.movementAmount.trim(),
          movementIntervalSeconds,
        }),
      });
      setNotice(`${investmentDraft.symbol} investment record saved.`);
      toast.success(`${investmentDraft.symbol} investment saved`);
      setInvestmentDraft(emptyInvestmentDraft);
      setInvestmentRevision((revision) => revision + 1);
      await loadAdminData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not save the investment record.",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteManagedInvestment = async (investment: ManagedInvestment) => {
    if (
      !window.confirm(
        `Remove the ${investment.symbol} investment record from this user's account?`,
      )
    )
      return;
    setError("");
    setNotice("");
    setSaving(true);
    try {
      await adminRequest<void>(`/investments/${investment.id}`, {
        method: "DELETE",
      });
      setNotice(`${investment.symbol} investment record removed.`);
      setInvestmentRevision((revision) => revision + 1);
      await loadAdminData();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not remove the investment record.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || (loading && user?.app_metadata?.role === "admin")) {
    return (
      <main className="admin-access">
        <div className="admin-loading" role="status">
          <LoaderCircle className="admin-spinner" size={22} /> Loading admin
          workspace…
        </div>
      </main>
    );
  }
  if (!user) {
    return (
      <AdminAccessMessage title="Sign in required">
        Sign in with your Northstar account, then return to the admin workspace.
      </AdminAccessMessage>
    );
  }
  if (user.app_metadata?.role !== "admin") {
    return (
      <AdminAccessMessage title="Admin access required">
        Your account is not assigned the admin role. Admin permissions are
        managed securely in Supabase.
      </AdminAccessMessage>
    );
  }

  const tabs: { id: Section; label: string; icon: typeof Activity }[] = [
    { id: "market", label: "Market data", icon: Activity },
    { id: "content", label: "Content", icon: BookOpen },
    { id: "alerts", label: "Email alerts", icon: Users },
    { id: "deposits", label: "Token transfers", icon: ArrowDownToLine },
    { id: "investments", label: "Investments", icon: Coins },
    { id: "users", label: "User profiles", icon: Users },
  ];

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <Link className="admin-brand" to="/">
          <span className="admin-brand-mark">N</span>
          <span>
            Northstar <small>ADMIN</small>
          </span>
        </Link>
        <div className="admin-user">
          <span>{user.email}</span>
          <button
            className="button button-subtle"
            onClick={async () => {
              const result = await signOut();
              if (result.error) setError(result.error);
              else navigate("/");
            }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div>
            <span className="eyebrow">WORKSPACE</span>
            <nav aria-label="Admin sections">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={
                    section === id ? "admin-nav-item active" : "admin-nav-item"
                  }
                  onClick={() => setSection(id)}
                >
                  <Icon size={16} /> {label}
                </button>
              ))}
            </nav>
          </div>
          <Link className="admin-back-link" to="/">
            <ArrowLeft size={15} /> Back to application
          </Link>
        </aside>
        <section className="admin-content">
          <div className="admin-heading">
            <div>
              <span className="eyebrow">NORTHSTAR CONTROL ROOM</span>
              <h1>{tabs.find((tab) => tab.id === section)?.label}</h1>
              <p>
                {section === "market" &&
                  "Manage price and 24-hour change overrides shown across the market dashboard."}
                {section === "content" &&
                  "Write, publish, and remove stories shown in the market dashboard."}
                {section === "alerts" &&
                  "Review email subscribers and manage their alert delivery preferences."}
                {section === "deposits" &&
                  "Review user-submitted token transfers, verify each transaction on-chain, and record a decision."}
                {section === "investments" &&
                  "Select a user, set a starting balance, and choose upward, downward, or continuous chart movement."}
                {section === "users" &&
                  "View registered account profiles, activity, transfer counts, and total invested principal."}
              </p>
            </div>
            <div className="admin-heading-actions">
              <button
                className="button button-subtle"
                disabled={loading || investmentRefreshLoading}
                onClick={() => void refreshAdminData()}
              >
                {loading || investmentRefreshLoading ? (
                  <LoaderCircle className="admin-spinner" size={14} />
                ) : (
                  <RefreshCw size={14} />
                )}
                Refresh
              </button>
              {section === "content" && (
                <button
                  className="button button-primary"
                  onClick={() =>
                    setArticleDraft({
                      title: "",
                      summary: "",
                      category: "MARKET INSIGHT",
                      readMinutes: 4,
                      published: false,
                    })
                  }
                >
                  <Plus size={15} /> New story
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="admin-message error" role="alert">
              <CircleAlert size={16} /> {error}
            </div>
          )}
          {notice && (
            <div className="admin-message success" role="status">
              <Check size={16} /> {notice}
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss message"
              >
                ×
              </button>
            </div>
          )}
          {loading ? (
            <div className="admin-panel-loading">
              <LoaderCircle className="admin-spinner" size={20} /> Refreshing
              records…
            </div>
          ) : (
            <>
              {section === "market" && (
                <div className="panel admin-panel">
                  <div className="admin-panel-heading">
                    <div>
                      <h2>Asset overrides</h2>
                      <p>
                        Leave a field blank to keep that value from the selected
                        feed.
                      </p>
                    </div>
                    <span className="admin-count">{market.length} active</span>
                  </div>
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Asset</th>
                          <th>Price override (USD)</th>
                          <th>24h change (%)</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ASSETS.map((symbol) => {
                          const override = market.find(
                            (item) => item.symbol === symbol,
                          );
                          const draft = drafts[symbol] ?? {
                            price: "",
                            change: "",
                          };
                          return (
                            <tr key={symbol}>
                              <td>
                                <b>{symbol}</b>
                                <small>
                                  {override ? "Override active" : "Feed value"}
                                </small>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={draft.price}
                                  onChange={(event) =>
                                    setDrafts((state) => ({
                                      ...state,
                                      [symbol]: {
                                        ...draft,
                                        price: event.target.value,
                                      },
                                    }))
                                  }
                                  aria-label={`${symbol} price override`}
                                  placeholder="Use feed"
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="-100"
                                  max="1000"
                                  step="0.01"
                                  value={draft.change}
                                  onChange={(event) =>
                                    setDrafts((state) => ({
                                      ...state,
                                      [symbol]: {
                                        ...draft,
                                        change: event.target.value,
                                      },
                                    }))
                                  }
                                  aria-label={`${symbol} 24 hour change override`}
                                  placeholder="Use feed"
                                />
                              </td>
                              <td className="admin-row-actions">
                                <button
                                  className="button button-primary button-small"
                                  disabled={saving}
                                  onClick={() =>
                                    void updateMarketOverride(symbol)
                                  }
                                >
                                  <Save size={13} /> Save
                                </button>
                                {override && (
                                  <button
                                    className="button button-subtle button-small"
                                    disabled={saving}
                                    onClick={() =>
                                      void clearMarketOverride(symbol)
                                    }
                                  >
                                    <Trash2 size={13} /> Clear
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="admin-footnote">
                    Overrides apply to everyone and are shown in place of the
                    live or simulated feed until cleared.
                  </p>
                </div>
              )}
              {section === "content" && (
                <div className="admin-content-list">
                  {articleDraft && (
                    <form
                      className="panel admin-panel admin-article-form"
                      onSubmit={(event) => void saveArticle(event)}
                    >
                      <div className="admin-panel-heading">
                        <div>
                          <h2>
                            {articleDraft.id ? "Edit story" : "Create a story"}
                          </h2>
                          <p>
                            Published stories appear on the overview and asset
                            pages.
                          </p>
                        </div>
                      </div>
                      <label>
                        Title
                        <input
                          required
                          maxLength={160}
                          value={articleDraft.title}
                          onChange={(event) =>
                            setArticleDraft({
                              ...articleDraft,
                              title: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Summary
                        <textarea
                          required
                          maxLength={500}
                          rows={3}
                          value={articleDraft.summary}
                          onChange={(event) =>
                            setArticleDraft({
                              ...articleDraft,
                              summary: event.target.value,
                            })
                          }
                        />
                      </label>
                      <div className="admin-form-grid">
                        <label>
                          Category
                          <input
                            required
                            maxLength={60}
                            value={articleDraft.category}
                            onChange={(event) =>
                              setArticleDraft({
                                ...articleDraft,
                                category: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Read time (minutes)
                          <input
                            type="number"
                            min="1"
                            max="60"
                            required
                            value={articleDraft.readMinutes}
                            onChange={(event) =>
                              setArticleDraft({
                                ...articleDraft,
                                readMinutes: Number(event.target.value),
                              })
                            }
                          />
                        </label>
                      </div>
                      <label className="admin-publish-toggle">
                        <input
                          type="checkbox"
                          checked={articleDraft.published}
                          onChange={(event) =>
                            setArticleDraft({
                              ...articleDraft,
                              published: event.target.checked,
                            })
                          }
                        />{" "}
                        Publish this story
                      </label>
                      <div className="admin-form-actions">
                        <button
                          className="button button-primary"
                          disabled={saving}
                          type="submit"
                        >
                          <Save size={14} /> Save story
                        </button>
                        <button
                          className="button button-subtle"
                          type="button"
                          onClick={() => setArticleDraft(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                  {articles.length === 0 ? (
                    <div className="panel admin-empty">
                      No stories yet. Create one to replace the sample editorial
                      content.
                    </div>
                  ) : (
                    articles.map((article) => (
                      <article
                        className="panel admin-article-card"
                        key={article.id}
                      >
                        <div className="admin-article-copy">
                          <div className="admin-article-meta">
                            <span>{article.category}</span>
                            <i className={article.published ? "published" : ""}>
                              {article.published ? "Published" : "Draft"}
                            </i>
                          </div>
                          <h2>{article.title}</h2>
                          <p>{article.summary}</p>
                          <small>
                            {article.readMinutes} min read
                            {article.publishedAt
                              ? ` · Published ${new Date(article.publishedAt).toLocaleDateString()}`
                              : ""}
                          </small>
                        </div>
                        <div className="admin-row-actions">
                          <button
                            className="button button-subtle button-small"
                            onClick={() => setArticleDraft(article)}
                          >
                            Edit
                          </button>
                          <button
                            className="button button-subtle button-small danger"
                            disabled={saving}
                            onClick={() => void deleteArticle(article)}
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              )}
              {section === "alerts" && (
                <div className="panel admin-panel">
                  <div className="admin-panel-heading">
                    <div>
                      <h2>Email subscribers</h2>
                      <p>
                        Only verified subscriber records are shown. Unsubscribe
                        stops all email delivery.
                      </p>
                    </div>
                    <span className="admin-count">
                      {subscribers.length} recent
                    </span>
                  </div>
                  {subscribers.length === 0 ? (
                    <div className="admin-empty">
                      No email subscribers are registered.
                    </div>
                  ) : (
                    <div className="admin-table-wrap">
                      <table className="admin-table">
                        <thead>
                          <tr>
                            <th>Email</th>
                            <th>Status</th>
                            <th>Subscriptions</th>
                            <th>Price rules</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {subscribers.map((subscriber) => (
                            <tr key={subscriber.id}>
                              <td>
                                <b>{subscriber.email}</b>
                                <small>
                                  Since{" "}
                                  {new Date(
                                    subscriber.createdAt,
                                  ).toLocaleDateString()}
                                </small>
                              </td>
                              <td>
                                <span
                                  className={`admin-status ${subscriber.status}`}
                                >
                                  {subscriber.status}
                                </span>
                              </td>
                              <td>
                                {[
                                  subscriber.priceAlerts && "Price alerts",
                                  subscriber.weeklyBrief && "Weekly brief",
                                ]
                                  .filter(Boolean)
                                  .join(", ") || "None"}
                              </td>
                              <td>{subscriber.ruleCount}</td>
                              <td className="admin-row-actions">
                                {subscriber.status === "active" && (
                                  <>
                                    <button
                                      className="button button-subtle button-small"
                                      disabled={
                                        saving || !subscriber.priceAlerts
                                      }
                                      onClick={() =>
                                        void updateSubscriber(
                                          subscriber,
                                          "disable",
                                        )
                                      }
                                    >
                                      Pause alerts
                                    </button>
                                    <button
                                      className="button button-subtle button-small danger"
                                      disabled={saving}
                                      onClick={() =>
                                        void updateSubscriber(
                                          subscriber,
                                          "unsubscribe",
                                        )
                                      }
                                    >
                                      Unsubscribe
                                    </button>
                                  </>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <p className="admin-footnote">
                    Showing up to 200 most recent subscribers. Contact details
                    are only available to admins.
                  </p>
                </div>
              )}
              {section === "deposits" && (
                <div className="panel admin-panel">
                  <div className="admin-panel-heading">
                    <div>
                      <h2>Token transfer submissions</h2>
                      <p>
                        A submission is user-reported, not proof of payment.
                        Verify the hash, recipient, asset, amount, and network
                        on-chain before confirming.
                      </p>
                      <span className="admin-live-refresh">
                        <i /> Updates automatically every 15 seconds
                      </span>
                    </div>
                    <select
                      className="admin-filter-select"
                      value={depositFilter}
                      aria-label="Filter transfers by status"
                      onChange={(event) => {
                        setDepositFilter(
                          event.target.value as typeof depositFilter,
                        );
                        setDepositsPage(1);
                      }}
                    >
                      <option value="all">All statuses</option>
                      <option value="pending">Pending verification</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  {deposits.length === 0 ? (
                    <div className="admin-empty">
                      No transfers match this status.
                    </div>
                  ) : (
                    <div className="admin-deposit-list">
                      {deposits.map((deposit) => (
                        <article
                          className="admin-deposit-card"
                          key={deposit.id}
                        >
                          <div className="admin-deposit-heading">
                            <div>
                              <span className="eyebrow">
                                {deposit.symbol} · {deposit.network}
                              </span>
                              <h3>
                                {deposit.amount} {deposit.symbol}
                              </h3>
                            </div>
                            <span className={`admin-status ${deposit.status}`}>
                              {deposit.status === "pending"
                                ? "Pending verification"
                                : deposit.status}
                            </span>
                          </div>
                          <div className="admin-deposit-profile">
                            <button
                              type="button"
                              className="admin-user-profile-link"
                              onClick={() => void openProfile(deposit.user.id)}
                            >
                              {deposit.user.fullName || "Northstar user"}
                            </button>
                            <span>
                              {deposit.user.email ?? "Email unavailable"}
                            </span>
                            <code>User ID: {deposit.user.id}</code>
                          </div>
                          <dl className="admin-deposit-details">
                            <div>
                              <dt>Transaction hash</dt>
                              <dd>
                                <a
                                  href={explorerUrl(
                                    deposit.symbol,
                                    deposit.transactionHash,
                                  )}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  <code>{deposit.transactionHash}</code>
                                  <ArrowUpRight size={13} />
                                </a>
                              </dd>
                            </div>
                            <div>
                              <dt>Destination address</dt>
                              <dd>
                                <code>{deposit.recipientAddress}</code>
                              </dd>
                            </div>
                            <div>
                              <dt>Sender address</dt>
                              <dd>
                                <code>
                                  {deposit.senderAddress || "Not provided"}
                                </code>
                              </dd>
                            </div>
                            <div>
                              <dt>Submitted</dt>
                              <dd>
                                {new Date(deposit.submittedAt).toLocaleString()}
                              </dd>
                            </div>
                          </dl>
                          {deposit.status === "pending" ? (
                            <div className="admin-deposit-review">
                              <label className="admin-publish-toggle">
                                <input
                                  type="checkbox"
                                  checked={verifiedDeposits.has(deposit.id)}
                                  onChange={(event) =>
                                    setVerifiedDeposits((current) => {
                                      const next = new Set(current);
                                      if (event.target.checked)
                                        next.add(deposit.id);
                                      else next.delete(deposit.id);
                                      return next;
                                    })
                                  }
                                />
                                I verified on the network explorer that the
                                transaction succeeded and matches the asset,
                                amount, and destination.
                              </label>
                              <label className="admin-review-note">
                                Add to {deposit.symbol} investment (USD)
                                <input
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  inputMode="decimal"
                                  value={creditUsdFor(deposit)}
                                  onChange={(event) =>
                                    setCreditDrafts((current) => ({
                                      ...current,
                                      [deposit.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="USD value of this transfer"
                                />
                                <small>
                                  {deposit.symbol === "USDT"
                                    ? "USDT is credited at $1.00 per token."
                                    : usdPrices[deposit.symbol]
                                      ? `Estimated at ${usdPrices[deposit.symbol].toLocaleString("en-US", { style: "currency", currency: "USD" })} per ${deposit.symbol} (current price). Adjust if needed.`
                                      : `Current ${deposit.symbol} price unavailable. Enter the USD value.`}
                                </small>
                              </label>
                              <label className="admin-review-note">
                                Review note
                                <textarea
                                  maxLength={500}
                                  rows={2}
                                  value={reviewNotes[deposit.id] ?? ""}
                                  onChange={(event) =>
                                    setReviewNotes((current) => ({
                                      ...current,
                                      [deposit.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Optional for confirmation; required to reject."
                                />
                              </label>
                              <div className="admin-row-actions">
                                <button
                                  className="button button-primary button-small"
                                  disabled={
                                    saving || !verifiedDeposits.has(deposit.id)
                                  }
                                  onClick={() =>
                                    void reviewDeposit(deposit, "confirmed")
                                  }
                                >
                                  <Check size={13} /> Confirm verified transfer
                                </button>
                                <button
                                  className="button button-subtle button-small danger"
                                  disabled={saving}
                                  onClick={() =>
                                    void reviewDeposit(deposit, "rejected")
                                  }
                                >
                                  Reject submission
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="admin-deposit-reviewed">
                              <span>
                                Reviewed by {deposit.reviewedBy ?? "admin"} ·{" "}
                                {deposit.reviewedAt
                                  ? new Date(
                                      deposit.reviewedAt,
                                    ).toLocaleString()
                                  : "time unavailable"}
                              </span>
                              {deposit.reviewNote && (
                                <p>Note: {deposit.reviewNote}</p>
                              )}
                            </div>
                          )}
                          {deposit.reviewHistory.length > 0 && (
                            <details className="admin-review-history">
                              <summary>
                                Review history ({deposit.reviewHistory.length})
                              </summary>
                              {deposit.reviewHistory.map((event, index) => (
                                <p key={`${event.reviewedAt}-${index}`}>
                                  {event.status} by{" "}
                                  {event.reviewedBy ?? "admin"} ·{" "}
                                  {new Date(event.reviewedAt).toLocaleString()}
                                  {event.note ? ` — ${event.note}` : ""}
                                </p>
                              ))}
                            </details>
                          )}
                        </article>
                      ))}
                    </div>
                  )}
                  {depositsTotal > 0 && (
                    <div className="admin-pagination">
                      <span>
                        {depositsTotal} matching submissions · page{" "}
                        {depositsPage} of{" "}
                        {Math.max(1, Math.ceil(depositsTotal / 50))}
                      </span>
                      <div>
                        <button
                          className="button button-subtle button-small"
                          disabled={depositsPage <= 1 || saving}
                          onClick={() => setDepositsPage((page) => page - 1)}
                        >
                          <ChevronLeft size={14} /> Previous
                        </button>
                        <button
                          className="button button-subtle button-small"
                          disabled={
                            depositsPage >= Math.ceil(depositsTotal / 50) ||
                            saving
                          }
                          onClick={() => setDepositsPage((page) => page + 1)}
                        >
                          Next <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="admin-footnote">
                    Transfers are listed newest first. Statuses are manually
                    reviewed; the app does not monitor blockchains or credit
                    user balances.
                  </p>
                </div>
              )}
              {section === "investments" && (
                <div className="panel admin-panel">
                  <div className="admin-panel-heading">
                    <div>
                      <h2>Manage account investments</h2>
                      <p>
                        Values are manually assigned in USD and are separate
                        from submitted transfer records. Set a direction and
                        movement amount to animate the assigned value.
                      </p>
                      {accounts.users.find(
                        (account) => account.id === investmentUserId,
                      ) && (
                        <p className="admin-selected-investment-user">
                          Managing{" "}
                          <button
                            type="button"
                            className="admin-user-profile-link"
                            onClick={() => void openProfile(investmentUserId)}
                          >
                            {accounts.users.find(
                              (account) => account.id === investmentUserId,
                            )?.fullName ??
                              accounts.users.find(
                                (account) => account.id === investmentUserId,
                              )?.email}
                          </button>
                        </p>
                      )}
                    </div>
                    <span className="admin-count">
                      {accounts.total} registered users
                    </span>
                  </div>
                  <div className="admin-investment-user-picker">
                    <label>
                      User account
                      <select
                        value={investmentUserId}
                        onChange={(event) => {
                          setInvestmentUserId(event.target.value);
                          setInvestmentDraft(emptyInvestmentDraft);
                        }}
                      >
                        {accounts.users.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.fullName || account.email || account.id}
                            {account.email && account.fullName
                              ? ` · ${account.email}`
                              : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="admin-investment-user-page">
                      <span>
                        User page {accounts.page} of {accounts.lastPage ?? 1}
                      </span>
                      <button
                        className="button button-subtle button-small"
                        disabled={usersPage <= 1 || saving}
                        onClick={() => setUsersPage((page) => page - 1)}
                      >
                        <ChevronLeft size={14} /> Previous users
                      </button>
                      <button
                        className="button button-subtle button-small"
                        disabled={
                          usersPage >= (accounts.lastPage ?? 1) || saving
                        }
                        onClick={() => setUsersPage((page) => page + 1)}
                      >
                        Next users <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                  {!investmentUserId ? (
                    <div className="admin-empty">
                      No user accounts are available on this page.
                    </div>
                  ) : (
                    <>
                      <form
                        className="admin-managed-investment-form"
                        onSubmit={(event) => void saveManagedInvestment(event)}
                      >
                        <label>
                          Asset
                          <select
                            value={investmentDraft.symbol}
                            onChange={(event) =>
                              setInvestmentDraft((draft) => ({
                                ...draft,
                                symbol: event.target
                                  .value as ManagedInvestment["symbol"],
                              }))
                            }
                          >
                            {(["USDT", "BTC", "ETH", "SOL"] as const).map(
                              (symbol) => (
                                <option key={symbol} value={symbol}>
                                  {symbol}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label>
                          Invested amount (USD)
                          <input
                            required
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={investmentDraft.investedUsd}
                            onChange={(event) =>
                              setInvestmentDraft((draft) => ({
                                ...draft,
                                investedUsd: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          Return (USD)
                          <input
                            required
                            type="number"
                            min={-Number(investmentDraft.investedUsd || 0)}
                            step="0.01"
                            value={investmentDraft.returnUsd}
                            onChange={(event) =>
                              setInvestmentDraft((draft) => ({
                                ...draft,
                                returnUsd: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          Chart direction
                          <select
                            value={investmentDraft.movementDirection}
                            onChange={(event) =>
                              setInvestmentDraft((draft) => ({
                                ...draft,
                                movementDirection: event.target
                                  .value as ManagedInvestment["movementDirection"],
                              }))
                            }
                          >
                            <option value="paused">Paused</option>
                            <option value="up">Move up</option>
                            <option value="down">Move down</option>
                            <option value="continuous">
                              Continuous (fluctuates)
                            </option>
                          </select>
                        </label>
                        <label>
                          Movement amount (USD)
                          <input
                            required
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={investmentDraft.movementAmount}
                            onChange={(event) =>
                              setInvestmentDraft((draft) => ({
                                ...draft,
                                movementAmount: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label>
                          Move every
                          <span className="admin-interval-input">
                            <input
                              required
                              type="number"
                              min="1"
                              max={
                                investmentDraft.movementUnit === "hours"
                                  ? 24
                                  : 1440
                              }
                              step="1"
                              value={investmentDraft.movementEvery}
                              onChange={(event) =>
                                setInvestmentDraft((draft) => ({
                                  ...draft,
                                  movementEvery: event.target.value,
                                }))
                              }
                            />
                            <select
                              aria-label="Interval unit"
                              value={investmentDraft.movementUnit}
                              onChange={(event) =>
                                setInvestmentDraft((draft) => ({
                                  ...draft,
                                  movementUnit: event.target
                                    .value as IntervalUnit,
                                }))
                              }
                            >
                              <option value="minutes">Minutes</option>
                              <option value="hours">Hours</option>
                            </select>
                          </span>
                        </label>
                        <button
                          className="button button-primary"
                          disabled={saving}
                          type="submit"
                        >
                          {saving ? (
                            <LoaderCircle className="admin-spinner" size={14} />
                          ) : (
                            <Save size={14} />
                          )}
                          Save investment
                        </button>
                      </form>
                      <p className="admin-footnote">
                        Saving an asset updates that user's existing record.
                        Return may be negative but cannot reduce the assigned
                        value below zero. Up and down move the configured
                        amount once per interval (1 minute to 24 hours);
                        continuous movement fluctuates up or down by that
                        amount.
                      </p>
                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <thead>
                            <tr>
                              <th>Asset</th>
                              <th>Invested (USD)</th>
                              <th>Return (USD)</th>
                              <th>Assigned value (USD)</th>
                              <th>Chart movement</th>
                              <th>Balance history</th>
                              <th>Last updated</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {managedInvestments.map((investment) => (
                              <tr key={investment.id}>
                                <td>
                                  <b>{investment.symbol}</b>
                                </td>
                                <td>
                                  {Number(
                                    investment.investedUsd,
                                  ).toLocaleString("en-US", {
                                    style: "currency",
                                    currency: "USD",
                                  })}
                                </td>
                                <td>
                                  {Number(investment.returnUsd).toLocaleString(
                                    "en-US",
                                    { style: "currency", currency: "USD" },
                                  )}
                                </td>
                                <td>
                                  {(
                                    Number(investment.investedUsd) +
                                    Number(investment.returnUsd)
                                  ).toLocaleString("en-US", {
                                    style: "currency",
                                    currency: "USD",
                                  })}
                                </td>
                                <td>
                                  {describeMovement(investment)}
                                </td>
                                <td>
                                  <InvestmentHistoryChart
                                    history={investment.history}
                                    currentUsd={String(
                                      Number(investment.investedUsd) +
                                        Number(investment.returnUsd),
                                    )}
                                  />
                                </td>
                                <td>
                                  {new Date(
                                    investment.updatedAt,
                                  ).toLocaleString()}
                                </td>
                                <td className="admin-row-actions">
                                  <button
                                    className="button button-subtle button-small"
                                    disabled={saving}
                                    onClick={() =>
                                      setInvestmentDraft({
                                        symbol: investment.symbol,
                                        investedUsd: investment.investedUsd,
                                        returnUsd: investment.returnUsd,
                                        movementDirection:
                                          investment.movementDirection,
                                        movementAmount:
                                          investment.movementAmount,
                                        movementEvery: secondsToInterval(
                                          investment.movementIntervalSeconds,
                                        ).value,
                                        movementUnit: secondsToInterval(
                                          investment.movementIntervalSeconds,
                                        ).unit,
                                      })
                                    }
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="button button-subtle button-small danger"
                                    disabled={saving}
                                    onClick={() =>
                                      void deleteManagedInvestment(investment)
                                    }
                                  >
                                    <Trash2 size={13} /> Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {!investmentLoading &&
                              managedInvestments.length === 0 && (
                                <tr>
                                  <td colSpan={8}>
                                    No investments assigned to this user yet.
                                  </td>
                                </tr>
                              )}
                          </tbody>
                        </table>
                      </div>
                      {investmentLoading && (
                        <div className="admin-panel-loading">
                          <LoaderCircle className="admin-spinner" size={18} />
                          Loading investment records…
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {section === "users" && (
                <div className="panel admin-panel">
                  <div className="admin-panel-heading">
                    <div>
                      <h2>Registered users</h2>
                      <p>
                        Account details come from Supabase Auth. Invested
                        amounts are the total assigned investment principal.
                        Only admins can access this directory.
                      </p>
                    </div>
                    <span className="admin-count">
                      {accounts.total} total users
                    </span>
                  </div>
                  {accounts.users.length === 0 ? (
                    <div className="admin-empty">
                      No registered user profiles found.
                    </div>
                  ) : (
                    <div className="admin-table-wrap">
                      <table className="admin-table admin-users-table">
                        <thead>
                          <tr>
                            <th>Profile</th>
                            <th>Account status</th>
                            <th>Role</th>
                            <th>Transfers</th>
                            <th>Invested (USD)</th>
                            <th>Joined</th>
                            <th>Last sign-in</th>
                            <th>User ID</th>
                            <th>Manage</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accounts.users.map((account) => (
                            <tr key={account.id}>
                              <td>
                                <button
                                  type="button"
                                  className="admin-user-profile-link"
                                  onClick={() => setProfileAccount(account)}
                                >
                                  {account.fullName || "Northstar user"}
                                </button>
                                <small>{account.email ?? "No email"}</small>
                                {account.phone && (
                                  <small>{account.phone}</small>
                                )}
                              </td>
                              <td>
                                <span
                                  className={`admin-status ${account.emailConfirmedAt ? "active" : "pending"}`}
                                >
                                  {account.emailConfirmedAt
                                    ? "Email verified"
                                    : "Unverified"}
                                </span>
                              </td>
                              <td>{account.role}</td>
                              <td>{account.depositCount}</td>
                              <td>
                                {Number(account.investedUsd).toLocaleString(
                                  "en-US",
                                  {
                                    style: "currency",
                                    currency: "USD",
                                  },
                                )}
                              </td>
                              <td>
                                {new Date(
                                  account.createdAt,
                                ).toLocaleDateString()}
                              </td>
                              <td>
                                {account.lastSignInAt
                                  ? new Date(
                                      account.lastSignInAt,
                                    ).toLocaleString()
                                  : "Never"}
                              </td>
                              <td>
                                <code>{account.id}</code>
                              </td>
                              <td className="admin-row-actions">
                                <button
                                  type="button"
                                  className="button button-subtle button-small"
                                  onClick={() => setProfileAccount(account)}
                                >
                                  View profile
                                </button>
                                {account.role !== "admin" &&
                                  account.id !== user?.id && (
                                    <button
                                      type="button"
                                      className="button button-subtle button-small danger"
                                      disabled={saving}
                                      onClick={() => void deleteUser(account)}
                                    >
                                      <Trash2 size={13} /> Delete
                                    </button>
                                  )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="admin-pagination">
                    <span>
                      Page {accounts.page} of {accounts.lastPage ?? 1}
                    </span>
                    <div>
                      <button
                        className="button button-subtle button-small"
                        disabled={usersPage <= 1 || saving}
                        onClick={() => setUsersPage((page) => page - 1)}
                      >
                        <ChevronLeft size={14} /> Previous
                      </button>
                      <button
                        className="button button-subtle button-small"
                        disabled={
                          usersPage >= (accounts.lastPage ?? 1) || saving
                        }
                        onClick={() => setUsersPage((page) => page + 1)}
                      >
                        Next <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
      <AdminUserProfile
        account={profileAccount}
        request={adminRequest}
        onClose={() => setProfileAccount(null)}
        onDelete={
          profileAccount &&
          profileAccount.role !== "admin" &&
          profileAccount.id !== user?.id
            ? deleteUser
            : undefined
        }
        onChanged={() => setInvestmentRevision((revision) => revision + 1)}
        onReviewTransfers={() => {
          setProfileAccount(null);
          setDepositFilter("pending");
          setSection("deposits");
        }}
        onManageInvestments={(account) => {
          setProfileAccount(null);
          setInvestmentUserId(account.id);
          setInvestmentDraft(emptyInvestmentDraft);
          setSection("investments");
        }}
      />
    </main>
  );
}
