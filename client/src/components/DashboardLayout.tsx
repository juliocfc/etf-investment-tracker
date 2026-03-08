import React, { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, TrendingUp, PieChart, Activity, DollarSign, Wallet, Briefcase, Plus, Trash2, List } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface DashboardLayoutProps {
  children: React.ReactNode;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  portfolios: any[];
  selectedPortfolioId: number | null;
  onPortfolioChange: (id: number) => void;
  onCreatePortfolio: (name: string) => void;
  onDeletePortfolio: (id: number) => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  activeTab = "portfolio",
  onTabChange,
  portfolios,
  selectedPortfolioId,
  onPortfolioChange,
  onCreatePortfolio,
  onDeletePortfolio,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAddPortfolioOpen, setIsAddPortfolioOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const { user, logout } = useAuth();

  const { data: consolidated } = trpc.portfolio.getConsolidatedSummary.useQuery(undefined, {
    staleTime: 30000,
  });

  const navItems = [
    { id: "portfolio", label: "Holdings & Cash", icon: <Wallet className="w-4 h-4" /> },
    { id: "activities", label: "Activities", icon: <List className="w-4 h-4" /> },
    { id: "performance", label: "Performance", icon: <Activity className="w-4 h-4" /> },
    { id: "dividends", label: "Dividends", icon: <DollarSign className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40 shadow-sm">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-md text-slate-500"
            >
              {sidebarOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
            <div className="flex items-center gap-2">
              <div className="bg-[#004a99] p-1.5 rounded">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-lg font-bold tracking-tight text-[#004a99] uppercase hidden sm:block">
                Investment Insights
              </h1>
            </div>

            {/* Global Portfolio Selector */}
            <div className="ml-4 pl-4 border-l border-slate-200 hidden md:flex items-center gap-3">
              <div className="p-1.5 bg-slate-50 rounded text-slate-400">
                <Briefcase className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={selectedPortfolioId || ""}
                  onChange={(e) => onPortfolioChange(parseInt(e.target.value))}
                  className="bg-transparent border-none focus:ring-0 font-bold text-slate-700 cursor-pointer hover:text-[#004a99] transition-colors"
                >
                  {portfolios.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                
                <Dialog open={isAddPortfolioOpen} onOpenChange={setIsAddPortfolioOpen}>
                  <DialogTrigger asChild>
                    <button className="flex items-center gap-1.5 ml-2 px-2 py-1 text-slate-400 hover:text-primary transition-colors rounded-md hover:bg-slate-100" title="New Portfolio">
                      <Plus className="w-3.5 h-3.5" />
                      <span className="text-[10px] font-bold uppercase tracking-wider">New Portfolio</span>
                    </button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create New Portfolio</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Portfolio Name</label>
                        <Input
                          placeholder="e.g., Retirement, Growth, Dividend"
                          value={newPortfolioName}
                          onChange={(e) => setNewPortfolioName(e.target.value)}
                          autoFocus
                        />
                      </div>
                      <Button 
                        onClick={() => {
                          onCreatePortfolio(newPortfolioName);
                          setIsAddPortfolioOpen(false);
                          setNewPortfolioName("");
                        }}
                        className="w-full bg-[#004a99] hover:bg-[#003d7a]"
                        disabled={!newPortfolioName}
                      >
                        Create Portfolio
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                {selectedPortfolioId && (
                  <button 
                    onClick={() => onDeletePortfolio(selectedPortfolioId)}
                    className="p-1 text-slate-400 hover:text-red-600 transition-colors rounded-md hover:bg-red-50" 
                    title="Delete Current Portfolio"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Consolidated Totals */}
            {consolidated && (
              <div className="ml-6 pl-6 border-l border-slate-200 hidden lg:flex items-center gap-8">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Consolidated Total</span>
                  <span className="text-sm font-bold text-slate-800 font-mono leading-none">
                    {formatCurrency(consolidated.totalValue)}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Investments</span>
                  <div className="flex items-baseline gap-1.5 leading-none">
                    <span className="text-xs font-bold text-green-600 font-mono">
                      {formatCurrency(consolidated.investmentValue)}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400">({consolidated.investmentPercent}%)</span>
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Total Cash</span>
                  <div className="flex items-baseline gap-1.5 leading-none">
                    <span className="text-xs font-bold text-slate-600 font-mono">
                      {formatCurrency(consolidated.cashBalance)}
                    </span>
                    <span className="text-[9px] font-bold text-slate-400">({consolidated.cashPercent}%)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-sm font-semibold text-slate-700">
                {user?.name || "User"}
              </span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Standard Member
              </span>
            </div>
            <button
              onClick={() => logout()}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-600 transition-colors font-medium border-l border-slate-200 pl-6"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? "w-64" : "w-0"
          } bg-white border-r border-slate-200 transition-all duration-300 overflow-hidden lg:static absolute z-30 h-full shadow-lg lg:shadow-none`}
        >
          <div className="p-4 space-y-1">
            <div className="px-4 py-2 mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Main Menu</span>
            </div>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange?.(item.id);
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 font-medium ${
                  activeTab === item.id
                    ? "bg-slate-100 text-[#004a99]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {item.icon}
                <span className="text-sm">{item.label}</span>
                {activeTab === item.id && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#004a99]" />
                )}
              </button>
            ))}
          </div>
        </aside>

        {/* Overlay for mobile sidebar */}
        {sidebarOpen && (
          <div 
            className="lg:hidden fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-20"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-auto bg-slate-50 flex flex-col">
          <div className="p-6 lg:p-10 max-w-[1800px] mx-auto w-full flex-1">
            {children}
          </div>
          
          {/* Page Footer */}
          <footer className="mt-auto py-6 px-10 border-t border-slate-200 bg-white">
            <div className="max-w-[1800px] mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">System Status: Online</span>
                </div>
                <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Market Link: Connected</span>
                </div>
              </div>
              
              <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                &copy; 2026 Investment Portfolio Insights &bull; Professional Grade Asset Tracking
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
