import "./global.css";

import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "@/lib/auth";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
const Admin = lazy(() => import("./pages/Admin"));
const SendFunds = lazy(() => import("./pages/SendFunds"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/markets" element={<Index />} />
            <Route path="/portfolio" element={<Index />} />
            <Route path="/alerts" element={<Index />} />
            <Route path="/screener" element={<Index />} />
            <Route path="/account" element={<Index />} />
            <Route path="/assets/:symbol" element={<Index />} />
            <Route
              path="/send"
              element={
                <Suspense fallback={<div role="status">Loading transfer addresses…</div>}>
                  <SendFunds />
                </Suspense>
              }
            />
            <Route
              path="/admin"
              element={
                <Suspense fallback={<div role="status">Loading admin workspace…</div>}>
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

createRoot(document.getElementById("root")!).render(<App />);
