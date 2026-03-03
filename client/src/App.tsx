import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "./const";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import CyberpunkDashboard from "./components/CyberpunkDashboard";
import Portfolio from "./pages/Portfolio";
import Performance from "./pages/Performance";
import Dividends from "./pages/Dividends";
import History from "./pages/History";
import DebugPrices from "./pages/DebugPrices";
import { useState } from "react";
import { TrendingUp } from "lucide-react";

function DashboardRouter() {
  const [activeTab, setActiveTab] = useState("portfolio");

  const renderContent = () => {
    switch (activeTab) {
      case "portfolio":
        return <Portfolio />;
      case "performance":
        return <Performance />;
      case "dividends":
        return <Dividends />;
      case "history":
        return <History />;
      case "debug":
        return <DebugPrices />;
      default:
        return <Portfolio />;
    }
  };

  return (
    <CyberpunkDashboard activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </CyberpunkDashboard>
  );
}

function Router() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center scan-lines">
        <div className="text-center space-y-4">
          <TrendingUp className="w-12 h-12 mx-auto text-[#ff006e] animate-pulse" />
          <div className="text-2xl font-bold" style={{
            color: '#00d9ff',
            textShadow: '0 0 10px #00d9ff, 0 0 20px #00d9ff, 0 0 30px #00d9ff',
            filter: 'drop-shadow(0 0 8px #00d9ff)'
          }}>ETF TRACKER</div>
          <div className="animate-pulse text-muted-foreground">Initializing...</div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center scan-lines">
        <div className="text-center space-y-8 max-w-md px-4">
          <div className="space-y-4">
            <TrendingUp className="w-16 h-16 mx-auto" style={{
              color: '#ff006e',
              textShadow: '0 0 10px #ff006e, 0 0 20px #ff006e, 0 0 30px #ff006e',
              filter: 'drop-shadow(0 0 8px #ff006e)'
            }} />
            <h1 className="text-4xl font-bold" style={{
              color: '#00d9ff',
              textShadow: '0 0 10px #00d9ff, 0 0 20px #00d9ff, 0 0 30px #00d9ff',
              filter: 'drop-shadow(0 0 8px #00d9ff)'
            }}>ETF TRACKER</h1>
            <p className="text-muted-foreground leading-relaxed">
              Track your ETF investments with real-time prices, performance analytics, and dividend tracking
            </p>
          </div>

          <div className="space-y-4">
            <a
              href={getLoginUrl()}
              className="inline-block px-8 py-3 btn-neon font-bold uppercase tracking-wider"
              style={{
                textShadow: '0 0 10px #ff006e, 0 0 20px #ff006e, 0 0 30px #ff006e',
                filter: 'drop-shadow(0 0 8px #ff006e)'
              }}
            >
              Login to Start
            </a>
            <p className="text-xs text-muted-foreground">
              Secure authentication powered by Manus
            </p>
          </div>

          {/* Features Preview */}
          <div className="border-t border-border pt-6 space-y-3">
            <div className="text-xs text-muted-foreground space-y-2">
              <div>✦ Real-time ETF price tracking</div>
              <div>✦ Performance analytics (1M, 1Y, 3Y)</div>
              <div>✦ Dividend income tracking</div>
              <div>✦ Portfolio balance history</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <DashboardRouter />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
