import "./global.css";
import "./i18n";

import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "@/lib/auth";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
const Admin = lazy(() => import("./pages/Admin"));
const SendFunds = lazy(() => import("./pages/SendFunds"));
const Withdraw = lazy(() => import("./pages/Withdraw"));

const queryClient = new QueryClient();

function RouteFallback({ label }: { label: "loadingTransfers" | "loadingWithdrawals" | "loadingAdmin" }) {
  const { t } = useTranslation();
  return <div role="status">{t(`app.${label}`)}</div>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/dashboard" element={<Index />} />
            <Route path="/markets" element={<Index />} />
            <Route path="/portfolio" element={<Index />} />
            <Route path="/alerts" element={<Index />} />
            <Route path="/screener" element={<Index />} />
            <Route path="/account" element={<Index />} />
            <Route path="/assets/:symbol" element={<Index />} />
            <Route
              path="/send"
              element={
                <Suspense fallback={<RouteFallback label="loadingTransfers" />}>
                  <SendFunds />
                </Suspense>
              }
            />
            <Route
              path="/withdraw"
              element={
                <Suspense fallback={<RouteFallback label="loadingWithdrawals" />}>
                  <Withdraw />
                </Suspense>
              }
            />
            <Route
              path="/admin"
              element={
                <Suspense fallback={<RouteFallback label="loadingAdmin" />}>
                  <Admin />
                </Suspense>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

// The outer Suspense covers the first load of a non-English dictionary.
createRoot(document.getElementById("root")!).render(
  <Suspense fallback={null}>
    <App />
  </Suspense>,
);
