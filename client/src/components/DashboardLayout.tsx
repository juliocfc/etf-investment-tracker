import React, { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, TrendingUp, Wallet, Briefcase, Plus, Mail, ArrowRightLeft } from "lucide-react";
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
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isAddPortfolioOpen, setIsAddPortfolioOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const { user, logout } = useAuth();

  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-slate-200 bg-white sticky top-0 z-[60] shadow-sm">
        <div className="flex items-center justify-between px-6 h-full">
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
          </div>

          <div className="flex items-center gap-2 sm:gap-6">
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-sm font-semibold text-slate-700">
                {user?.name || "User"}
              </span>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Standard Member
              </span>
            </div>
            <button
              onClick={() => logout()}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-600 transition-colors font-medium border-l border-slate-200 pl-2 sm:pl-6"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${sidebarOpen ? "w-64" : "w-0"
            } bg-white border-r border-slate-200 transition-all duration-300 overflow-hidden lg:static fixed top-14 bottom-0 left-0 z-50 shadow-lg lg:shadow-none flex flex-col`}
        >
          <div className="p-4 flex-1 overflow-y-auto space-y-1 custom-scrollbar">
            <div className="px-4 py-2 mb-1 flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Navigation</span>
              <button 
                onClick={() => setSidebarOpen(false)} 
                className="lg:hidden p-1 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* All Portfolios Link */}
            <button
              onClick={() => {
                onTabChange?.("portfolios");
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-200 font-medium ${activeTab === "portfolios"
                ? "bg-slate-100 text-[#004a99]"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
            >
              <Briefcase className="w-4 h-4" />
              <span className="text-sm font-bold uppercase tracking-wider">My Portfolios</span>
              {activeTab === "portfolios" && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#004a99]" />
              )}
            </button>


            {/* Individual Portfolios */}
            {portfolios.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onPortfolioChange(p.id);
                  onTabChange?.("portfolio");
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-200 font-medium ${activeTab === "portfolio" && selectedPortfolioId === p.id
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  }`}
              >
                <Wallet className={`w-4 h-4 ${activeTab === "portfolio" && selectedPortfolioId === p.id ? "text-primary" : "text-slate-400"}`} />
                <span className="text-sm truncate">{p.name}</span>
                {activeTab === "portfolio" && selectedPortfolioId === p.id && (
                  <div className="ml-auto w-1 h-4 rounded-full bg-primary" />
                )}
              </button>
            ))}

            {/* New Portfolio Dialog */}
            <Dialog open={isAddPortfolioOpen} onOpenChange={setIsAddPortfolioOpen}>
              <DialogTrigger asChild>
                <button className="w-full flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-200 font-medium text-slate-400 hover:text-primary hover:bg-slate-50 group">
                  <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                  <span className="text-sm uppercase tracking-wider font-bold">New Portfolio</span>
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
            {/* Brokerage Link */}
            {(user?.role === "admin" || user?.role === "premium") && (
              <button
                onClick={() => {
                  onTabChange?.("brokerage");
                  if (window.innerWidth < 1024) setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-200 font-medium ${
                  activeTab === "brokerage"
                    ? "bg-slate-100 text-[#004a99]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span className="text-sm font-bold uppercase tracking-wider">Brokerage</span>
                {activeTab === "brokerage" && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#004a99]" />
                )}
              </button>
            )}

          </div>

          {/* Contact Us at the bottom */}
          <div className="p-4 border-t border-slate-100 mt-auto">
            <button
              onClick={() => {
                onTabChange?.("contact");
                if (window.innerWidth < 1024) setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 font-medium ${activeTab === "contact"
                ? "bg-slate-100 text-[#004a99]"
                : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
            >
              <Mail className="w-4 h-4" />
              <span className="text-sm">Contact Us</span>
              {activeTab === "contact" && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#004a99]" />
              )}
            </button>
          </div>
        </aside>

        {/* Overlay for mobile sidebar */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 top-14"
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

              <div className="text-[10px] text-slate-400 font-medium uppercase tracking-wider flex items-center gap-4">
                <span>&copy; 2026 Investment Portfolio Insights &bull; Professional Grade Asset Tracking</span>
                <span className="text-slate-200">|</span>
                <button
                  onClick={() => onTabChange?.("privacy")}
                  className="hover:text-primary transition-colors hover:underline"
                >
                  Privacy Policy
                </button>
              </div>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
