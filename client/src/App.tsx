import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import { getGoogleLoginUrl } from "./const";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Holdings from "./pages/Portfolio";
import Contact from "./pages/Contact";
import Portfolios from "./pages/Portfolios";
import Privacy from "./pages/Privacy";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { TrendingUp, ShieldCheck, Globe, Zap, BarChart3, Shield } from "lucide-react";
import { toast } from "sonner";
import { Route, Switch, useLocation, Link } from "wouter";

function DashboardRouter() {
  const [activeTab, setActiveTab] = useState("portfolio");
  const [location, setLocation] = useLocation();
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  // Handle URL paths
  useEffect(() => {
    if (location === "/privacy") {
      setActiveTab("privacy");
    }
  }, [location]);

  // Global portfolios query
  const { data: portfolios } = trpc.portfolio.getAll.useQuery();

  // Initialize selected portfolio
  useEffect(() => {
    if (portfolios && portfolios.length > 0 && !selectedPortfolioId) {
      setSelectedPortfolioId(portfolios[0].id);
    }
  }, [portfolios, selectedPortfolioId]);

  // Global mutations
  const createPortfolioMutation = trpc.portfolio.create.useMutation({
    onSuccess: (newPortfolio) => {
      toast.success("Portfolio created!");
      utils.portfolio.getAll.invalidate();
      setSelectedPortfolioId(newPortfolio.id);
    },
  });

  const deletePortfolioMutation = trpc.portfolio.delete.useMutation({
    onSuccess: () => {
      toast.success("Portfolio deleted!");
      utils.portfolio.getAll.invalidate();
      setSelectedPortfolioId(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete portfolio");
    },
  });

  const handleDeletePortfolio = (id: number) => {
    if (confirm("Are you sure you want to delete this portfolio and ALL its data? This cannot be undone.")) {
      deletePortfolioMutation.mutate({ portfolioId: id });
    }
  };

  const renderContent = () => {
    // Show portfolio selector requirement only for investment-specific tabs
    const portfolioRequiredTabs = ["portfolio", "activities", "performance", "dividends"];
    
    if (portfolioRequiredTabs.includes(activeTab) && !selectedPortfolioId) {
      return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-6 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
          <div className="p-4 bg-slate-50 rounded-full">
            <TrendingUp className="w-12 h-12 text-slate-300" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-800">No Portfolio Selected</h3>
            <p className="text-slate-500 max-w-sm">Create your first investment portfolio to start tracking your assets and performance.</p>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case "portfolio":
        return <Holdings selectedPortfolioId={selectedPortfolioId!} />;
      case "contact":
        return <Contact />;
      case "portfolios":
        return <Portfolios />;
      case "privacy":
        return <Privacy onBack={() => {
          setActiveTab("portfolio");
          if (location === "/privacy") setLocation("/");
        }} />;
      default:
        return <Holdings selectedPortfolioId={selectedPortfolioId!} />;
    }
  };

  return (
    <DashboardLayout 
      activeTab={activeTab} 
      onTabChange={setActiveTab}
      portfolios={portfolios || []}
      selectedPortfolioId={selectedPortfolioId}
      onPortfolioChange={setSelectedPortfolioId}
      onCreatePortfolio={(name) => createPortfolioMutation.mutate({ name })}
      onDeletePortfolio={handleDeletePortfolio}
    >
      {renderContent()}
    </DashboardLayout>
  );
}

function Router() {
  const { isAuthenticated, loading } = useAuth();
  const [location, setLocation] = useLocation();
  const [showPrivacyInLogin, setShowPrivacyInLogin] = useState(false);

  // If path is /privacy, we should show it even if unauthenticated
  const isPrivacyPath = location === "/privacy";

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="bg-white p-4 rounded-2xl shadow-xl border border-slate-100 animate-bounce">
            <TrendingUp className="w-10 h-10 text-[#004a99]" />
          </div>
          <div className="text-lg font-bold text-slate-800 tracking-tight">INVESTMENT INSIGHTS</div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Establishing Secure Uplink...</div>
        </div>
      </div>
    );
  }

  if (showPrivacyInLogin || (isPrivacyPath && !isAuthenticated)) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-10 flex flex-col items-center">
        <Privacy onBack={() => {
          setShowPrivacyInLogin(false);
          if (isPrivacyPath) setLocation("/");
        }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-4xl w-full bg-white rounded-3xl shadow-2xl shadow-slate-200 border border-white flex flex-col md:flex-row overflow-hidden mb-8">
          {/* Left side: Branding/Value Prop */}
          <div className="md:w-1/2 bg-[#004a99] p-12 text-white flex flex-col justify-between">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <span className="font-bold tracking-tighter text-xl">INVESTMENT INSIGHTS</span>
              </div>
              <h1 className="text-4xl font-bold leading-tight">
                Professional Portfolio Intelligence.
              </h1>
              <p className="text-white/70 text-lg">
                High-fidelity asset tracking with automatic market data, historical performance audit, and detailed dividend ledger analysis.
              </p>
            </div>
            <div className="space-y-4 hidden md:block">
              <div className="flex items-center gap-3 text-sm font-medium text-white/80">
                <ShieldCheck className="w-5 h-5 text-green-400" />
                <span>Enterprise-grade OAuth security</span>
              </div>
              <div className="flex items-center gap-3 text-sm font-medium text-white/80">
                <Globe className="w-5 h-5 text-blue-300" />
                <span>Global Yahoo Finance Market Link</span>
              </div>
            </div>
          </div>

          {/* Right side: Login */}
          <div className="md:w-1/2 p-12 flex flex-col justify-center items-center text-center">
            <div className="mb-8 space-y-2">
              <h2 className="text-2xl font-bold text-slate-800">Welcome Back</h2>
              <p className="text-slate-500 text-sm">Sign in to access your investment terminal</p>
            </div>

            <a
              href={getGoogleLoginUrl()}
              className="flex items-center justify-center gap-3 w-full max-w-sm px-6 py-4 bg-white border-2 border-slate-100 rounded-xl font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-200 transition-all shadow-sm active:scale-[0.98]"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span>Continue with Google</span>
            </a>

            <div className="mt-8 space-y-4 w-full">
              <p className="text-[10px] text-slate-400 font-medium">
                By signing in, you agree to our{" "}
                <Link 
                  href="/privacy"
                  className="text-[#004a99] hover:underline font-bold"
                >
                  Privacy Policy
                </Link>
              </p>

              <div className="pt-8 border-t border-slate-100 w-full">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <Zap className="w-4 h-4 text-orange-500 mx-auto mb-1" />
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Real-time</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <BarChart3 className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Analytics</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Simple Login Footer for Google Compliance */}
        <div className="text-[10px] text-slate-400 font-medium uppercase tracking-widest flex items-center gap-4">
          <span>&copy; 2026 Investment Insights</span>
          <span className="text-slate-200">|</span>
          <Link href="/privacy" className="hover:text-[#004a99] hover:underline">
            Privacy Policy
          </Link>
        </div>
      </div>
    );
  }

  return <DashboardRouter />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
