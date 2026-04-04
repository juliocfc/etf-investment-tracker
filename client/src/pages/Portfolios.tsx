import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Briefcase, ChevronDown, ChevronRight, Edit2, Trash2, PieChart, Wallet, DollarSign, Plus, BarChart3, CalendarPlus, List, RefreshCw, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PortfoliosProps {
  onPortfolioSelect?: (id: number) => void;
}

const Portfolios: React.FC<PortfoliosProps> = ({ onPortfolioSelect }) => {
  const utils = trpc.useUtils();
  const { data: portfolios, isLoading, refetch } = trpc.portfolio.getDetailedAll.useQuery();
  const { data: historyData } = trpc.portfolio.getHistory.useQuery({ days: 1825 });
  const { data: allHoldings } = trpc.portfolio.getAllHoldings.useQuery();
  const [expandedPortfolios, setExpandedPortfolios] = useState<Set<number>>(new Set());
  const [portfolioFilter, setPortfolioFilter] = useState<string>("all");
  const [isAddPortfolioOpen, setIsAddPortfolioOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");

  const createPortfolioMutation = trpc.portfolio.create.useMutation({
    onSuccess: (newPortfolio) => {
      toast.success("Portfolio created!");
      utils.portfolio.getDetailedAll.invalidate();
      utils.portfolio.getAll.invalidate();
      setIsAddPortfolioOpen(false);
      setNewPortfolioName("");
      if (onPortfolioSelect) {
        onPortfolioSelect(newPortfolio.id);
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create portfolio");
    }
  });

  const { data: yearlyPerformance, isLoading: isLoadingYearly } = trpc.portfolio.getYearlyPerformance.useQuery({ 
    portfolioId: portfolioFilter === "all" ? undefined : parseInt(portfolioFilter) 
  });

  const { data: dividendReport, isLoading: isLoadingDividends } = trpc.etf.getDetailedDividendReport.useQuery(
    { portfolioId: portfolioFilter === "all" ? undefined : parseInt(portfolioFilter) }
  );


  // Aggregate consolidated holdings by asset
  const consolidatedHoldings = useMemo(() => {
    if (!allHoldings) return [];

    const filterId = portfolioFilter === "all" ? null : parseInt(portfolioFilter);
    const assetMap: Record<string, { 
      symbol: string, 
      name: string, 
      quantity: number, 
      totalCost: number, 
      currentPrice: number,
      annualDividendPerShare: number
    }> = {};

    allHoldings.forEach((h: any) => {
      if (filterId !== null && h.portfolioId !== filterId) return;

      if (!assetMap[h.symbol]) {
        assetMap[h.symbol] = {
          symbol: h.symbol,
          name: h.name,
          quantity: 0,
          totalCost: 0,
          currentPrice: parseFloat(h.currentPrice),
          annualDividendPerShare: h.annualDividendPerShare || 0
        };
      }

      const qty = parseFloat(h.quantity);
      const avgPurchasePrice = parseFloat(h.purchasePrice);
      
      assetMap[h.symbol].quantity += qty;
      assetMap[h.symbol].totalCost += qty * avgPurchasePrice;
      assetMap[h.symbol].currentPrice = parseFloat(h.currentPrice);
    });

    return Object.values(assetMap).map(asset => {
      const mktValue = asset.quantity * asset.currentPrice;
      const gainLoss = mktValue - asset.totalCost;
      const gainLossPercent = asset.totalCost > 0 ? (gainLoss / asset.totalCost) * 100 : 0;
      const avgCost = asset.quantity > 0 ? asset.totalCost / asset.quantity : 0;
      const projectedDividend = asset.quantity * asset.annualDividendPerShare;
      const divYield = asset.currentPrice > 0 ? (asset.annualDividendPerShare / asset.currentPrice) * 100 : 0;

      return {
        ...asset,
        avgCost,
        mktValue,
        gainLoss,
        gainLossPercent,
        projectedDividend,
        divYield
      };
    }).sort((a, b) => b.mktValue - a.mktValue);
  }, [allHoldings, portfolioFilter]);

  const tableTotals = useMemo(() => {
    return consolidatedHoldings.reduce((acc, curr) => ({
      totalCost: acc.totalCost + curr.totalCost,
      mktValue: acc.mktValue + curr.mktValue,
      gainLoss: acc.gainLoss + curr.gainLoss,
      projectedDividend: acc.projectedDividend + curr.projectedDividend
    }), { totalCost: 0, mktValue: 0, gainLoss: 0, projectedDividend: 0 });
  }, [consolidatedHoldings]);

  // Yearly performance data is now fetched via trpc.portfolio.getYearlyPerformance

  // Aggregate history data by month for the bar chart
  const monthlyChartData = useMemo(() => {
    if (!historyData || !portfolios) return [];

    const monthMap: Record<string, { month: string, displayDate: string, investment: number, cash: number, total: number }> = {};
    const months: string[] = [];
    const now = new Date();

    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push(monthKey);

      monthMap[monthKey] = {
        month: monthKey,
        displayDate: d.toLocaleDateString('default', { month: 'short', year: '2-digit' }),
        investment: 0,
        cash: 0,
        total: 0
      };
    }

    const filterId = portfolioFilter === "all" ? null : parseInt(portfolioFilter);

    months.forEach((monthKey, idx) => {
      const isLastMonth = idx === months.length - 1;
      const [year, month] = monthKey.split('-').map(Number);
      const monthEndDate = isLastMonth ? new Date() : new Date(year, month, 0, 23, 59, 59);

      // 1. Calculate Cash at month end
      const latestAccountCash: Record<string, number> = {};

      if (isLastMonth) {
        portfolios.forEach(p => {
          if (filterId !== null && p.id !== filterId) return;
          p.accounts.forEach((acc: any) => {
            latestAccountCash[`${p.id}-${acc.id}`] = parseFloat(acc.cashValue);
          });
        });
      } else {
        historyData.cashHistory.forEach((record: any) => {
          if (filterId !== null && record.portfolioId !== filterId) return;
          const recordDate = new Date(record.date);
          if (recordDate <= monthEndDate) {
            const key = `${record.portfolioId}-${record.accountId}`;
            if (latestAccountCash[key] === undefined) {
              latestAccountCash[key] = parseFloat(record.amount);
            }
          }
        });
      }

      const totalCash = Object.values(latestAccountCash).reduce((sum, val) => sum + val, 0);

      // 2. Calculate Investment at month end
      let totalInv = 0;
      if (isLastMonth) {
        portfolios.forEach(p => {
          if (filterId !== null && p.id !== filterId) return;
          totalInv += parseFloat(p.investmentValue);
        });
      } else {
        const symbolQty: Record<string, number> = {};
        historyData.purchases.forEach((p: any) => {
          if (filterId !== null && p.portfolioId !== filterId) return;
          const purchaseDate = new Date(p.purchaseDate);
          const soldDate = p.soldDate ? new Date(p.soldDate) : null;
          if (purchaseDate <= monthEndDate && (!p.isSold || (soldDate && soldDate > monthEndDate))) {
            symbolQty[p.symbol] = (symbolQty[p.symbol] || 0) + parseFloat(p.quantity);
          }
        });

        Object.entries(symbolQty).forEach(([symbol, qty]) => {
          const prices = (historyData as any).historicalPrices?.[symbol.toUpperCase()] || [];
          const pricePoint = prices.filter((hp: any) => new Date(hp.timestamp) <= monthEndDate).pop();
          const price = pricePoint ? pricePoint.price : 0;
          totalInv += qty * price;
        });
      }

      monthMap[monthKey].cash = totalCash;
      monthMap[monthKey].investment = totalInv;
      monthMap[monthKey].total = totalInv + totalCash;
    });

    return months.map(m => monthMap[m]).filter(m => m.total > 0 || m.month === months[11]);
  }, [historyData, portfolios, portfolioFilter]);

  const [editingPortfolio, setEditingPortfolio] = useState<{ id: number, name: string } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<number | null>(null);

  const toggleExpand = (id: number) => {
    const newExpanded = new Set(expandedPortfolios);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedPortfolios(newExpanded);
  };

  const updatePortfolioMutation = trpc.portfolio.update.useMutation({
    onSuccess: () => {
      toast.success("Portfolio renamed!");
      utils.portfolio.getDetailedAll.invalidate();
      utils.portfolio.getAll.invalidate();
      setEditingPortfolio(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to rename portfolio");
    }
  });

  const deletePortfolioMutation = trpc.portfolio.delete.useMutation({
    onSuccess: () => {
      toast.success("Portfolio deleted!");
      utils.portfolio.getDetailedAll.invalidate();
      utils.portfolio.getAll.invalidate();
      setIsDeleteDialogOpen(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete portfolio");
    }
  });

  const updatePricesMutation = trpc.etf.updatePrices.useMutation({
    onSuccess: () => {
      toast.success("Prices updated successfully!");
      utils.portfolio.getDetailedAll.invalidate();
      utils.portfolio.getHistory.invalidate();
      utils.portfolio.getAllHoldings.invalidate();
      utils.portfolio.getConsolidatedSummary.invalidate();
      utils.etf.getDetailedDividendReport.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update prices");
    }
  });

  const totals = useMemo(() => {
    if (!portfolios) return { investment: 0, cash: 0, overall: 0, totalCost: 0, gain: 0, gainPercent: "0", investmentPercent: "0", cashPercent: "0" };
    const investment = portfolios.reduce((acc, p) => acc + parseFloat(p.investmentValue), 0);
    const cash = portfolios.reduce((acc, p) => acc + parseFloat(p.cashValue), 0);
    const totalCost = portfolios.reduce((acc, p) => acc + parseFloat(p.totalCost || "0"), 0);
    const overall = investment + cash;
    const gain = investment - totalCost;
    const gainPercent = totalCost > 0 ? ((gain / totalCost) * 100).toFixed(2) : "0.00";

    return {
      investment,
      cash,
      overall,
      totalCost,
      gain,
      gainPercent,
      investmentPercent: overall > 0 ? ((investment / overall) * 100).toFixed(1) : "0",
      cashPercent: overall > 0 ? ((cash / overall) * 100).toFixed(1) : "0",
    };
  }, [portfolios]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest text-center">Loading Portfolios...</p>
      </div>
    );
  }

  if (!portfolios || portfolios.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-8 p-6 text-center max-w-lg mx-auto">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping" />
          <div className="relative p-6 bg-white rounded-full shadow-xl border-2 border-primary/20">
            <Briefcase className="w-12 h-12 text-primary" />
          </div>
        </div>
        
        <div className="space-y-3">
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">No Portfolios Found</h2>
          <p className="text-slate-500 leading-relaxed">
            Start your investment journey by creating your first portfolio. You'll be able to organize accounts, track assets, and analyze performance in one professional terminal.
          </p>
        </div>

        <Dialog open={isAddPortfolioOpen} onOpenChange={setIsAddPortfolioOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="px-10 h-14 text-base font-bold bg-[#004a99] hover:bg-[#003d7a] shadow-lg shadow-blue-900/20 active:scale-95 transition-all">
              <Plus className="w-5 h-5 mr-3" />
              Create First Portfolio
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] bg-white text-slate-900">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-slate-800">New Portfolio</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 pt-6">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Portfolio Name</label>
                <Input
                  placeholder="e.g., Long Term Growth, Retirement"
                  value={newPortfolioName}
                  onChange={(e) => setNewPortfolioName(e.target.value)}
                  className="h-12 border-slate-200 focus:border-primary focus:ring-primary shadow-sm"
                  autoFocus
                />
              </div>
              <Button 
                onClick={() => {
                  if (newPortfolioName) {
                    createPortfolioMutation.mutate({ name: newPortfolioName });
                    setIsAddPortfolioOpen(false);
                    setNewPortfolioName("");
                  }
                }}
                className="w-full h-12 bg-[#004a99] hover:bg-[#003d7a] font-bold uppercase tracking-wider"
                disabled={!newPortfolioName || createPortfolioMutation.isPending}
              >
                {createPortfolioMutation.isPending ? "Initializing..." : "Establish Portfolio"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex justify-between items-center bg-white p-6 rounded-lg shadow-sm border border-border">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-primary/10 rounded-lg text-primary">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Portfolio Management</h2>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-tight">Overview of all investment portfolios and accounts</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white border-none shadow-sm shadow-slate-200/50">
          <CardContent className="pt-6 text-primary">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-primary/60 uppercase tracking-widest">Grand Total</span>
              <DollarSign className="w-4 h-4" />
            </div>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(totals.overall)}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-none shadow-sm shadow-slate-200/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Cash</span>
              <Wallet className="w-4 h-4 text-slate-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold text-slate-800 font-mono">
                {formatCurrency(totals.cash)}
              </div>
              <div className="text-xs font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                {totals.cashPercent}%
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white border-none shadow-sm shadow-slate-200/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Investments</span>
              <PieChart className="w-4 h-4 text-green-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold text-slate-800 font-mono">
                {formatCurrency(totals.investment)}
              </div>
              <div className="text-xs font-bold text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                {totals.investmentPercent}%
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                <th className="w-10"></th>
                <th className="text-left py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Portfolio Name</th>
                <th className="text-right py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Value</th>
                <th className="text-right py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cash</th>
                <th className="text-right py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Investments</th>
                <th className="text-right py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cost Basis</th>
                <th className="text-right py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gain/Loss</th>
                <th className="text-right py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gain/Loss %</th>
                <th className="text-center py-4 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody>
              {portfolios?.map((portfolio) => {
                const pTotal = parseFloat(portfolio.totalValue);
                const pInvPercent = pTotal > 0 ? ((parseFloat(portfolio.investmentValue) / pTotal) * 100).toFixed(1) : "0";
                const pCashPercent = pTotal > 0 ? ((parseFloat(portfolio.cashValue) / pTotal) * 100).toFixed(1) : "0";
                const isGain = parseFloat(portfolio.gain || "0") >= 0;

                return (
                  <React.Fragment key={portfolio.id}>
                    <tr className={`border-b border-border transition-colors ${expandedPortfolios.has(portfolio.id) ? "bg-slate-50/50" : "hover:bg-slate-50/30"}`}>
                      <td className="py-4 px-2 text-center">
                        <button
                          onClick={() => toggleExpand(portfolio.id)}
                          className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-400"
                        >
                          {expandedPortfolios.has(portfolio.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="py-4 px-4 font-bold text-slate-800">
                        <button
                          onClick={() => onPortfolioSelect?.(portfolio.id)}
                          className="hover:text-primary hover:underline transition-colors text-left"
                        >
                          {portfolio.name}
                        </button>
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-bold text-primary">{formatCurrency(portfolio.totalValue)}</td>
                      <td className="py-4 px-4 text-right">
                        <div className="font-mono font-medium text-slate-600">{formatCurrency(portfolio.cashValue)}</div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{pCashPercent}%</div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="font-mono font-medium text-slate-700">{formatCurrency(portfolio.investmentValue)}</div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{pInvPercent}%</div>
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-500 text-xs">{formatCurrency(portfolio.totalCost || "0")}</td>
                      <td className={`py-4 px-4 text-right font-mono text-xs font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                        {isGain ? "+" : ""}{formatCurrency(portfolio.gain || "0")}
                      </td>
                      <td className={`py-4 px-4 text-right font-mono text-xs font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                        {isGain ? "+" : ""}{portfolio.gainPercent || "0.00"}%
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-primary"
                            onClick={() => setEditingPortfolio({ id: portfolio.id, name: portfolio.name })}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-slate-400 hover:text-destructive"
                            onClick={() => setIsDeleteDialogOpen(portfolio.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    <AnimatePresence>
                      {expandedPortfolios.has(portfolio.id) && (
                        <tr>
                          <td colSpan={9} className="p-0 border-b border-border bg-slate-50/30">
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="py-4 px-12 space-y-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Breakdown</span>
                                  <div className="h-[1px] flex-1 bg-slate-200"></div>
                                </div>

                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-slate-200">
                                      <th className="text-left py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account</th>
                                      <th className="text-right py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Value</th>
                                      <th className="text-right py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cash</th>
                                      <th className="text-right py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Investments</th>
                                      <th className="text-right py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cost Basis</th>
                                      <th className="text-right py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gains / Loss</th>
                                      <th className="text-right py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">% Return</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {portfolio.accounts.map((acc: any) => {
                                      const accTotal = parseFloat(acc.totalValue);
                                      const accInvPercent = accTotal > 0 ? ((parseFloat(acc.investmentValue) / accTotal) * 100).toFixed(1) : "0";
                                      const accCashPercent = accTotal > 0 ? ((parseFloat(acc.cashValue) / accTotal) * 100).toFixed(1) : "0";
                                      const accIsGain = parseFloat(acc.gain || "0") >= 0;

                                      return (
                                        <tr key={acc.id} className="border-b border-slate-100 last:border-0">
                                          <td className="py-2.5">
                                            <div className="font-semibold text-slate-700">{acc.name}</div>
                                            {acc.number && <div className="text-[10px] font-mono text-slate-400">{acc.number}</div>}
                                          </td>
                                          <td className="py-2.5 text-right font-mono font-bold text-slate-700">{formatCurrency(acc.totalValue)}</td>
                                          <td className="py-2.5 text-right">
                                            <div className="font-mono text-slate-600">{formatCurrency(acc.cashValue)}</div>
                                            <div className="text-[8px] font-bold text-slate-400 uppercase">{accCashPercent}%</div>
                                          </td>
                                          <td className="py-2.5 text-right">
                                            <div className="font-mono text-slate-600">{formatCurrency(acc.investmentValue)}</div>
                                            <div className="text-[8px] font-bold text-slate-400 uppercase">{accInvPercent}%</div>
                                          </td>
                                          <td className="py-2.5 text-right font-mono text-slate-500 text-[10px]">{formatCurrency(acc.totalCost || "0")}</td>
                                          <td className={`py-2.5 text-right font-mono text-[10px] font-bold ${accIsGain ? "text-green-600" : "text-red-600"}`}>
                                            {accIsGain ? "+" : ""}{formatCurrency(acc.gain || "0")}
                                          </td>
                                          <td className={`py-2.5 text-right font-mono text-[10px] font-bold ${accIsGain ? "text-green-600" : "text-red-600"}`}>
                                            {accIsGain ? "+" : ""}{acc.gainPercent || "0.00"}%
                                          </td>
                                        </tr>
                                      );
                                    })}
                                    <tr className="bg-slate-100/50 font-bold border-t border-slate-200">
                                      <td className="py-2.5 px-2 uppercase text-[10px] tracking-widest text-slate-500">Portfolio Totals</td>
                                      <td className="py-2.5 text-right font-mono text-primary">{formatCurrency(portfolio.totalValue)}</td>
                                      <td className="py-2.5 text-right">
                                        <div className="font-mono text-slate-700">{formatCurrency(portfolio.cashValue)}</div>
                                        <div className="text-[8px] font-bold text-slate-400 uppercase">{pCashPercent}%</div>
                                      </td>
                                      <td className="py-2.5 text-right">
                                        <div className="font-mono text-slate-700">{formatCurrency(portfolio.investmentValue)}</div>
                                        <div className="text-[8px] font-bold text-slate-400 uppercase">{pInvPercent}%</div>
                                      </td>
                                      <td className="py-2.5 text-right font-mono text-slate-500 text-[10px]">{formatCurrency(portfolio.totalCost || "0")}</td>
                                      <td className={`py-2.5 text-right font-mono text-[10px] font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                                        {isGain ? "+" : ""}{formatCurrency(portfolio.gain || "0")}
                                      </td>
                                      <td className={`py-2.5 text-right font-mono text-[10px] font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                                        {isGain ? "+" : ""}{portfolio.gainPercent || "0.00"}%
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </motion.div>
                          </td>
                        </tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100/80 font-bold border-t-2 border-slate-200">
                <td colSpan={2} className="py-5 px-4 uppercase text-xs tracking-widest text-slate-600">Consolidated Totals</td>
                <td className="py-5 px-4 text-right font-mono text-xl text-primary">{formatCurrency(totals.overall)}</td>
                <td className="py-5 px-4 text-right">
                  <div className="font-mono text-lg text-slate-700">{formatCurrency(totals.cash)}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{totals.cashPercent}%</div>
                </td>
                <td className="py-5 px-4 text-right">
                  <div className="font-mono text-lg text-slate-800">{formatCurrency(totals.investment)}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{totals.investmentPercent}%</div>
                </td>
                <td className="py-5 px-4 text-right font-mono text-slate-500 text-sm">{formatCurrency(totals.totalCost)}</td>
                <td className={`py-5 px-4 text-right font-mono text-sm ${parseFloat(totals.gain.toString()) >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {parseFloat(totals.gain.toString()) >= 0 ? "+" : ""}{formatCurrency(totals.gain)}
                </td>
                <td className={`py-5 px-4 text-right font-mono text-sm ${parseFloat(totals.gain.toString()) >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {parseFloat(totals.gain.toString()) >= 0 ? "+" : ""}{totals.gainPercent}%
                </td>
                <td className="py-5 px-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <Card className="bg-white border-none shadow-sm shadow-slate-200/50">
        <CardHeader className="pb-4 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <List className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-widest">All Investment Assets</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updatePricesMutation.mutate({ portfolioId: portfolioFilter === "all" ? undefined : parseInt(portfolioFilter) })}
              disabled={updatePricesMutation.isPending}
              className="h-7 border-slate-200 hover:bg-slate-50 text-[10px] font-bold uppercase tracking-wider px-3"
            >
              <RefreshCw className={`mr-1.5 h-3 w-3 ${updatePricesMutation.isPending ? "animate-spin" : ""}`} />
              {updatePricesMutation.isPending ? "Updating..." : "Update Prices"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter:</span>
            <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
              <SelectTrigger className="h-7 text-[10px] font-bold uppercase tracking-wider min-w-[140px] bg-slate-50 border-slate-200">
                <SelectValue placeholder="All Portfolios" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[10px] font-bold uppercase">All Portfolios</SelectItem>
                {portfolios?.map(p => (
                  <SelectItem key={p.id} value={p.id.toString()} className="text-[10px] font-bold uppercase">
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Asset</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Quantity</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Avg Cost</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Cost</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Current Price</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Mkt Value</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gain/Loss</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gain/Loss %</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Annual Div/Share</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Yield %</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Annual Div</th>
                </tr>
              </thead>
              <tbody>
                {consolidatedHoldings.length > 0 ? (
                  consolidatedHoldings.map((asset) => {
                    const isGain = asset.gainLoss >= 0;
                    return (
                      <tr key={asset.symbol} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800">{asset.symbol}</div>
                          <div className="text-[10px] text-slate-400 font-medium truncate max-w-[150px]">{asset.name}</div>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium text-slate-700">{asset.quantity.toFixed(3)}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-500 text-xs">{formatCurrency(asset.avgCost)}</td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600 text-xs">{formatCurrency(asset.totalCost)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-slate-700">{formatCurrency(asset.currentPrice)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-primary">{formatCurrency(asset.mktValue)}</td>
                        <td className={`py-3 px-4 text-right font-mono text-xs font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                          {isGain ? "+" : ""}{formatCurrency(asset.gainLoss)}
                        </td>
                        <td className={`py-3 px-4 text-right font-mono text-xs font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                          {isGain ? "+" : ""}{asset.gainLossPercent.toFixed(2)}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-xs text-slate-600">{formatCurrency(asset.annualDividendPerShare)}</td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-medium text-blue-600">{asset.divYield.toFixed(2)}%</td>
                        <td className="py-3 px-4 text-right font-mono text-xs font-bold text-blue-600">{formatCurrency(asset.projectedDividend)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-slate-400 italic text-sm">
                      No investment assets found.
                    </td>
                  </tr>
                )}
              </tbody>
              {consolidatedHoldings.length > 0 && (
                <tfoot className="bg-slate-100/50 font-bold border-t-2 border-slate-200">
                  <tr>
                    <td colSpan={3} className="py-4 px-4 uppercase text-[10px] tracking-widest text-slate-500">Consolidated Assets Totals</td>
                    <td className="py-4 px-4 text-right font-mono text-xs text-slate-700">{formatCurrency(tableTotals.totalCost)}</td>
                    <td className="py-4 px-4 text-right"></td>
                    <td className="py-4 px-4 text-right font-mono text-sm text-primary">{formatCurrency(tableTotals.mktValue)}</td>
                    <td className={`py-4 px-4 text-right font-mono text-xs ${tableTotals.gainLoss >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {tableTotals.gainLoss >= 0 ? "+" : ""}{formatCurrency(tableTotals.gainLoss)}
                    </td>
                    <td className={`py-4 px-4 text-right font-mono text-xs ${tableTotals.gainLoss >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {tableTotals.gainLoss >= 0 ? "+" : ""}{(tableTotals.totalCost > 0 ? (tableTotals.gainLoss / tableTotals.totalCost) * 100 : 0).toFixed(2)}%
                    </td>
                    <td className="py-4 px-4 text-right"></td>
                    <td className="py-4 px-4 text-right font-mono text-xs font-medium text-blue-700">
                      {(tableTotals.mktValue > 0 ? (tableTotals.projectedDividend / tableTotals.mktValue) * 100 : 0).toFixed(2)}%
                    </td>
                    <td className="py-4 px-4 text-right font-mono text-sm text-blue-700">{formatCurrency(tableTotals.projectedDividend)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {monthlyChartData.length > 0 && (
        <Card className="bg-white border-none shadow-sm shadow-slate-200/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-widest">Portfolio Value History (12 Months)</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter:</span>
              <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
                <SelectTrigger className="h-7 text-[10px] font-bold uppercase tracking-wider min-w-[140px] bg-slate-50 border-slate-200">
                  <SelectValue placeholder="All Portfolios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[10px] font-bold uppercase">All Portfolios</SelectItem>
                  {portfolios?.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()} className="text-[10px] font-bold uppercase">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[300px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="displayDate"
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                      fontSize: "12px",
                    }}
                    cursor={{ fill: '#f8fafc' }}
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const investment = payload.find(p => p.dataKey === 'investment')?.value as number || 0;
                        const cash = payload.find(p => p.dataKey === 'cash')?.value as number || 0;
                        const total = investment + cash;

                        return (
                          <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg space-y-1.5">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 border-b pb-1">{label}</p>
                            <div className="flex justify-between gap-8 items-center">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">Investments</span>
                              <span className="font-mono font-bold text-primary">{formatCurrency(investment)}</span>
                            </div>
                            <div className="flex justify-between gap-8 items-center">
                              <span className="text-[10px] font-bold text-slate-500 uppercase">Cash</span>
                              <span className="font-mono font-bold text-slate-600">{formatCurrency(cash)}</span>
                            </div>
                            <div className="flex justify-between gap-8 items-center pt-1 mt-1 border-t border-slate-100">
                              <span className="text-[10px] font-bold text-slate-800 uppercase">Total Value</span>
                              <span className="font-mono font-bold text-slate-800">{formatCurrency(total)}</span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: '20px' }}
                  />
                  <Bar dataKey="investment" name="Investments" stackId="a" fill="#004a99" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="cash" name="Cash" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {yearlyPerformance && yearlyPerformance.length > 0 && (
        <Card className="bg-white border-none shadow-sm shadow-slate-200/50">
          <CardHeader className="pb-4 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <CalendarPlus className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-widest">Yearly Performance Summary</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter:</span>
              <Select value={portfolioFilter} onValueChange={setPortfolioFilter}>
                <SelectTrigger className="h-7 text-[10px] font-bold uppercase tracking-wider min-w-[140px] bg-slate-50 border-slate-200">
                  <SelectValue placeholder="All Portfolios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-[10px] font-bold uppercase">All Portfolios</SelectItem>
                  {portfolios?.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()} className="text-[10px] font-bold uppercase">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Year</th>
                    <th className="text-right py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Cost Basis</th>
                    <th className="text-right py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Start Val.</th>
                    <th className="text-right py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Purchases</th>
                    <th className="text-right py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">End Bal.</th>
                    <th className="text-right py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Cash</th>
                    <th className="text-right py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Total</th>
                    <th className="text-right py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Gain/Loss</th>
                    <th className="text-right py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Total %</th>
                    <th className="text-right py-2 px-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Annual %</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyPerformance.map((row: any) => {
                    const gainNum = parseFloat(row.gainLoss);
                    const isPositive = gainNum >= 0;
                    const annualReturnNum = parseFloat(row.annualReturnPercent);
                    const isAnnualPositive = annualReturnNum >= 0;
                    const isCurrentYear = row.year === new Date().getFullYear();

                    return (
                      <tr key={row.year} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-2 font-bold text-slate-800 text-sm">{row.year}</td>
                        <td className="py-3 px-2 text-right font-mono text-slate-600 text-[11px]">{formatCurrency(row.costBasis)}</td>
                        <td className="py-3 px-2 text-right font-mono text-slate-600 text-[11px]">{formatCurrency(row.startInvestment)}</td>
                        <td className="py-3 px-2 text-right font-mono text-slate-600 text-[11px]">{formatCurrency(row.purchasesInYear)}</td>
                        <td className="py-3 px-2 text-right font-mono text-slate-600 text-[11px]">
                          <div className="flex flex-col items-end">
                            <span>{formatCurrency(row.investment)}</span>
                            {isCurrentYear && <span className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter leading-none">Current</span>}
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right font-mono text-slate-600 text-[11px]">{formatCurrency(row.cash)}</td>
                        <td className="py-3 px-2 text-right font-mono font-bold text-slate-800 text-[11px]">{formatCurrency(row.total)}</td>
                        <td className={`py-3 px-2 text-right font-mono font-bold text-[11px] ${isPositive ? "text-green-600" : "text-red-600"}`}>
                          {isPositive ? "+" : ""}{formatCurrency(row.gainLoss)}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${isPositive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                            {isPositive ? "+" : ""}{row.gainLossPercent}%
                          </span>
                        </td>
                        <td className="py-3 px-2 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${isAnnualPositive ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>
                            {isAnnualPositive ? "+" : ""}{row.annualReturnPercent}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparative Dividend Analysis */}
      <Card className="bg-white shadow-sm border border-border overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-border py-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-widest">Consolidated Year-over-Year Dividend Analysis</CardTitle>
          </div>
        </CardHeader>
        <div className="overflow-x-auto">
          {isLoadingDividends ? (
            <div className="py-20 text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-4 opacity-50" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Calculating Consolidated Dividends...</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-border text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <th className="text-left py-3 px-6">Asset</th>
                  <th className="text-right py-3 px-6 text-blue-600">{dividendReport?.currentQuarterKey || "Current Qtr"} (Est)</th>
                  <th className="text-right py-3 px-6">{dividendReport?.targetQuarterKey || "Last Quarter"}</th>
                  <th className="text-right py-3 px-6">{dividendReport?.priorYearQuarterKey || "Prior Year"}</th>
                  <th className="text-center py-3 px-6">QoQ Growth %</th>
                  <th className="text-right py-3 px-6">L12M Total</th>
                  <th className="text-right py-3 px-6">P12M Total</th>
                  <th className="text-center py-3 px-6">YoY Growth %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {dividendReport?.etfBreakdown.map((asset: any) => {
                  const growthNum = parseFloat(asset.growthPercent);
                  const isGrowthPositive = growthNum >= 0;
                  const yearlyGrowthNum = parseFloat(asset.yearlyGrowthPercent);
                  const isYearlyGrowthPositive = yearlyGrowthNum >= 0;
                  
                  return (
                    <tr key={asset.symbol} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-6 font-bold text-slate-700">{asset.symbol}</td>
                      <td className="py-4 px-6 text-right">
                        <div className="font-mono font-bold text-blue-600">{formatCurrency(asset.currentEstimatedQuarterly)}</div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="font-mono font-bold text-slate-800">{formatCurrency(asset.latestAmount)}</div>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <div className="font-mono text-slate-600">{formatCurrency(asset.priorAmount)}</div>
                      </td>
                      <td className={`py-4 px-6 text-center`}>
                        <span className={`px-2 py-1 rounded text-[10px] font-bold font-mono ${isGrowthPositive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {isGrowthPositive ? "+" : ""}{asset.growthPercent}%
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-slate-700 font-bold">
                        {formatCurrency(asset.totalLastYear)}
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-slate-500">
                        {formatCurrency(asset.totalPriorYear)}
                      </td>
                      <td className={`py-4 px-6 text-center`}>
                        <span className={`px-2 py-1 rounded text-[10px] font-bold font-mono ${isYearlyGrowthPositive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {isYearlyGrowthPositive ? "+" : ""}{asset.yearlyGrowthPercent}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {dividendReport?.consolidatedComparative && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                  <tr className="font-bold text-slate-800">
                    <td className="py-4 px-6 uppercase text-[10px] tracking-widest text-slate-500">Portfolio Totals</td>
                    <td className="text-right py-4 px-6 font-mono text-sm text-blue-600">
                      {formatCurrency(dividendReport.consolidatedComparative.currentEstimatedQuarterly)}
                    </td>
                    <td className="text-right py-4 px-6 font-mono text-sm text-primary">
                      {formatCurrency(dividendReport.consolidatedComparative.latestAmount)}
                    </td>
                    <td className="text-right py-4 px-6 font-mono text-sm text-slate-600">
                      {formatCurrency(dividendReport.consolidatedComparative.priorAmount)}
                    </td>
                    <td className="text-center py-4 px-6">
                      <span className={`px-3 py-1 rounded text-xs font-bold font-mono ${parseFloat(dividendReport.consolidatedComparative.growthPercent) >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        {parseFloat(dividendReport.consolidatedComparative.growthPercent) >= 0 ? "+" : ""}
                        {dividendReport.consolidatedComparative.growthPercent}%
                      </span>
                    </td>
                    <td className="text-right py-4 px-6 font-mono text-sm text-slate-800">
                      {formatCurrency(dividendReport.consolidatedComparative.totalLastYear)}
                    </td>
                    <td className="text-right py-4 px-6 font-mono text-sm text-slate-500">
                      {formatCurrency(dividendReport.consolidatedComparative.totalPriorYear)}
                    </td>
                    <td className="text-center py-4 px-6">
                      <span className={`px-3 py-1 rounded text-xs font-bold font-mono ${parseFloat(dividendReport.consolidatedComparative.yearlyGrowthPercent) >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                        {parseFloat(dividendReport.consolidatedComparative.yearlyGrowthPercent) >= 0 ? "+" : ""}
                        {dividendReport.consolidatedComparative.yearlyGrowthPercent}%
                      </span>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>
      </Card>

      {/* Rename Dialog */}
      <Dialog open={!!editingPortfolio} onOpenChange={() => setEditingPortfolio(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Portfolio</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">New Portfolio Name</label>
              <Input
                value={editingPortfolio?.name || ""}
                onChange={(e) => setEditingPortfolio(prev => prev ? { ...prev, name: e.target.value } : null)}
                placeholder="Enter portfolio name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingPortfolio(null)}>Cancel</Button>
            <Button
              onClick={() => editingPortfolio && updatePortfolioMutation.mutate({
                portfolioId: editingPortfolio.id,
                name: editingPortfolio.name
              })}
              disabled={!editingPortfolio?.name}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!isDeleteDialogOpen} onOpenChange={() => setIsDeleteDialogOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Delete Portfolio?</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-slate-600 leading-relaxed">
              Are you sure you want to delete this portfolio and <strong className="text-red-600">ALL its accounts, holdings, and transaction history?</strong> This action is irreversible.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => isDeleteDialogOpen && deletePortfolioMutation.mutate({
                portfolioId: isDeleteDialogOpen
              })}
            >
              Delete Everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Portfolios;
