import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Briefcase, ChevronDown, ChevronRight, Edit2, Trash2, PieChart, Wallet, DollarSign, Plus, BarChart3, CalendarPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const Portfolios: React.FC = () => {
  const utils = trpc.useUtils();
  const { data: portfolios, isLoading, refetch } = trpc.portfolio.getDetailedAll.useQuery();
  const { data: historyData } = trpc.portfolio.getHistory.useQuery({ days: 1825 });

  const [expandedPortfolios, setExpandedPortfolios] = useState<Set<number>>(new Set());
  const [portfolioFilter, setPortfolioFilter] = useState<string>("all");

  // Aggregate yearly performance for the last 5 years
  const yearlyData = useMemo(() => {
    if (!historyData || !portfolios) return [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
    const result = [];
    const filterId = portfolioFilter === "all" ? null : parseInt(portfolioFilter);

    for (const year of years) {
      const isCurrentYear = year === currentYear;
      const endDate = isCurrentYear ? now : new Date(year, 11, 31, 23, 59, 59);

      // Calculate Cash at year end
      const latestAccountCash: Record<number, number> = {};
      if (isCurrentYear) {
        portfolios.forEach(p => {
          if (filterId !== null && p.id !== filterId) return;
          p.accounts.forEach((acc: any) => {
            latestAccountCash[acc.id] = parseFloat(acc.cashValue);
          });
        });
      } else {
        // historyData.cashHistory is sorted desc
        historyData.cashHistory.forEach((record: any) => {
          if (filterId !== null && record.portfolioId !== filterId) return;
          const recordDate = new Date(record.date);
          if (recordDate <= endDate) {
            if (latestAccountCash[record.accountId] === undefined) {
              latestAccountCash[record.accountId] = parseFloat(record.amount);
            }
          }
        });
      }
      const totalCash = Object.values(latestAccountCash).reduce((sum, val) => sum + val, 0);

      // Calculate Investment at year end
      let totalInv = 0;
      if (isCurrentYear) {
        portfolios.forEach(p => {
          if (filterId !== null && p.id !== filterId) return;
          totalInv += parseFloat(p.investmentValue);
        });
      } else {
        historyData.purchases.forEach((p: any) => {
          if (filterId !== null && p.portfolioId !== filterId) return;
          const purchaseDate = new Date(p.purchaseDate);
          if (purchaseDate <= endDate) {
            totalInv += parseFloat(p.quantity) * parseFloat(p.price);
          }
        });
      }

      const total = totalCash + totalInv;
      if (total > 0) {
        result.push({
          year,
          cash: totalCash,
          investment: totalInv,
          total
        });
      }
    }
    return result;
  }, [historyData, portfolios, portfolioFilter]);

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

    // Map to find current price for each symbol
    const symbolPriceMap: Record<string, number> = {};
    historyData.holdings.forEach((h: any) => {
      symbolPriceMap[h.symbol] = parseFloat(h.currentPrice);
    });

    months.forEach((monthKey, idx) => {
      const isLastMonth = idx === months.length - 1;
      const [year, month] = monthKey.split('-').map(Number);
      const monthEndDate = isLastMonth ? new Date() : new Date(year, month, 0, 23, 59, 59);

      // 1. Calculate Cash at month end
      const latestAccountCash: Record<number, number> = {};

      if (isLastMonth) {
        // Use current portfolios data for absolute consistency with the table above
        portfolios.forEach(p => {
          if (filterId !== null && p.id !== filterId) return;
          p.accounts.forEach((acc: any) => {
            latestAccountCash[acc.id] = parseFloat(acc.cashValue);
          });
        });
      } else {
        historyData.cashHistory.forEach((record: any) => {
          if (filterId !== null && record.portfolioId !== filterId) return;

          const recordDate = new Date(record.date);
          if (recordDate <= monthEndDate) {
            if (latestAccountCash[record.accountId] === undefined) {
              latestAccountCash[record.accountId] = parseFloat(record.amount);
            }
          }
        });
      }

      const totalCash = Object.values(latestAccountCash).reduce((sum, val) => sum + val, 0);

      // 2. Calculate Investment at month end
      let totalInv = 0;
      if (isLastMonth) {
        // Use current portfolios data for absolute consistency
        portfolios.forEach(p => {
          if (filterId !== null && p.id !== filterId) return;
          totalInv += parseFloat(p.investmentValue);
        });
      } else {
        historyData.purchases.forEach((p: any) => {
          if (filterId !== null && p.portfolioId !== filterId) return;

          const purchaseDate = new Date(p.purchaseDate);
          if (purchaseDate <= monthEndDate) {
            // For historical months, we use cost basis as we don't have historical market prices easily
            // But if we have the current price, it's at least one price point.
            // Using cost basis (p.price) is actually more "historical" than using current price for the past.
            totalInv += parseFloat(p.quantity) * parseFloat(p.price);
          }
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
                      <td className="py-4 px-4 font-bold text-slate-800">{portfolio.name}</td>
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

      {yearlyData.length > 0 && (
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
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Year</th>
                    <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Investments</th>
                    <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Cash</th>
                    <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {yearlyData.map((row) => (
                    <tr key={row.year} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-800">{row.year}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">{formatCurrency(row.investment)}</td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600">{formatCurrency(row.cash)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-primary">{formatCurrency(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

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
