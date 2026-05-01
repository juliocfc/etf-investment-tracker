import React, { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Menu, X, LogOut, TrendingUp, Wallet, Briefcase, Plus, Mail, ArrowRightLeft, LayoutDashboard, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [isAddPortfolioOpen, setIsAddPortfolioOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();

  const selectedPortfolio = portfolios.find(p => p.id === selectedPortfolioId);

  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex flex-col overflow-hidden font-sans">
      {/* Top Navigation Bar */}
      <header className="h-16 border-b border-slate-200 bg-white sticky top-0 z-[60] shadow-sm">
        <div className="flex items-center justify-between px-4 sm:px-6 h-full max-w-[1800px] mx-auto w-full">
          {/* Left Section: Logo and Navigation */}
          <div className="flex items-center gap-2 md:gap-8">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 md:hidden hover:bg-slate-100 rounded-md text-slate-500"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            <div className="flex items-center gap-2 mr-2 md:mr-4">
              <div className="bg-[#004a99] p-1.5 rounded">
                <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-white" />
              </div>
              <h1 className="text-sm md:text-lg font-bold tracking-tight text-[#004a99] uppercase hidden sm:block">
                Investment Insights
              </h1>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              <button
                onClick={() => onTabChange?.("portfolios")}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all font-bold uppercase text-[11px] tracking-wider ${
                  activeTab === "portfolios"
                    ? "bg-slate-100 text-[#004a99]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </button>

              <button
                onClick={() => onTabChange?.("fi")}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all font-bold uppercase text-[11px] tracking-wider ${
                  activeTab === "fi"
                    ? "bg-slate-100 text-[#004a99]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                FI
              </button>

              {(user?.role === "admin" || user?.role === "premium") && (
                <button
                  onClick={() => onTabChange?.("brokerage")}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md transition-all font-bold uppercase text-[11px] tracking-wider ${
                    activeTab === "brokerage"
                      ? "bg-slate-100 text-[#004a99]"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  Brokerage
                </button>
              )}

              <Dialog open={isAddPortfolioOpen} onOpenChange={setIsAddPortfolioOpen}>
                <DialogTrigger asChild>
                  <button className="flex items-center gap-2 px-4 py-2 rounded-md transition-all font-bold uppercase text-[11px] tracking-wider text-slate-500 hover:bg-slate-50 hover:text-primary group">
                    <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    New Portfolio
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
            </nav>
          </div>

          {/* Right Section: Portfolio Selector and User Profile */}
          <div className="flex items-center gap-2 md:gap-4">
            <div className="hidden sm:block">
              <Select
                value={selectedPortfolioId?.toString() || "select"}
                onValueChange={(val) => {
                  if (val === "select") {
                    onPortfolioChange(null as any);
                    onTabChange?.("portfolios");
                  } else {
                    onPortfolioChange(parseInt(val));
                    onTabChange?.("portfolio");
                  }
                }}
              >
                <SelectTrigger className="w-[140px] md:w-[200px] h-9 bg-slate-50 border-slate-200 text-[10px] md:text-xs font-bold uppercase tracking-wider">
                  <SelectValue placeholder="Select Portfolio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="select" className="text-xs font-bold uppercase text-slate-400">
                    Select Portfolio
                  </SelectItem>
                  {portfolios.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()} className="text-xs font-bold uppercase">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 md:gap-3 pl-2 md:pl-4 border-l border-slate-200 hover:opacity-80 transition-opacity">
                  <div className="flex flex-col items-end hidden md:flex">
                    <span className="text-sm font-bold text-slate-700">
                      {user?.name || "User"}
                    </span>
                    <span className="text-[9px] text-slate-400 uppercase tracking-widest font-black">
                      {user?.role || "Standard"} Member
                    </span>
                  </div>
                  <div className="w-7 h-7 md:w-8 md:h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 text-xs md:text-sm font-bold">
                    {user?.name?.[0] || "U"}
                  </div>
                  <ChevronDown className="w-3 h-3 md:w-4 md:h-4 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onTabChange?.("contact")}>
                  <Mail className="w-4 h-4 mr-2" />
                  Support
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onTabChange?.("privacy")}>
                  <Briefcase className="w-4 h-4 mr-2" />
                  Privacy Policy
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout()} className="text-red-600">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[100] bg-white pt-16 animate-in slide-in-from-left duration-200">
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-2">
                <div className="bg-[#004a99] p-1.5 rounded">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <h1 className="text-lg font-bold tracking-tight text-[#004a99] uppercase">
                  Insights
                </h1>
              </div>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-md text-slate-500"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <nav className="flex flex-col gap-2">
              <button
                onClick={() => {
                  onTabChange?.("portfolios");
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-4 px-4 py-4 rounded-xl transition-all font-bold uppercase text-sm tracking-widest ${
                  activeTab === "portfolios"
                    ? "bg-slate-100 text-[#004a99]"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <LayoutDashboard className="w-5 h-5" />
                Dashboard
              </button>

              <button
                onClick={() => {
                  onTabChange?.("fi");
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-4 px-4 py-4 rounded-xl transition-all font-bold uppercase text-sm tracking-widest ${
                  activeTab === "fi"
                    ? "bg-slate-100 text-[#004a99]"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <TrendingUp className="w-5 h-5" />
                FI
              </button>

              {(user?.role === "admin" || user?.role === "premium") && (
                <button
                  onClick={() => {
                    onTabChange?.("brokerage");
                    setMobileMenuOpen(false);
                  }}
                  className={`flex items-center gap-4 px-4 py-4 rounded-xl transition-all font-bold uppercase text-sm tracking-widest ${
                    activeTab === "brokerage"
                      ? "bg-slate-100 text-[#004a99]"
                      : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  <ArrowRightLeft className="w-5 h-5" />
                  Brokerage
                </button>
              )}

              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setIsAddPortfolioOpen(true);
                }}
                className="flex items-center gap-4 px-4 py-4 rounded-xl transition-all font-bold uppercase text-sm tracking-widest text-slate-500 hover:bg-slate-50"
              >
                <Plus className="w-5 h-5" />
                New Portfolio
              </button>
            </nav>

            <div className="pt-6 border-t border-slate-100">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Quick Select Portfolio</label>
              <div className="grid grid-cols-1 gap-2">
                {portfolios.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onPortfolioChange(p.id);
                      onTabChange?.("portfolio");
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      selectedPortfolioId === p.id 
                        ? "bg-primary text-white shadow-md shadow-primary/20" 
                        : "bg-slate-50 text-slate-600"
                    }`}
                  >
                    <Wallet className={`w-4 h-4 ${selectedPortfolioId === p.id ? "text-white" : "text-slate-400"}`} />
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
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
