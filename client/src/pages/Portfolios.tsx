import React, { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency, truncateNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Briefcase, ChevronDown, ChevronRight, Edit2, Trash2, PieChart, Wallet, DollarSign, Plus, BarChart3, Calendar, CalendarPlus, List, RefreshCw, TrendingUp, ArrowRightLeft, Landmark } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { AccountTypeAllocationChart, CHART_COLORS } from "./Portfolio";
import IncomeTab from "./IncomeTab";

interface PortfoliosProps {
  onPortfolioSelect?: (id: number) => void;
}

const Portfolios: React.FC<PortfoliosProps> = ({ onPortfolioSelect }) => {
  const utils = trpc.useUtils();
  const { data: portfolios, isLoading, refetch } = trpc.portfolio.getDetailedAll.useQuery();
  const { data: historyData } = trpc.portfolio.getHistory.useQuery({ days: 1825 });
  const { data: allHoldings } = trpc.portfolio.getAllHoldings.useQuery();
  const [expandedPortfolios, setExpandedPortfolios] = useState<Set<number>>(new Set());
  const [portfolioFilter, setPortfolioFilter] = useState<string[]>(()=>{ try{ const s=localStorage.getItem("portfolios:portfolioFilter"); if(s){ const v=JSON.parse(s); if(Array.isArray(v)) return v; if(typeof v==="string") return [v]; } }catch{} return ["all"]; });
  const _setPortfolioFilter = (v: string[]) => { setPortfolioFilter(v); try{ localStorage.setItem("portfolios:portfolioFilter", JSON.stringify(v)); }catch{} };
  const [currencyFilter, setCurrencyFilter] = useState<string>(()=>{ try{ const s=localStorage.getItem("portfolios:currencyFilter"); if(s) return JSON.parse(s); }catch{} return "all"; });
  const _setCurrencyFilter = (v: string) => { setCurrencyFilter(v); try{ localStorage.setItem("portfolios:currencyFilter", JSON.stringify(v)); }catch{} };
  const distinctCurrencies = Array.from(new Set((portfolios || []).map((p:any)=>(p as any).baseCurrency || "USD"))).sort();
  const isPortfolioSelected = (id: number | string) => portfolioFilter.includes("all") || portfolioFilter.includes(id.toString());
  const { data: incomeTable } = trpc.etf.getIncomeTable.useQuery(
    { portfolioId: portfolioFilter.includes("all") ? undefined : parseInt(portfolioFilter[0]), portfolioIds: portfolioFilter.includes("all") ? undefined : portfolioFilter.map(id=> parseInt(id)) } as any
  );

  const [dashboardRange, setDashboardRange] = useState<string>("cm");
  const [isAddPortfolioOpen, setIsAddPortfolioOpen] = useState(false);
  const [dashboardTab, setDashboardTab] = useState<"dashboard"|"income">("dashboard");

  const rangeOptions = useMemo(() => {
    const options = [
      { label: "Current Week", value: "cw" },
      { label: "Current Month", value: "cm" },
      { label: "Past 10 Days", value: "10d" },
      { label: "Past 30 Days", value: "30d" },
      { label: "Past 60 Days", value: "60d" },
      { label: "Past 90 Days", value: "90d" },
      { label: "Year to Date", value: "ytd" },
      { label: "Past 1 Year", value: "1y" },
    ];
    const prevYear = new Date().getFullYear() - 1;
    for (let q = 4; q >= 1; q--) {
      options.push({ label: `Q${q} ${prevYear}`, value: `${prevYear}Q${q}` });
    }
    return options;
  }, []);

  const { data: dashboardActivities, isLoading: isActivitiesLoading } = trpc.etf.getInvestmentActivities.useQuery(
    { 
      portfolioId: portfolioFilter.includes("all") || portfolioFilter.length !== 1 ? undefined : parseInt(portfolioFilter[0]),
      portfolioIds: portfolioFilter.includes("all") ? undefined : portfolioFilter.map(id=> parseInt(id)),
      range: dashboardRange
    }
  );
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
    portfolioId: portfolioFilter.includes("all") || portfolioFilter.length !== 1 ? undefined : parseInt(portfolioFilter[0]),
    portfolioIds: portfolioFilter.includes("all") ? undefined : portfolioFilter.map(id=> parseInt(id))
  });

  const { data: dividendReport, isLoading: isLoadingDividends } = trpc.etf.getDetailedDividendReport.useQuery(
    { portfolioId: portfolioFilter.includes("all") || portfolioFilter.length !== 1 ? undefined : parseInt(portfolioFilter[0]), portfolioIds: portfolioFilter.includes("all") ? undefined : portfolioFilter.map(id=> parseInt(id)) }
  );

  const [divFocusSymbol, setDivFocusSymbol] = useState<string>("ALL");

  useEffect(() => {
    setDivFocusSymbol("ALL");
  }, [portfolioFilter]);

  // Group history by quarter for dividend bar chart (last 5 years only)
  const dividendBarChartData = useMemo(() => {
    if (!dividendReport?.history) return [];
    
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

    const filtered = (divFocusSymbol === "ALL" 
      ? dividendReport.history 
      : dividendReport.history.filter((h: any) => h.symbol === divFocusSymbol))
      .filter((h: any) => new Date(h.exDate) >= fiveYearsAgo);
      
    const grouped: Record<string, number> = {};
    
    filtered.forEach((div: any) => {
      const date = new Date(div.exDate);
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      const key = `${date.getFullYear()} Q${quarter}`;
      grouped[key] = (grouped[key] || 0) + div.totalAmount;
    });
    
    const sortedEntries = Object.entries(grouped)
      .map(([quarterKey, amount]) => ({ 
        date: quarterKey, 
        amount: parseFloat(amount.toFixed(2)),
        displayDate: quarterKey,
        changePercent: null as number | null
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    for (let i = 1; i < sortedEntries.length; i++) {
      const prevAmount = sortedEntries[i - 1].amount;
      const currAmount = sortedEntries[i].amount;
      if (prevAmount > 0) {
        sortedEntries[i].changePercent = ((currAmount - prevAmount) / prevAmount) * 100;
      }
    }

    return sortedEntries;
  }, [dividendReport?.history, divFocusSymbol]);


  // Aggregate consolidated holdings by asset
  const consolidatedHoldings = useMemo(() => {
    if (!allHoldings) return [];

    const isAllHold = portfolioFilter.includes("all");
    const isConsolidatedHold = isAllHold || portfolioFilter.length > 1;
    const filterId = isAllHold ? null : parseInt(portfolioFilter[0]);
    const currencyFilteredHoldings = currencyFilter === "all" ? allHoldings : (allHoldings as any[]).filter((h:any)=> ((h as any).baseCurrency || "USD") === currencyFilter);
    const assetMap: Record<string, { 
      symbol: string, 
      name: string, 
      quantity: number, 
      totalCost: number, 
      currentPrice: number,
      annualDividendPerShare: number
    }> = {};

    let totalMktValue = 0;

    currencyFilteredHoldings.forEach((h: any) => {
      if (!isPortfolioSelected(h.portfolioId)) return;

      if (!assetMap[h.symbol]) {
        assetMap[h.symbol] = {
          symbol: h.symbol,
          name: h.name,
          quantity: 0,
          totalCost: 0,
          currentPrice: parseFloat(h.currentPrice),
          annualDividendPerShare: h.annualDividendPerShare || 0,
          couponRate: (h as any).couponRate || "0",
          assetType: (h as any).assetType || "etf"
        } as any;
      }

      const isConsolidated = isConsolidatedHold;
      const qty = parseFloat(h.quantity);
      const priceUSD = (h as any).currentPriceUSD ? parseFloat((h as any).currentPriceUSD) : parseFloat(h.currentPrice);
      const purchaseUSD = (h as any).purchasePriceUSD ? parseFloat((h as any).purchasePriceUSD) : parseFloat(h.purchasePrice);
      const usePrice = isConsolidated ? priceUSD : parseFloat(h.currentPrice);
      const usePurchase = isConsolidated ? purchaseUSD : parseFloat(h.purchasePrice);
      
      assetMap[h.symbol].quantity += qty;
      assetMap[h.symbol].totalCost += qty * usePurchase;
      assetMap[h.symbol].currentPrice = usePrice;
      // Keep highest couponRate for bonds (should be same per CUSIP) and preserve assetType
      if ((h as any).couponRate) (assetMap[h.symbol] as any).couponRate = (h as any).couponRate;
      if ((h as any).assetType === "bond") (assetMap[h.symbol] as any).assetType = "bond";
      totalMktValue += truncateNumber(qty * usePrice);
    });

    const allMapped = Object.values(assetMap).map((asset: any) => {
      const mktValue = truncateNumber(asset.quantity * asset.currentPrice);
      const gainLoss = mktValue - asset.totalCost;
      const gainLossPercent = asset.totalCost > 0 ? (gainLoss / asset.totalCost) * 100 : 0;
      const avgCost = asset.quantity > 0 ? asset.totalCost / asset.quantity : 0;
      const isBond = asset.assetType === "bond" || parseFloat(asset.couponRate || "0") > 0;
      const annualRate = isBond ? parseFloat(asset.couponRate || "0") : asset.annualDividendPerShare;
      const projectedDividend = asset.quantity * annualRate;
      const divYield = isBond ? (avgCost > 0 ? (annualRate / avgCost) * 100 : 0) : (asset.currentPrice > 0 ? (annualRate / asset.currentPrice) * 100 : 0);
      const allocation = totalMktValue > 0 ? (mktValue / totalMktValue) * 100 : 0;

      return {
        ...asset,
        avgCost,
        mktValue,
        gainLoss,
        gainLossPercent,
        projectedDividend,
        divYield,
        allocation
      };
    });
    // Group all bonds into single "Bonds" asset for dashboard
    const equities = allMapped.filter((a:any) => a.assetType !== "bond");
    const bonds = allMapped.filter((a:any) => a.assetType === "bond");
    if (bonds.length > 0) {
      const bondQty = bonds.reduce((s:any,b:any)=> s + b.quantity, 0);
      const bondCost = bonds.reduce((s:any,b:any)=> s + b.totalCost, 0);
      const bondMkt = bonds.reduce((s:any,b:any)=> s + b.mktValue, 0);
      const bondProj = bonds.reduce((s:any,b:any)=> s + b.projectedDividend, 0);
      const bondAvgPrice = bondQty > 0 ? bondMkt / bondQty : 0;
      const bondAvgCost = bondQty > 0 ? bondCost / bondQty : 0;
      const bondGain = bondMkt - bondCost;
      const bondGainPct = bondCost > 0 ? (bondGain / bondCost) * 100 : 0;
      const bondYield = bondAvgCost > 0 ? ((bondProj / bondQty) / bondAvgCost * 100) : 0;
      const bondAlloc = totalMktValue > 0 ? (bondMkt / totalMktValue) * 100 : 0;
      equities.push({
        symbol: "Bonds",
        name: `${bonds.length} Treasuries/Bonds`,
        quantity: bondQty,
        totalCost: bondCost,
        currentPrice: bondAvgPrice,
        avgCost: bondAvgCost,
        mktValue: bondMkt,
        gainLoss: bondGain,
        gainLossPercent: bondGainPct,
        annualDividendPerShare: bondQty > 0 ? bondProj / bondQty : 0,
        couponRate: bondQty > 0 ? (bondProj / bondQty).toFixed(3) : "0",
        projectedDividend: bondProj,
        divYield: bondYield,
        allocation: bondAlloc,
        assetType: "bond"
      });
    }
    return [...equities].sort((a, b) => b.mktValue - a.mktValue);
  }, [allHoldings, portfolioFilter, currencyFilter]);

  const tableTotals = useMemo(() => {
    const totals = consolidatedHoldings.reduce((acc, curr) => ({
      totalCost: acc.totalCost + curr.totalCost,
      mktValue: acc.mktValue + curr.mktValue,
      gainLoss: acc.gainLoss + curr.gainLoss,
      projectedDividend: acc.projectedDividend + curr.projectedDividend
    }), { totalCost: 0, mktValue: 0, gainLoss: 0, projectedDividend: 0 });

    return {
      totalCost: truncateNumber(totals.totalCost),
      mktValue: truncateNumber(totals.mktValue),
      gainLoss: truncateNumber(totals.gainLoss),
      projectedDividend: truncateNumber(totals.projectedDividend)
    };
  }, [consolidatedHoldings]);

  const assetAndCashAllocation = useMemo(() => {
    if (!portfolios || !consolidatedHoldings) return [];

    const isAll2 = portfolioFilter.includes("all");
    const isConsolidated2 = isAll2 || portfolioFilter.length > 1;
    
    const useUSD2 = isConsolidated2;
    const cashPortfolios = (portfolios || []).filter((p:any)=> (currencyFilter==="all" || (p as any).baseCurrency===currencyFilter) && isPortfolioSelected(p.id));
    const totalCash = cashPortfolios.reduce((acc, p) => {
      const v = useUSD2 && (p as any).cashValueUSD ? (p as any).cashValueUSD : p.cashValue;
      return acc + parseFloat(v);
    }, 0);

    const totalInvestments = consolidatedHoldings.reduce((acc, h) => acc + h.mktValue, 0);
    const grandTotal = totalInvestments + totalCash;

    const data: Array<{
      name: string;
      fullName: string;
      value: number;
      quantity: number | null;
      allocation: number;
      type: string;
    }> = consolidatedHoldings.map(h => ({
      name: h.symbol,
      fullName: h.name,
      value: h.mktValue,
      quantity: h.quantity,
      allocation: grandTotal > 0 ? (h.mktValue / grandTotal) * 100 : 0,
      type: 'Asset'
    }));

    if (totalCash > 0) {
      data.push({
        name: 'Cash',
        fullName: 'Available Liquidity',
        value: totalCash,
        quantity: null,
        allocation: grandTotal > 0 ? (totalCash / grandTotal) * 100 : 0,
        type: 'Cash'
      });
    }

    return data.sort((a, b) => b.value - a.value);
  }, [portfolios, consolidatedHoldings, portfolioFilter, currencyFilter]);

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

    months.forEach((monthKey, idx) => {
      const isLastMonth = idx === months.length - 1;
      const [year, month] = monthKey.split('-').map(Number);
      const monthEndDate = isLastMonth ? new Date() : new Date(year, month, 0, 23, 59, 59);

      // 1. Calculate Cash at month end
      const latestAccountCash: Record<string, number> = {};

      if (isLastMonth) {
        portfolios.forEach(p => {
          if (!isPortfolioSelected(p.id)) return;
          p.accounts.forEach((acc: any) => {
            latestAccountCash[`${p.id}-${acc.id}`] = parseFloat(acc.cashValue);
          });
        });
      } else {
        historyData.cashHistory.forEach((record: any) => {
          if (!isPortfolioSelected(record.portfolioId)) return;
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
          if (!isPortfolioSelected(p.id)) return;
          totalInv += parseFloat(p.investmentValue);
        });
      } else {
        const symbolQty: Record<string, number> = {};
        historyData.purchases.forEach((p: any) => {
          if (!isPortfolioSelected(p.portfolioId)) return;
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

  const totals = useMemo(() => {
    if (!portfolios) return { investment: 0, equity: 0, fixedIncome: 0, cash: 0, overall: 0, totalCost: 0, gain: 0, gainPercent: "0", investmentPercent: "0", equityPercent: "0", fixedIncomePercent: "0", cashPercent: "0" };
    const filteredPortfolios = (portfolios || []).filter((p:any)=> (currencyFilter==="all" || (p as any).baseCurrency===currencyFilter) && isPortfolioSelected(p.id));
    const useUSD = portfolioFilter.includes("all") || portfolioFilter.length > 1;
    const investment = filteredPortfolios.reduce((acc, p) => acc + parseFloat(useUSD && (p as any).investmentValueUSD ? (p as any).investmentValueUSD : p.investmentValue), 0);
    const equity = filteredPortfolios.reduce((acc, p) => acc + parseFloat(useUSD && (p as any).equityInvestmentValueUSD ? (p as any).equityInvestmentValueUSD : ((p as any).equityInvestmentValue ?? p.investmentValue ?? "0")), 0);
    const fixedIncome = filteredPortfolios.reduce((acc, p) => acc + parseFloat(useUSD && (p as any).fixedIncomeInvestmentValueUSD ? (p as any).fixedIncomeInvestmentValueUSD : ((p as any).fixedIncomeInvestmentValue ?? "0")), 0);
    // fallback: if split not present, derive from investment
    const safeEquity = equity || investment - fixedIncome;
    const safeFixed = fixedIncome;
    const cash = filteredPortfolios.reduce((acc, p) => acc + parseFloat(useUSD && (p as any).cashValueUSD ? (p as any).cashValueUSD : p.cashValue), 0);
    const totalCost = filteredPortfolios.reduce((acc, p) => acc + parseFloat(useUSD && (p as any).totalCostUSD ? (p as any).totalCostUSD : (p.totalCost || "0")), 0);
    const overall = investment + cash;
    const gain = investment - totalCost;
    const gainPercent = totalCost > 0 ? ((gain / totalCost) * 100).toFixed(2) : "0.00";

    return {
      investment,
      equity: safeEquity,
      fixedIncome: safeFixed,
      cash,
      overall,
      totalCost,
      gain,
      gainPercent,
      investmentPercent: overall > 0 ? ((investment / overall) * 100).toFixed(1) : "0",
      equityPercent: overall > 0 ? ((safeEquity / overall) * 100).toFixed(1) : "0",
      fixedIncomePercent: overall > 0 ? ((safeFixed / overall) * 100).toFixed(1) : "0",
      cashPercent: overall > 0 ? ((cash / overall) * 100).toFixed(1) : "0",
    };
  }, [portfolios, currencyFilter, portfolioFilter]);

  const accountTypeBreakdown = useMemo(() => {
    if (!portfolios) return [];
    
    const typeMap = new Map<string, number>();
    let totalValueAcrossAll = 0;

    portfolios.forEach(p => {
      if (!isPortfolioSelected(p.id)) return;

      p.accounts.forEach((acc: any) => {
        const type = acc.accountType || "Brokerage";
        const val = parseFloat(acc.totalValue);
        typeMap.set(type, (typeMap.get(type) || 0) + val);
        totalValueAcrossAll += val;
      });
    });

    return Array.from(typeMap.entries()).map(([type, value]) => ({
      type,
      value: truncateNumber(value).toFixed(2),
      percentage: totalValueAcrossAll > 0 ? ((value / totalValueAcrossAll) * 100).toFixed(2) : "0",
    })).sort((a, b) => parseFloat(b.value) - parseFloat(a.value));
  }, [portfolios, portfolioFilter]);

  const assetClassBreakdown = useMemo(() => {
    if (!portfolios) return [];
    const total = totals.overall;
    return [
      { type: "Cash", value: totals.cash.toFixed(2), percentage: total > 0 ? ((totals.cash / total) * 100).toFixed(2) : "0" },
      { type: "Equities", value: totals.equity.toFixed(2), percentage: total > 0 ? ((totals.equity / total) * 100).toFixed(2) : "0" },
      { type: "Fixed Income", value: totals.fixedIncome.toFixed(2), percentage: total > 0 ? ((totals.fixedIncome / total) * 100).toFixed(2) : "0" },
    ].filter(item => parseFloat(item.value) > 0);
  }, [totals, portfolios, portfolioFilter]);

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
            <h2 className="text-lg font-bold text-slate-800">Investment Dashboard</h2>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-tight">Overview of all investment portfolios and accounts</p>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border border-border rounded-lg px-3 py-2 flex flex-wrap items-center gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Portfolio</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-8 text-xs font-bold min-w-[160px] justify-between bg-white">
                {portfolioFilter.includes("all") ? "All Portfolios" : portfolioFilter.length===1 ? (portfolios?.find(p=>p.id.toString()===portfolioFilter[0])?.name || "1 selected") : `${portfolioFilter.length} portfolios`}
                <ChevronDown className="w-3 h-3 ml-2 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="start">
              <div className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded">
                <Checkbox checked={portfolioFilter.includes("all")} onCheckedChange={(c)=> { if(c) _setPortfolioFilter(["all"]); else _setPortfolioFilter([]); }} />
                <span className="text-xs font-bold uppercase">All Portfolios</span>
              </div>
              <div className="h-px bg-slate-200 my-1" />
              {portfolios?.map(p => (
                <div key={p.id} className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded">
                  <Checkbox checked={portfolioFilter.includes(p.id.toString())} onCheckedChange={(c)=> {
                    let next = [...portfolioFilter.filter(v=>v!=="all")];
                    if(c) { if(!next.includes(p.id.toString())) next.push(p.id.toString()); } else { next = next.filter(v=>v!==p.id.toString()); }
                    if(next.length===0) next = ["all"];
                    _setPortfolioFilter(next);
                  }} />
                  <span className="text-xs font-bold uppercase truncate">{p.name}</span>
                  <span className="ml-auto text-[9px] px-1 py-0.5 rounded bg-slate-100">{(p as any).baseCurrency || "USD"}</span>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Currency</span>
          <Select value={currencyFilter} onValueChange={(v)=> _setCurrencyFilter(v)}>
            <SelectTrigger className="h-8 text-xs font-bold min-w-[120px] bg-white"><SelectValue placeholder="All" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs font-bold uppercase">All Currencies</SelectItem>
              {distinctCurrencies.map((c:string)=>(<SelectItem key={c} value={c} className="text-xs font-bold uppercase">{c}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
        <div className="h-6 w-px bg-slate-200 hidden sm:block" />
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">Scope: {portfolioFilter.includes("all") ? `${portfolios?.filter((p:any)=> currencyFilter==="all" || (p as any).baseCurrency===currencyFilter).length||0} portfolios` : portfolioFilter.length===1 ? (portfolios?.find(p=>p.id.toString()===portfolioFilter[0])?.name || "—") : `${portfolioFilter.length} portfolios`}{currencyFilter!=="all" ? ` • ${currencyFilter}` : ""}</div>
        <div className="ml-auto flex items-center gap-2 text-[10px] font-bold text-slate-500">
          <span className="hidden sm:inline">{incomeTable?.assets?.length || 0} assets</span>
          <span className="hidden sm:inline">•</span>
          <span>{formatCurrency(totals.overall)}</span>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button onClick={()=>setDashboardTab("dashboard")} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md ${dashboardTab==="dashboard"?"bg-white shadow-sm text-primary":"text-slate-500 hover:text-slate-700"}`}>Dashboard</button>
        <button onClick={()=>setDashboardTab("income")} className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md ${dashboardTab==="income"?"bg-white shadow-sm text-primary":"text-slate-500 hover:text-slate-700"}`}>Income</button>
      </div>

      {dashboardTab === "dashboard" ? (
        <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest">Equities</span>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold text-slate-800 font-mono">
                {formatCurrency(totals.equity)}
              </div>
              <div className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                {totals.equityPercent}%
              </div>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Stocks & ETFs</div>
          </CardContent>
        </Card>
        <Card className="bg-white border-none shadow-sm shadow-slate-200/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-purple-600 uppercase tracking-widest">Fixed Income</span>
              <Landmark className="w-4 h-4 text-purple-500" />
            </div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold text-slate-800 font-mono">
                {formatCurrency(totals.fixedIncome)}
              </div>
              <div className="text-xs font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">
                {totals.fixedIncomePercent}%
              </div>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Bonds & Treasuries</div>
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
              {portfolios?.filter((portfolio:any)=> (currencyFilter==="all" || (portfolio as any).baseCurrency===currencyFilter) && isPortfolioSelected(portfolio.id)).map((portfolio) => {
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
                          {portfolio.name} {portfolio.baseCurrency && portfolio.baseCurrency !== "USD" && <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">{portfolio.baseCurrency}</span>}
                        </button>
                      </td>
                      <td className="py-4 px-4 text-right font-mono font-bold text-primary">{(portfolio as any).baseCurrency !== "USD" && (portfolio as any).totalValueUSD ? <><div>{formatCurrency((portfolio as any).totalValueUSD, 2, "USD")}</div><div className="text-[10px] font-normal text-slate-400">~{formatCurrency(portfolio.totalValue, 2, (portfolio as any).baseCurrency || "USD")}</div></> : <div>{formatCurrency(portfolio.totalValue, 2, "USD")}</div>}</td>
                      <td className="py-4 px-4 text-right">
                        <div className="font-mono font-medium text-slate-600">{(portfolio as any).baseCurrency !== "USD" && (portfolio as any).cashValueUSD ? <><div>{formatCurrency((portfolio as any).cashValueUSD, 2, "USD")}</div><div className="text-[10px] font-normal text-slate-400">~{formatCurrency(portfolio.cashValue, 2, (portfolio as any).baseCurrency || "USD")}</div></> : formatCurrency(portfolio.cashValue, 2, "USD")}</div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{pCashPercent}%</div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="font-mono font-medium text-slate-700">{(portfolio as any).baseCurrency !== "USD" && (portfolio as any).investmentValueUSD ? <><div>{formatCurrency((portfolio as any).investmentValueUSD, 2, "USD")}</div><div className="text-[10px] font-normal text-slate-400">~{formatCurrency(portfolio.investmentValue, 2, (portfolio as any).baseCurrency || "USD")}</div></> : formatCurrency(portfolio.investmentValue, 2, "USD")}</div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{pInvPercent}%</div>
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-500 text-xs">
                        {(portfolio as any).baseCurrency !== "USD" && (portfolio as any).totalCostUSD ? (
                          <><div>{formatCurrency((portfolio as any).totalCostUSD, 2, "USD")}</div><div className="text-[10px] font-normal text-slate-400">~{formatCurrency(portfolio.totalCost || "0", 2, (portfolio as any).baseCurrency || "USD")}</div></>
                        ) : (
                          formatCurrency(portfolio.totalCost || "0", 2, "USD")
                        )}
                      </td>
                      <td className={`py-4 px-4 text-right font-mono text-xs font-bold ${((portfolio as any).gainUSD != null ? parseFloat((portfolio as any).gainUSD) >= 0 : isGain) ? "text-green-600" : "text-red-600"}`}>
                        {(portfolio as any).baseCurrency !== "USD" && (portfolio as any).gainUSD != null ? (
                          <><div>{parseFloat((portfolio as any).gainUSD) >= 0 ? "+" : ""}{formatCurrency((portfolio as any).gainUSD, 2, "USD")}</div><div className="text-[10px] font-normal text-slate-400">~{isGain ? "+" : ""}{formatCurrency(portfolio.gain || "0", 2, (portfolio as any).baseCurrency || "USD")}</div></>
                        ) : (
                          <>{isGain ? "+" : ""}{formatCurrency(portfolio.gain || "0", 2, "USD")}</>
                        )}
                      </td>
                      <td className={`py-4 px-4 text-right font-mono text-xs font-bold ${((portfolio as any).gainUSD != null ? parseFloat((portfolio as any).gainUSD) >= 0 : isGain) ? "text-green-600" : "text-red-600"}`}>
                        {((portfolio as any).baseCurrency !== "USD" && (portfolio as any).gainPercentUSD ? (parseFloat((portfolio as any).gainUSD) >= 0 ? "+" : "") + ((portfolio as any).gainPercentUSD || "0.00") : (isGain ? "+" : "") + (portfolio.gainPercent || "0.00"))}%
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
                                            <div className="flex items-center gap-2">
                                              <div className="font-semibold text-slate-700">{acc.name}</div>
                                              {acc.accountType && (
                                                <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-slate-100 text-slate-400 border border-slate-100">
                                                  {acc.accountType}
                                                </span>
                                              )}
                                            </div>
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
                                      <td className="py-2.5 text-right font-mono text-slate-500 text-[10px]">
                                        {(portfolio as any).baseCurrency !== "USD" && (portfolio as any).totalCostUSD ? (
                                          <><div>{formatCurrency((portfolio as any).totalCostUSD, 2, "USD")}</div><div className="text-[8px] font-normal text-slate-400">~{formatCurrency(portfolio.totalCost || "0", 2, (portfolio as any).baseCurrency || "USD")}</div></>
                                        ) : (
                                          formatCurrency(portfolio.totalCost || "0", 2, "USD")
                                        )}
                                      </td>
                                      <td className={`py-2.5 text-right font-mono text-[10px] font-bold ${((portfolio as any).gainUSD != null ? parseFloat((portfolio as any).gainUSD) >= 0 : isGain) ? "text-green-600" : "text-red-600"}`}>
                                        {(portfolio as any).baseCurrency !== "USD" && (portfolio as any).gainUSD != null ? (
                                          <><div>{parseFloat((portfolio as any).gainUSD) >= 0 ? "+" : ""}{formatCurrency((portfolio as any).gainUSD, 2, "USD")}</div><div className="text-[8px] font-normal text-slate-400">~{isGain ? "+" : ""}{formatCurrency(portfolio.gain || "0", 2, (portfolio as any).baseCurrency || "USD")}</div></>
                                        ) : (
                                          <>{isGain ? "+" : ""}{formatCurrency(portfolio.gain || "0", 2, "USD")}</>
                                        )}
                                      </td>
                                      <td className={`py-2.5 text-right font-mono text-[10px] font-bold ${((portfolio as any).gainUSD != null ? parseFloat((portfolio as any).gainUSD) >= 0 : isGain) ? "text-green-600" : "text-red-600"}`}>
                                        {((portfolio as any).baseCurrency !== "USD" && (portfolio as any).gainPercentUSD ? (parseFloat((portfolio as any).gainUSD) >= 0 ? "+" : "") + ((portfolio as any).gainPercentUSD || "0.00") : (isGain ? "+" : "") + (portfolio.gainPercent || "0.00"))}%
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
                <td colSpan={2} className="py-5 px-4 uppercase text-xs tracking-widest text-slate-600">Consolidated Totals <span className="ml-2 text-[10px] font-normal normal-case text-slate-400">in USD — BRL portfolios converted at daily FX (Frankfurter ECB)</span></td>
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
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter:</span>
            <Popover><PopoverTrigger asChild><Button variant="outline" className="h-7 text-[10px] font-bold uppercase tracking-wider min-w-[140px] bg-slate-50 border-slate-200 justify-between"><span className="truncate">{portfolioFilter.includes("all") ? "All Portfolios" : portfolioFilter.length===1 ? (portfolios||[]).find((p:any)=>String(p.id)===portfolioFilter[0])?.name || portfolioFilter[0] : `${portfolioFilter.length} portfolios`}</span><ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger><PopoverContent className="w-[240px] p-2 space-y-1"><label className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded"><Checkbox checked={portfolioFilter.includes("all")} onCheckedChange={(v:any)=>{ if(v) setPortfolioFilter(["all"]); else setPortfolioFilter([(portfolios?.[0] as any)?.id ? String((portfolios[0] as any).id) : "all"]) }} /><span>All Portfolios</span></label>{(portfolios||[]).map((p:any)=> (<label key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded"><Checkbox checked={portfolioFilter.includes(String(p.id))} onCheckedChange={(v:any)=>{ let next=[...portfolioFilter]; if(v){ next=next.filter(x=>x!=="all"); next.push(String(p.id)); } else { next=next.filter(x=>x!==String(p.id)); } if(next.length===0) next=["all"]; setPortfolioFilter(next); }} /><span>{p.name}</span></label>))}</PopoverContent></Popover>
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
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Allocation %</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gain/Loss</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gain/Loss %</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Annual Div/Coupon</th>
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
                        <td className="py-3 px-4 text-right font-mono text-xs font-bold text-slate-600">{asset.allocation.toFixed(2)}%</td>
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
                    <td colSpan={12} className="py-8 text-center text-slate-400 italic text-sm">
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
                    <td className="py-4 px-4 text-right font-mono text-xs text-slate-600">100.00%</td>
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
                    <td className="py-4 px-4 text-right font-mono text-sm text-blue-700">
                      <div>{formatCurrency(tableTotals.projectedDividend)}</div>
                      <div className="text-[10px] opacity-70">({formatCurrency(tableTotals.projectedDividend / 12)}/month)</div>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white border-none shadow-sm shadow-slate-200/50">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-primary" />
            <CardTitle className="text-sm font-bold text-slate-800 uppercase tracking-widest">Total Asset & Cash Allocation</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter:</span>
            <Popover><PopoverTrigger asChild><Button variant="outline" className="h-7 text-[10px] font-bold uppercase tracking-wider min-w-[140px] bg-slate-50 border-slate-200 justify-between"><span className="truncate">{portfolioFilter.includes("all") ? "All Portfolios" : portfolioFilter.length===1 ? (portfolios||[]).find((p:any)=>String(p.id)===portfolioFilter[0])?.name || portfolioFilter[0] : `${portfolioFilter.length} portfolios`}</span><ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger><PopoverContent className="w-[240px] p-2 space-y-1"><label className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded"><Checkbox checked={portfolioFilter.includes("all")} onCheckedChange={(v:any)=>{ if(v) setPortfolioFilter(["all"]); else setPortfolioFilter([(portfolios?.[0] as any)?.id ? String((portfolios[0] as any).id) : "all"]) }} /><span>All Portfolios</span></label>{(portfolios||[]).map((p:any)=> (<label key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded"><Checkbox checked={portfolioFilter.includes(String(p.id))} onCheckedChange={(v:any)=>{ let next=[...portfolioFilter]; if(v){ next=next.filter(x=>x!=="all"); next.push(String(p.id)); } else { next=next.filter(x=>x!==String(p.id)); } if(next.length===0) next=["all"]; setPortfolioFilter(next); }} /><span>{p.name}</span></label>))}</PopoverContent></Popover>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="overflow-x-auto rounded-lg border border-slate-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Asset / Type</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Quantity</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Current Value</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Allocation %</th>
                </tr>
              </thead>
              <tbody>
                {assetAndCashAllocation.map((item) => (
                  <tr key={item.name} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {item.type === 'Cash' ? (
                          <Wallet className="w-3 h-3 text-slate-400" />
                        ) : (
                          <Briefcase className="w-3 h-3 text-primary/60" />
                        )}
                        <div>
                          <div className="font-bold text-slate-800">{item.name}</div>
                          <div className="text-[10px] text-slate-400 font-medium">{item.fullName}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-600 text-xs">
                      {item.type === 'Cash' ? '-' : item.quantity?.toFixed(3)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-700">
                      {formatCurrency(item.value)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                          <div 
                            className={`h-full rounded-full ${item.type === 'Cash' ? 'bg-slate-300' : 'bg-primary'}`}
                            style={{ width: `${item.allocation}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold text-primary text-xs w-12 text-right">
                          {item.allocation.toFixed(2)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50/80 font-bold border-t border-slate-200">
                <tr>
                  <td colSpan={2} className="py-3 px-4 text-[10px] uppercase tracking-widest text-slate-500">Grand Total</td>
                  <td className="py-3 px-4 text-right font-mono text-sm text-slate-800">
                    {formatCurrency(assetAndCashAllocation.reduce((sum, item) => sum + item.value, 0))}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-primary">100.00%</td>
                </tr>
              </tfoot>
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
              <Popover><PopoverTrigger asChild><Button variant="outline" className="h-7 text-[10px] font-bold uppercase tracking-wider min-w-[140px] bg-slate-50 border-slate-200 justify-between"><span className="truncate">{portfolioFilter.includes("all") ? "All Portfolios" : portfolioFilter.length===1 ? (portfolios||[]).find((p:any)=>String(p.id)===portfolioFilter[0])?.name || portfolioFilter[0] : `${portfolioFilter.length} portfolios`}</span><ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger><PopoverContent className="w-[240px] p-2 space-y-1"><label className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded"><Checkbox checked={portfolioFilter.includes("all")} onCheckedChange={(v:any)=>{ if(v) setPortfolioFilter(["all"]); else setPortfolioFilter([(portfolios?.[0] as any)?.id ? String((portfolios[0] as any).id) : "all"]) }} /><span>All Portfolios</span></label>{(portfolios||[]).map((p:any)=> (<label key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded"><Checkbox checked={portfolioFilter.includes(String(p.id))} onCheckedChange={(v:any)=>{ let next=[...portfolioFilter]; if(v){ next=next.filter(x=>x!=="all"); next.push(String(p.id)); } else { next=next.filter(x=>x!==String(p.id)); } if(next.length===0) next=["all"]; setPortfolioFilter(next); }} /><span>{p.name}</span></label>))}</PopoverContent></Popover>
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
              <Popover><PopoverTrigger asChild><Button variant="outline" className="h-7 text-[10px] font-bold uppercase tracking-wider min-w-[140px] bg-slate-50 border-slate-200 justify-between"><span className="truncate">{portfolioFilter.includes("all") ? "All Portfolios" : portfolioFilter.length===1 ? (portfolios||[]).find((p:any)=>String(p.id)===portfolioFilter[0])?.name || portfolioFilter[0] : `${portfolioFilter.length} portfolios`}</span><ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger><PopoverContent className="w-[240px] p-2 space-y-1"><label className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded"><Checkbox checked={portfolioFilter.includes("all")} onCheckedChange={(v:any)=>{ if(v) setPortfolioFilter(["all"]); else setPortfolioFilter([(portfolios?.[0] as any)?.id ? String((portfolios[0] as any).id) : "all"]) }} /><span>All Portfolios</span></label>{(portfolios||[]).map((p:any)=> (<label key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded"><Checkbox checked={portfolioFilter.includes(String(p.id))} onCheckedChange={(v:any)=>{ let next=[...portfolioFilter]; if(v){ next=next.filter(x=>x!=="all"); next.push(String(p.id)); } else { next=next.filter(x=>x!==String(p.id)); } if(next.length===0) next=["all"]; setPortfolioFilter(next); }} /><span>{p.name}</span></label>))}</PopoverContent></Popover>
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

            {/* Asset Class Distribution - Cash / Equities / Bonds */}
      {assetClassBreakdown && assetClassBreakdown.length > 0 && (
        <Card className="p-6 bg-white shadow-sm border border-border">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-1.5 bg-slate-100 rounded text-slate-600">
              <PieChart className="w-4 h-4" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Asset Class Distribution</h2>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-center gap-16">
            <div className="shrink-0 flex items-center justify-center">
              <AccountTypeAllocationChart data={assetClassBreakdown} />
            </div>
            <div className="flex-1 w-full max-w-2xl">
              <div className="space-y-3">
                {assetClassBreakdown.map((item: any, index: number) => {
                  const ASSET_COLORS: Record<string, string> = {
                    "Cash": "#94a3b8",
                    "Equities": "#004a99",
                    "Fixed Income": "#9333ea"
                  };
                  return (
                    <div key={item.type} className="flex justify-between items-center text-sm p-3 hover:bg-slate-50 rounded transition-colors">
                      <div className="flex items-center gap-4">
                        <div
                          className="w-4 h-4 rounded-full shrink-0"
                          style={{ backgroundColor: ASSET_COLORS[item.type] || CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <span className="font-bold text-slate-700">{item.type}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="font-mono font-bold text-slate-600 text-sm">{formatCurrency(item.value)}</span>
                        <span className="font-mono font-bold text-slate-700 text-base w-16 text-right">{item.percentage}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Account Type Allocation Pie Chart */}
      {accountTypeBreakdown && accountTypeBreakdown.length > 0 && (
        <Card className="p-6 bg-white shadow-sm border border-border mt-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-slate-100 rounded text-slate-600">
                <Wallet className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Account Type Distribution</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter:</span>
              <Popover><PopoverTrigger asChild><Button variant="outline" className="h-7 text-[10px] font-bold uppercase tracking-wider min-w-[140px] bg-slate-50 border-slate-200 justify-between"><span className="truncate">{portfolioFilter.includes("all") ? "All Portfolios" : portfolioFilter.length===1 ? (portfolios||[]).find((p:any)=>String(p.id)===portfolioFilter[0])?.name || portfolioFilter[0] : `${portfolioFilter.length} portfolios`}</span><ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" /></Button></PopoverTrigger><PopoverContent className="w-[240px] p-2 space-y-1"><label className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded"><Checkbox checked={portfolioFilter.includes("all")} onCheckedChange={(v:any)=>{ if(v) setPortfolioFilter(["all"]); else setPortfolioFilter([(portfolios?.[0] as any)?.id ? String((portfolios[0] as any).id) : "all"]) }} /><span>All Portfolios</span></label>{(portfolios||[]).map((p:any)=> (<label key={p.id} className="flex items-center gap-2 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent rounded"><Checkbox checked={portfolioFilter.includes(String(p.id))} onCheckedChange={(v:any)=>{ let next=[...portfolioFilter]; if(v){ next=next.filter(x=>x!=="all"); next.push(String(p.id)); } else { next=next.filter(x=>x!==String(p.id)); } if(next.length===0) next=["all"]; setPortfolioFilter(next); }} /><span>{p.name}</span></label>))}</PopoverContent></Popover>
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-center gap-16">
            <div className="shrink-0 flex items-center justify-center">
              <AccountTypeAllocationChart data={accountTypeBreakdown} />
            </div>
            <div className="flex-1 w-full max-w-2xl">
              <div className="space-y-3">
                {accountTypeBreakdown.map((item: any, index: number) => {
                  const TYPE_COLORS: Record<string, string> = {
                    "Brokerage": "#004a99",
                    "Retirement": "#3d8a3d",
                    "Savings": "#f2a900",
                    "Checking": "#cc0000",
                    "Other": "#666666"
                  };
                  return (
                    <div key={item.type} className="flex justify-between items-center text-sm p-3 hover:bg-slate-50 rounded transition-colors">
                      <div className="flex items-center gap-4">
                        <div
                          className="w-4 h-4 rounded-full shrink-0"
                          style={{ backgroundColor: TYPE_COLORS[item.type] || CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <span className="font-bold text-slate-700">{item.type}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="font-mono font-bold text-slate-600 text-sm">{formatCurrency(item.value)}</span>
                        <span className="font-mono font-bold text-slate-700 text-base w-16 text-right">{item.percentage}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Accumulation & Performance Summary */}
      <Card className="bg-white shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Accumulation & Performance Summary</h3>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">Timeframe:</span>
            <Select value={dashboardRange} onValueChange={setDashboardRange}>
              <SelectTrigger className="w-[160px] h-9 bg-white text-xs font-bold uppercase border-slate-200">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                {rangeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs font-bold uppercase">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {isActivitiesLoading ? (
            <div className="py-20 text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-4 opacity-50" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Auditing Investment Ledger...</p>
            </div>
          ) : dashboardActivities && dashboardActivities.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  <th className="text-left py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Investment</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Qty Bought</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Avg Buy Price</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Outlay</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Mkt Price</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Mkt Value</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gain/Loss</th>
                  <th className="text-right py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Return</th>
                </tr>
              </thead>
              <tbody>
                {dashboardActivities.map((activity) => {
                  const isGain = parseFloat(activity.gain) >= 0;
                  return (
                    <tr key={activity.symbol} className="border-b border-border hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-bold text-primary text-sm">{activity.symbol}</div>
                        <div className="text-slate-500 text-[10px] truncate max-w-[150px]">{activity.name}</div>
                      </td>
                      <td className="text-right py-4 px-4 font-mono text-xs font-medium">
                        {parseFloat(activity.totalQuantity).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </td>
                      <td className="text-right py-4 px-4 font-mono text-xs text-slate-600">
                        {formatCurrency(activity.averagePrice)}
                      </td>
                      <td className="text-right py-4 px-4 font-mono text-xs font-bold text-slate-700">
                        {formatCurrency(activity.totalCost)}
                      </td>
                      <td className="text-right py-4 px-4 font-mono text-xs text-slate-500">
                        {formatCurrency(activity.currentPrice)}
                      </td>
                      <td className="text-right py-4 px-4 font-mono text-xs font-bold text-primary">
                        {formatCurrency(activity.currentValue)}
                      </td>
                      <td className={`text-right py-4 px-4 font-mono text-xs font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                        {isGain ? "+" : ""}{formatCurrency(activity.gain)}
                      </td>
                      <td className="text-right py-4 px-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold font-mono ${isGain ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {isGain ? "+" : ""}{activity.gainPercent}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50/80 font-bold border-t-2 border-slate-200">
                <tr>
                  <td colSpan={3} className="py-4 px-4 uppercase text-[10px] tracking-widest text-slate-500">Period Totals</td>
                  <td className="text-right py-4 px-4 font-mono text-sm text-slate-700">
                    {formatCurrency(dashboardActivities.reduce((sum, a) => sum + parseFloat(a.totalCost), 0))}
                  </td>
                  <td className="text-right py-4 px-4"></td>
                  <td className="text-right py-4 px-4 font-mono text-sm text-primary">
                    {formatCurrency(dashboardActivities.reduce((sum, a) => sum + parseFloat(a.currentValue), 0))}
                  </td>
                  <td className={`text-right py-4 px-4 font-mono text-sm ${dashboardActivities.reduce((sum, a) => sum + parseFloat(a.gain), 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {dashboardActivities.reduce((sum, a) => sum + parseFloat(a.gain), 0) >= 0 ? "+" : ""}
                    {formatCurrency(dashboardActivities.reduce((sum, a) => sum + parseFloat(a.gain), 0))}
                  </td>
                  <td className="text-right py-4 px-4">
                    <span className={`px-3 py-1 rounded text-xs font-bold font-mono ${
                      dashboardActivities.reduce((sum, a) => sum + parseFloat(a.totalCost), 0) > 0 &&
                      (dashboardActivities.reduce((sum, a) => sum + parseFloat(a.gain), 0) / dashboardActivities.reduce((sum, a) => sum + parseFloat(a.totalCost), 0)) >= 0
                        ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                    }`}>
                      {dashboardActivities.reduce((sum, a) => sum + parseFloat(a.totalCost), 0) > 0 
                        ? (((dashboardActivities.reduce((sum, a) => sum + parseFloat(a.gain), 0) / dashboardActivities.reduce((sum, a) => sum + parseFloat(a.totalCost), 0)) * 100).toFixed(2))
                        : "0.00"}%
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="py-20 text-center">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No activities in this period</p>
              <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-tight">Try selecting a broader timeframe to review your history</p>
            </div>
          )}
        </div>
      </Card>

      <GroupAllocationSection
        portfolios={portfolios}
        consolidatedHoldings={consolidatedHoldings}
        portfolioFilter={portfolioFilter}
        currencyFilter={currencyFilter}
        totals={totals}
      />

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
        </>
      ) : (
        <IncomeTab selectedPortfolioId={portfolioFilter.includes("all") ? undefined : parseInt(portfolioFilter[0])} selectedPortfolioIds={portfolioFilter.includes("all") ? undefined : portfolioFilter.map(id=> parseInt(id))} selectedCurrency={currencyFilter} />
      )}
    </div>
  );
};

function GroupAllocationSection({ portfolios, consolidatedHoldings, portfolioFilter, currencyFilter, totals }: any) {
  const utils = trpc.useUtils();
  const { data: groups } = trpc.group.getGroups.useQuery();
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupTarget, setNewGroupTarget] = useState("");
  const [editingGroup, setEditingGroup] = useState<{ id:number, name:string, target:string }|null>(null);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const toggleGroup = (id:number) => { const s=new Set(expandedGroups); if(s.has(id)) s.delete(id); else s.add(id); setExpandedGroups(s); };

  const createMut = trpc.group.createGroup.useMutation({ onSuccess:()=>{ toast.success("Group created"); utils.group.getGroups.invalidate(); setIsAddGroupOpen(false); setNewGroupName(""); setNewGroupTarget(""); }, onError:(e)=>toast.error(e.message)});
  const updateMut = trpc.group.updateGroup.useMutation({ onSuccess:()=>{ toast.success("Group updated"); utils.group.getGroups.invalidate(); setEditingGroup(null); }, onError:(e)=>toast.error(e.message)});
  const deleteMut = trpc.group.deleteGroup.useMutation({ onSuccess:()=>{ toast.success("Group deleted"); utils.group.getGroups.invalidate(); }, onError:(e)=>toast.error(e.message)});
  const assignMut = trpc.group.assignAsset.useMutation({ onSuccess:()=>{ toast.success("Assigned"); utils.group.getGroups.invalidate(); setIsAssignOpen(false); }, onError:(e)=>toast.error(e.message)});
  const unassignMut = trpc.group.unassignAsset.useMutation({ onSuccess:()=>{ toast.success("Unassigned"); utils.group.getGroups.invalidate(); }, onError:(e)=>toast.error(e.message)});

  // Build asset universe: aggregated cash (all accounts) + holdings (etf/bond/crypto)
  const cashAssets = useMemo(()=> {
    if (!portfolios) return [];
    const isAll = portfolioFilter?.includes("all");
    const totalCash = (portfolios as any[]).filter((p:any)=> {
      const curOk = currencyFilter==="all" || (p as any).baseCurrency===currencyFilter;
      const pfOk = isAll || portfolioFilter.includes(String(p.id));
      return curOk && pfOk;
    }).flatMap((p:any)=> p.accounts||[]).reduce((s:number,a:any)=> s + parseFloat(a.cashValue||"0"), 0);
    if (totalCash < 0.01) return [];
    return [{
      assetType: "cash" as const,
      assetKey: "CASH",
      symbol: "CASH",
      name: "Cash (All Accounts)",
      quantity: 1,
      currentValue: totalCash,
      displayQty: "-",
      accountName: "All Accounts",
    }];
  }, [portfolios, portfolioFilter, currencyFilter]);

  const holdingAssets = useMemo(()=> {
    return (consolidatedHoldings||[]).map((h:any)=> {
      const sym = (h.symbol||"").toUpperCase();
      let type: "etf"|"bond"|"crypto" = "etf";
      if (h.assetType==="bond" || sym==="BONDS") type="bond";
      else if (["BTC","ETH","BTC-USD","ETH-USD"].includes(sym)) type="crypto";
      return {
        assetType: type,
        assetKey: sym,
        symbol: h.symbol,
        name: h.name,
        quantity: h.quantity,
        currentValue: h.mktValue,
        displayQty: h.quantity?.toFixed(3),
      };
    });
  }, [consolidatedHoldings]);

  const allAssets = useMemo(()=> [...cashAssets, ...holdingAssets], [cashAssets, holdingAssets]);
  const assetMap = useMemo(()=> {
    const m=new Map<string, any>();
    for (const a of allAssets) m.set(`${a.assetType}:${a.assetKey}`, a);
    return m;
  }, [allAssets]);

  const overallValue = totals?.overall || allAssets.reduce((s,a)=>s+a.currentValue,0) || 1;
  const assignedKeys = new Set((groups||[]).flatMap((g:any)=> (g.assets||[]).map((a:any)=> `${a.assetType}:${a.assetKey}`)));
  const unassigned = allAssets.filter((a)=> !assignedKeys.has(`${a.assetType}:${a.assetKey}`));

  const groupRows = useMemo(()=> {
    return (groups||[]).map((g:any)=> {
      const assets = (g.assets||[]).map((ga:any)=> assetMap.get(`${ga.assetType}:${ga.assetKey}`)).filter(Boolean);
      const groupValue = assets.reduce((s:number,a:any)=> s+(a?.currentValue||0),0);
      const alloc = overallValue>0 ? (groupValue/overallValue*100) : 0;
      const target = parseFloat(g.targetAllocation||"0");
      const delta = alloc - target;
      const buyNeeded = target>alloc ? (target/100*overallValue - groupValue) : 0;
      return { group: g, assets, groupValue, alloc, target, delta, buyNeeded };
    });
  }, [groups, assetMap, overallValue]);

  const unassignedValue = unassigned.reduce((s,a)=>s+a.currentValue,0);
  const groupsTotal = groupRows.reduce((s,r)=>s+r.groupValue,0);

  return (
    <Card className="bg-white shadow-sm border border-border overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PieChart className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Group Allocation</h3>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{groups?.length || 0} groups • {formatCurrency(overallValue)} total</span>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isAddGroupOpen} onOpenChange={setIsAddGroupOpen}>
            <DialogTrigger asChild><Button size="sm" className="h-8 text-xs font-bold uppercase"><Plus className="w-3.5 h-3.5 mr-1" />Add Group</Button></DialogTrigger>
            <DialogContent className="sm:max-w-[380px]"><DialogHeader><DialogTitle>New Group</DialogTitle></DialogHeader>
              <div className="space-y-3 pt-2">
                <div className="grid gap-1"><label className="text-[10px] font-bold uppercase text-slate-500">Group name</label><Input value={newGroupName} onChange={(e)=>setNewGroupName(e.target.value)} placeholder="e.g. Growth, Income, Cash Reserve" /></div>
                <div className="grid gap-1"><label className="text-[10px] font-bold uppercase text-slate-500">Target % (0-100)</label><Input type="number" min={0} max={100} step="0.1" value={newGroupTarget} onChange={(e)=>setNewGroupTarget(e.target.value)} placeholder="e.g. 40" /></div>
                <Button className="w-full" disabled={!newGroupName || createMut.isPending} onClick={()=> createMut.mutate({ name: newGroupName, targetAllocation: (newGroupTarget||"0") })}>Create</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={isAssignOpen} onOpenChange={setIsAssignOpen}>
            <DialogTrigger asChild><Button variant="outline" size="sm" className="h-8 text-xs font-bold uppercase" disabled={unassigned.length===0}><ArrowRightLeft className="w-3.5 h-3.5 mr-1" />Assign Investment</Button></DialogTrigger>
            <DialogContent className="sm:max-w-[720px]"><DialogHeader><DialogTitle>Assign Investment to Group</DialogTitle></DialogHeader>
              <AssignForm groups={groups} unassigned={unassigned} onAssign={(gid, atype, akey)=> assignMut.mutate({ groupId: gid, assetType: atype, assetKey: akey })} isPending={assignMut.isPending} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="bg-slate-50 border-b">
            <th className="w-8"></th>
            <th className="text-left py-3 px-3 text-[10px] font-bold uppercase text-slate-500">Group</th>
            <th className="text-right py-3 px-3 text-[10px] font-bold uppercase text-slate-500">Current Value</th>
            <th className="text-right py-3 px-3 text-[10px] font-bold uppercase text-slate-500">Allocation</th>
            <th className="text-right py-3 px-3 text-[10px] font-bold uppercase text-slate-500">Target</th>
            <th className="text-left py-3 px-3 text-[10px] font-bold uppercase text-slate-500">Recommendation</th>
            <th className="text-right py-3 px-3 text-[10px] font-bold uppercase text-slate-500">Actions</th>
          </tr></thead>
          <tbody>
            {groupRows.length===0 && (
              <tr><td colSpan={7} className="py-10 text-center text-slate-400 text-sm italic">No groups yet — create one and assign cash / ETF / bond / crypto holdings.</td></tr>
            )}
            {groupRows.map((row)=> {
              const isExp = expandedGroups.has(row.group.id);
              const under = row.alloc < row.target - 0.01;
              const over = row.alloc > row.target + 0.01;
              return (
                <React.Fragment key={row.group.id}>
                  <tr className="border-b hover:bg-slate-50/50">
                    <td className="py-3 px-2 text-center"><button onClick={()=>toggleGroup(row.group.id)} className="p-1 hover:bg-slate-100 rounded">{isExp ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}</button></td>
                    <td className="py-3 px-3 font-bold text-slate-800">{row.group.name}</td>
                    <td className="py-3 px-3 text-right font-mono font-bold">{formatCurrency(row.groupValue)}</td>
                    <td className="py-3 px-3 text-right font-mono text-xs font-bold">{row.alloc.toFixed(2)}%</td>
                    <td className="py-3 px-3 text-right font-mono text-xs">{row.target.toFixed(2)}%</td>
                    <td className="py-3 px-3 text-xs">
                      {under ? <span className="px-2 py-1 rounded bg-amber-100 text-amber-800 font-bold">Buy {formatCurrency(row.buyNeeded)} to reach {row.target.toFixed(1)}%</span> : over ? <span className="px-2 py-1 rounded bg-blue-50 text-blue-700 font-bold">Over by {(row.alloc-row.target).toFixed(2)}% — consider trimming</span> : <span className="px-2 py-1 rounded bg-emerald-50 text-emerald-700 font-bold">✓ On target</span>}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=> setEditingGroup({ id: row.group.id, name: row.group.name, target: row.group.targetAllocation })}><Edit2 className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={()=> { if(confirm(`Delete group "${row.group.name}"? Assets become unassigned.`)) deleteMut.mutate({ id: row.group.id })}}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                  {isExp && (
                    <tr className="bg-slate-50/30"><td colSpan={7} className="p-0">
                      <div className="px-8 py-3">
                        <table className="w-full text-xs">
                          <thead><tr className="border-b text-[10px] font-bold uppercase text-slate-400"><th className="text-left py-2 px-2">Investment</th><th className="text-right py-2 px-2">Qty</th><th className="text-right py-2 px-2">Current Value</th><th className="text-right py-2 px-2">Overall %</th><th className="text-right py-2 px-2">Within Group %</th><th className="text-right py-2 px-2">Type</th><th className="text-right py-2 px-2">Action</th></tr></thead>
                          <tbody>
                            {row.assets.length===0 && <tr><td colSpan={7} className="py-4 text-center italic text-slate-400">No investments in this group — use Assign Investment.</td></tr>}
                            {row.assets.map((a:any)=> {
                              const overallPct = overallValue>0 ? (a.currentValue/overallValue*100) : 0;
                              const withinPct = row.groupValue>0 ? (a.currentValue/row.groupValue*100) : 0;
                              return (
                                <tr key={`${a.assetType}:${a.assetKey}`} className="border-b last:border-0 hover:bg-white">
                                  <td className="py-2 px-2"><div className="font-bold text-slate-700">{a.symbol}</div><div className="text-[10px] text-slate-400 truncate max-w-[160px]">{a.name}</div></td>
                                  <td className="py-2 px-2 text-right font-mono">{a.assetType==="cash" ? "—" : a.displayQty}</td>
                                  <td className="py-2 px-2 text-right font-mono font-bold">{formatCurrency(a.currentValue)}</td>
                                  <td className="py-2 px-2 text-right font-mono">{overallPct.toFixed(2)}%</td>
                                  <td className="py-2 px-2 text-right font-mono font-bold text-primary">{withinPct.toFixed(2)}%</td>
                                  <td className="py-2 px-2 text-right"><span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100">{a.assetType}</span></td>
                                  <td className="py-2 px-2 text-right"><button className="text-[11px] font-bold text-red-600 hover:underline" onClick={()=> unassignMut.mutate({ assetType: a.assetType, assetKey: a.assetKey })}>Unassign</button></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot className="bg-slate-900 text-white font-bold">
            <tr><td colSpan={2} className="py-3 px-3 text-[11px] uppercase tracking-widest">Overall Value</td><td className="py-3 px-3 text-right font-mono">{formatCurrency(overallValue)}</td><td className="py-3 px-3 text-right">100.00%</td><td className="py-3 px-3 text-right">{groupRows.reduce((s,r)=>s+r.target,0).toFixed(2)}% target</td><td className="py-3 px-3 text-left text-[11px] font-normal">{groupsTotal < overallValue - 0.01 ? <span className="text-amber-300">{formatCurrency(overallValue - groupsTotal)} unassigned — assign to reach targets</span> : <span className="text-emerald-300">Fully assigned</span>}</td><td></td></tr>
          </tfoot>
        </table>
      </div>
      {unassigned.length>0 && (
        <div className="px-6 py-3 bg-amber-50/50 border-t text-xs">
          <div className="font-bold text-slate-600 mb-1">{unassigned.length} unassigned investment(s) — {formatCurrency(unassignedValue)} ({(unassignedValue/overallValue*100).toFixed(2)}%)</div>
          <div className="flex flex-wrap gap-1.5">{unassigned.slice(0,12).map((a:any)=> <span key={`${a.assetType}:${a.assetKey}`} className="px-2 py-1 rounded bg-white border text-[11px] font-mono">{a.symbol} {formatCurrency(a.currentValue)}</span>)}{unassigned.length>12 && <span className="text-slate-500">+{unassigned.length-12} more — use Assign Investment</span>}</div>
        </div>
      )}

      {editingGroup && (
        <Dialog open={!!editingGroup} onOpenChange={(o)=> !o && setEditingGroup(null)}>
          <DialogContent className="sm:max-w-[380px]"><DialogHeader><DialogTitle>Edit Group</DialogTitle></DialogHeader>
            <div className="space-y-3 pt-2">
              <div className="grid gap-1"><label className="text-[10px] font-bold uppercase text-slate-500">Name</label><Input value={editingGroup.name} onChange={(e)=> setEditingGroup(prev=> prev?{...prev, name:e.target.value}:null)} /></div>
              <div className="grid gap-1"><label className="text-[10px] font-bold uppercase text-slate-500">Target %</label><Input type="number" value={editingGroup.target} onChange={(e)=> setEditingGroup(prev=> prev?{...prev, target:e.target.value}:null)} /></div>
              <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={()=> setEditingGroup(null)}>Cancel</Button><Button className="flex-1" disabled={updateMut.isPending} onClick={()=> editingGroup && updateMut.mutate({ id: editingGroup.id, name: editingGroup.name, targetAllocation: editingGroup.target||"0" })}>Save</Button></div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

function AssignForm({ groups, unassigned, onAssign, isPending }: any) {
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [targetGroupId, setTargetGroupId] = useState<string>("");
  const asset = unassigned.find((a:any)=> `${a.assetType}:${a.assetKey}`===selectedAsset);
  return (
    <div className="space-y-3 pt-2">
      <div className="grid gap-1"><label className="text-[10px] font-bold uppercase text-slate-500">Investment (cash, bond, etf, stock, crypto)</label>
        <select className="border rounded px-3 py-2 text-sm h-10 bg-white" value={selectedAsset} onChange={(e)=> setSelectedAsset(e.target.value)}>
          <option value="">Select investment</option>
          {unassigned.map((a:any)=> <option key={`${a.assetType}:${a.assetKey}`} value={`${a.assetType}:${a.assetKey}`}>{a.assetType.toUpperCase()} — {a.symbol} — {a.name} — {a.assetType!=="cash" ? `${a.displayQty} • ${a.currentValue.toFixed(2)}` : `${a.currentValue.toFixed(2)}`}</option>)}
        </select>
      </div>
      <div className="grid gap-1"><label className="text-[10px] font-bold uppercase text-slate-500">Target Group</label>
        <select className="border rounded px-3 py-2 text-sm h-10 bg-white" value={targetGroupId} onChange={(e)=> setTargetGroupId(e.target.value)}>
          <option value="">Select group</option>
          {(groups||[]).map((g:any)=> <option key={g.id} value={g.id}>{g.name} — target {parseFloat(g.targetAllocation).toFixed(1)}%</option>)}
        </select>
      </div>
      <Button className="w-full" disabled={!selectedAsset || !targetGroupId || isPending} onClick={()=> {
        if (!selectedAsset || !targetGroupId) return;
        const [atype, ...rest] = selectedAsset.split(":");
        const akey = rest.join(":");
        onAssign(Number(targetGroupId), atype, akey);
      }}>{isPending ? "Assigning..." : `Assign ${asset ? asset.symbol : ""}`}</Button>
      {unassigned.length===0 && <div className="text-xs text-slate-500 italic">All investments assigned.</div>}
    </div>
  );
}

export default Portfolios;
