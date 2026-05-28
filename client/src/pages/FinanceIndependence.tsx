import React, { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { 
  Plus, 
  Trash2, 
  Edit, 
  Calculator, 
  Wallet, 
  ReceiptText, 
  BarChart, 
  Search, 
  Target, 
  BarChart3, 
  Calendar as CalendarIcon,
  TrendingUp,
  RefreshCw
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  ResponsiveContainer, 
  Legend,
  ReferenceLine
} from "recharts";

const FinanceIndependence: React.FC = () => {
  const utils = trpc.useUtils();
  
  // Dialog States
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<{ id: number; description: string; amount: string } | null>(null);
  const [newExpense, setNewExpense] = useState({ description: "", amount: "" });
  
  // Full Simulation State
  const [fullSimSymbol, setFullSimSymbol] = useState("");
  const [fullSimAllocation, setFullSimAllocation] = useState("0");
  const [fullSimUsage, setFullSimUsage] = useState("100");

  // Retirement Longevity State
  const [retirementWithdrawalRate, setRetirementWithdrawalRate] = useState<string>("");
  const [retirementReturnRate, setRetirementReturnRate] = useState<string>("5"); // Default 5%
  const [retirementInflationRate, setRetirementInflationRate] = useState<string>("3"); // Default 3%
  const [retirementStartDate, setRetirementStartDate] = useState<Date>(new Date());
  const [userBirthDate, setUserBirthDate] = useState<Date | undefined>(undefined);
  const [ssAmount, setSsAmount] = useState<string>("0");
  const [ssAge, setSsAge] = useState<string>("67");
  const [lifeExpectancy, setLifeExpectancy] = useState<string>("85");
  const [targetEffortDate, setTargetEffortDate] = useState<Date>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 5);
    return d;
  });

  // Data fetching
  const { data: user } = trpc.auth.me.useQuery();
  const { data: holdings, isPending: isHoldingsPending, error: holdingsError } = trpc.portfolio.getAllHoldings.useQuery();
  const { data: expenses, isPending: isExpensesPending, error: expensesError } = trpc.fi.getExpenses.useQuery();
  const { data: fullSimData, isPending: isFullSimPending } = trpc.fi.getFullSimulationData.useQuery();
  const { data: portfolios } = trpc.portfolio.getDetailedAll.useQuery();
  const { data: currentMonthActivities } = trpc.etf.getInvestmentActivities.useQuery({ range: "cm" });

  // Mutations
  const addExpenseMutation = trpc.fi.addExpense.useMutation({
    onSuccess: () => {
      toast.success("Expense added");
      utils.fi.getExpenses.invalidate();
      setIsAddDialogOpen(false);
      setNewExpense({ description: "", amount: "" });
    },
  });

  const updateExpenseMutation = trpc.fi.updateExpense.useMutation({
    onSuccess: () => {
      toast.success("Expense updated");
      utils.fi.getExpenses.invalidate();
      setEditingExpense(null);
    },
  });

  const deleteExpenseMutation = trpc.fi.deleteExpense.useMutation({
    onSuccess: () => {
      toast.success("Expense deleted");
      utils.fi.getExpenses.invalidate();
    },
  });

  const addFullSimAssetMutation = trpc.fi.addFullSimulationAsset.useMutation({
    onSuccess: () => {
      toast.success("Asset added to full simulation");
      utils.fi.getFullSimulationData.invalidate();
      setFullSimSymbol("");
      setFullSimAllocation("0");
      setFullSimUsage("100");
    },
  });

  const updateFullSimAssetMutation = trpc.fi.updateFullSimulationAsset.useMutation({
    onSuccess: () => utils.fi.getFullSimulationData.invalidate(),
  });

  const deleteFullSimAssetMutation = trpc.fi.deleteFullSimulationAsset.useMutation({
    onSuccess: () => {
      toast.success("Asset removed from full simulation");
      utils.fi.getFullSimulationData.invalidate();
    },
  });

  const updateRetirementSettingsMutation = trpc.fi.updateRetirementSettings.useMutation();

  // Lifecycle
  useEffect(() => {
    if (user) {
      if (user.retirementWithdrawalRate) setRetirementWithdrawalRate(user.retirementWithdrawalRate);
      if (user.retirementReturnRate) setRetirementReturnRate(user.retirementReturnRate);
      if (user.retirementInflationRate) setRetirementInflationRate(user.retirementInflationRate);
      if (user.retirementStartDate) setRetirementStartDate(new Date(user.retirementStartDate));
      if (user.userBirthDate) setUserBirthDate(new Date(user.userBirthDate));
      if (user.ssAmount) setSsAmount(user.ssAmount);
      if (user.ssAge) setSsAge(user.ssAge);
      if (user.lifeExpectancy) setLifeExpectancy(user.lifeExpectancy);
      if (user.targetEffortDate) setTargetEffortDate(new Date(user.targetEffortDate));
    }
  }, [user]);

  // Handlers
  const handleAddExpense = () => {
    if (!newExpense.description || !newExpense.amount) return;
    addExpenseMutation.mutate(newExpense);
  };

  const handleUpdateExpense = () => {
    if (!editingExpense) return;
    updateExpenseMutation.mutate({
      id: editingExpense.id,
      description: editingExpense.description,
      amount: editingExpense.amount,
    });
  };

  const handleAddFullSimAsset = () => {
    if (!fullSimSymbol) return;
    addFullSimAssetMutation.mutate({ symbol: fullSimSymbol, allocation: fullSimAllocation, usagePercent: fullSimUsage });
  };

  const handleUpdateFullSim = (id: number, updates: { allocation?: string, usagePercent?: string }) => {
    updateFullSimAssetMutation.mutate({ id, ...updates });
  };

  // Memos
  const totalPortfolioValue = useMemo(() => {
    if (!portfolios) return 0;
    const cash = portfolios.reduce((acc, p) => acc + parseFloat(p.cashValue), 0);
    const investment = portfolios.reduce((acc, p) => acc + parseFloat(p.investmentValue), 0);
    return cash + investment;
  }, [portfolios]);

  const monthlyIncome = useMemo(() => {
    if (!holdings) return 0;
    const totalAnnual = holdings.reduce((sum, h) => {
      const qty = parseFloat(h.quantity.toString());
      const dps = h.annualDividendPerShare || 0;
      return sum + (qty * dps);
    }, 0);
    return totalAnnual / 12;
  }, [holdings]);

  const distributedExpenses = useMemo(() => {
    const expensesList = expenses || [];
    if (expensesList.length === 0) return [];
    const sorted = [...expensesList].sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
    let remainingIncome = monthlyIncome;
    return sorted.map(exp => {
      const amount = parseFloat(exp.amount);
      const covered = Math.min(amount, remainingIncome);
      remainingIncome = Math.max(0, remainingIncome - covered);
      const coveredPercent = amount > 0 ? (covered / amount) * 100 : 0;
      const remainingAmount = amount - covered;
      const remainingPercent = amount > 0 ? (remainingAmount / amount) * 100 : 0;
      return { ...exp, amount, covered, coveredPercent, remainingAmount, remainingPercent };
    });
  }, [expenses, monthlyIncome]);

  const totals = useMemo(() => {
    return distributedExpenses.reduce((acc, curr) => ({
      amount: acc.amount + curr.amount,
      covered: acc.covered + curr.covered,
      remaining: acc.remaining + curr.remainingAmount,
    }), { amount: 0, covered: 0, remaining: 0 });
  }, [distributedExpenses]);

  const fullSimulationResults = useMemo(() => {
    if (!fullSimData || fullSimData.length === 0 || totals.amount <= 0) return [];
    let weightedYieldSum = 0;
    fullSimData.forEach(asset => {
      const alloc = parseFloat(asset.allocation) || 0;
      const usage = parseFloat(asset.usagePercent) || 100;
      const yield_ = asset.price > 0 ? (asset.annualDPS / 12) / asset.price : 0;
      weightedYieldSum += (alloc / 100) * yield_ * (usage / 100);
    });
    if (weightedYieldSum <= 0) return [];
    const totalCapitalNeeded = totals.amount / weightedYieldSum;
    return fullSimData.map(asset => {
      const allocationPercent = parseFloat(asset.allocation) || 0;
      const usagePercent = parseFloat(asset.usagePercent) || 100;
      const costNeeded = totalCapitalNeeded * (allocationPercent / 100);
      const totalSharesNeeded = asset.price > 0 ? Math.ceil(costNeeded / asset.price) : 0;
      const currentShares = holdings ? holdings.filter(h => h.symbol.toUpperCase() === asset.symbol.toUpperCase()).reduce((sum, h) => sum + parseFloat(h.quantity.toString()), 0) : 0;
      const currentValue = currentShares * asset.price;
      const remainingSharesNeeded = Math.max(0, totalSharesNeeded - currentShares);
      const remainingCostNeeded = remainingSharesNeeded * asset.price;
      const progressPercent = costNeeded > 0 ? (currentValue / costNeeded) * 100 : 0;
      const monthlyDPS = asset.annualDPS / 12;
      const currentMonthlyDiv = currentShares * monthlyDPS;
      const desiredMonthlyDiv = totalSharesNeeded * monthlyDPS;
      const monthlyDivUsed = (desiredMonthlyDiv * usagePercent) / 100;
      return { ...asset, monthlyDPS, totalSharesNeeded, costNeeded, currentShares, currentValue, remainingSharesNeeded, remainingCostNeeded, progressPercent, allocationPercent, usagePercent, currentMonthlyDiv, desiredMonthlyDiv, monthlyDivUsed };
    });
  }, [fullSimData, totals.amount, holdings]);

  const fullSimTotals = useMemo(() => {
    return fullSimulationResults.reduce((acc, curr) => ({
      cost: acc.cost + curr.costNeeded,
      totalShares: acc.totalShares + curr.totalSharesNeeded,
      currentShares: acc.currentShares + curr.currentShares,
      currentValue: acc.currentValue + curr.currentValue,
      remainingShares: acc.remainingShares + curr.remainingSharesNeeded,
      remainingCost: acc.remainingCost + curr.remainingCostNeeded,
      allocation: acc.allocation + curr.allocationPercent,
      currentMonthlyDiv: acc.currentMonthlyDiv + curr.currentMonthlyDiv,
      desiredMonthlyDiv: acc.desiredMonthlyDiv + curr.desiredMonthlyDiv,
      monthlyDivUsed: acc.monthlyDivUsed + curr.monthlyDivUsed
    }), { cost: 0, totalShares: 0, currentShares: 0, currentValue: 0, remainingShares: 0, remainingCost: 0, allocation: 0, currentMonthlyDiv: 0, desiredMonthlyDiv: 0, monthlyDivUsed: 0 });
  }, [fullSimulationResults]);

  const effortResults = useMemo(() => {
    if (!fullSimulationResults || fullSimulationResults.length === 0) return null;
    
    const now = new Date();
    let months = (targetEffortDate.getFullYear() - now.getFullYear()) * 12 + (targetEffortDate.getMonth() - now.getMonth());
    if (months <= 0) months = 1;

    const assets = fullSimulationResults.map(asset => {
      const monthlyTarget = asset.remainingSharesNeeded / months;
      
      // Find what was already bought this month from activities
      const activity = currentMonthActivities?.find(a => a.symbol.toUpperCase() === asset.symbol.toUpperCase());
      const purchasedThisMonth = activity ? parseFloat(activity.totalQuantity) : 0;
      const capitalPurchasedThisMonth = activity ? parseFloat(activity.totalCost) : 0;
      const monthlyRemaining = Math.max(0, monthlyTarget - purchasedThisMonth);
      const capitalForRemaining = monthlyRemaining * asset.price;

      return {
        symbol: asset.symbol,
        monthlyShares: monthlyTarget,
        monthlyCapital: asset.remainingCostNeeded / months,
        remainingShares: asset.remainingSharesNeeded,
        remainingCapital: asset.remainingCostNeeded,
        purchasedThisMonth,
        capitalPurchasedThisMonth,
        monthlyRemaining,
        capitalForRemaining
      };
    });

    const totals = assets.reduce((acc, curr) => ({
      monthlyCapital: acc.monthlyCapital + curr.monthlyCapital,
      remainingCapital: acc.remainingCapital + curr.remainingCapital,
      purchasedThisMonth: acc.purchasedThisMonth + curr.purchasedThisMonth,
      capitalPurchasedThisMonth: acc.capitalPurchasedThisMonth + curr.capitalPurchasedThisMonth,
      monthlyRemaining: acc.monthlyRemaining + curr.monthlyRemaining,
      capitalForRemaining: acc.capitalForRemaining + curr.capitalForRemaining
    }), { monthlyCapital: 0, remainingCapital: 0, purchasedThisMonth: 0, capitalPurchasedThisMonth: 0, monthlyRemaining: 0, capitalForRemaining: 0 });

    return { assets, totals, months };
  }, [fullSimulationResults, targetEffortDate, currentMonthActivities]);

  const retirementResults = useMemo(() => {
    const annualExpenses = totals.amount * 12;
    let currentPortfolioValue = totalPortfolioValue;
    if (currentPortfolioValue <= 0 || annualExpenses <= 0) return null;

    const returnRate = parseFloat(retirementReturnRate) / 100;
    const inflationRate = parseFloat(retirementInflationRate) / 100 || 0;
    const now = new Date();
    const currentYear = now.getFullYear();
    const retirementYear = retirementStartDate.getFullYear();

    let ageToday = 0;
    let ageAtRetirement = 0;
    if (userBirthDate) {
      ageToday = currentYear - userBirthDate.getFullYear();
      ageAtRetirement = retirementYear - userBirthDate.getFullYear();
    }

    const yearsUntilRetirement = Math.max(0, retirementYear - currentYear);
    let projectedPortfolioAtStart = currentPortfolioValue;
    let projectedExpensesAtStart = annualExpenses;
    
    if (retirementStartDate > now) {
      const fractionYearsToRetirement = (retirementStartDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      projectedPortfolioAtStart = currentPortfolioValue * Math.pow(1 + returnRate, fractionYearsToRetirement);
      projectedExpensesAtStart = annualExpenses * Math.pow(1 + inflationRate, fractionYearsToRetirement);
    }

    const informedRate = parseFloat(retirementWithdrawalRate);
    const effectiveInitialRate = !isNaN(informedRate) && informedRate > 0 ? informedRate / 100 : projectedExpensesAtStart / projectedPortfolioAtStart;
    const initialWithdrawal = projectedPortfolioAtStart * effectiveInitialRate;
    
    const baseSS = parseFloat(ssAmount) || 0;
    const ssStartAge = parseInt(ssAge) || 67;
    const startMonth = retirementStartDate.getMonth();
    const remainingMonthsFactor = (12 - startMonth) / 12;

    const evolution: any[] = [];
    let deterministicBalance = currentPortfolioValue;
    let deterministicWithdrawal = annualExpenses;
    let deterministicLastAge = ageToday;

    const maxAge = 100;
    const yearsToSimulate = userBirthDate ? (maxAge - ageToday) : 50;

    for (let years = 0; years <= yearsToSimulate; years++) {
      const currentSimYear = currentYear + years;
      const currentAge = ageToday + years;
      const isRetirementStarted = currentSimYear >= retirementYear;
      const yearStartPortfolio = deterministicBalance;
      let actualWithdrawal = 0;
      let yearSS = 0;

      if (isRetirementStarted) {
        const isFirstRetirementYear = currentSimYear === retirementYear;
        if (currentAge >= ssStartAge) {
          yearSS = baseSS * Math.pow(1 + inflationRate, years);
          if (isFirstRetirementYear) yearSS *= remainingMonthsFactor;
        }
        const targetTotalWithdrawal = isFirstRetirementYear ? initialWithdrawal : deterministicWithdrawal;
        let netWithdrawal = Math.max(0, targetTotalWithdrawal - yearSS);
        if (isFirstRetirementYear) netWithdrawal *= remainingMonthsFactor;
        actualWithdrawal = Math.min(deterministicBalance, netWithdrawal);
      }

      const balanceAfterWithdrawal = deterministicBalance - actualWithdrawal;
      const earnings = balanceAfterWithdrawal * returnRate;
      const yearEndBalance = balanceAfterWithdrawal + earnings;

      evolution.push({
        year: currentSimYear,
        age: currentAge,
        startBalance: yearStartPortfolio,
        expenses: isRetirementStarted ? (currentSimYear === retirementYear ? initialWithdrawal * remainingMonthsFactor : deterministicWithdrawal) : annualExpenses * Math.pow(1 + inflationRate, years),
        ssIncome: yearSS,
        netWithdrawal: actualWithdrawal,
        earnings: earnings,
        endBalance: yearEndBalance,
        isRetirement: isRetirementStarted
      });

      deterministicBalance = yearEndBalance;
      deterministicLastAge = currentAge;
      if (isRetirementStarted) {
        if (currentSimYear === retirementYear) { deterministicWithdrawal = initialWithdrawal * (1 + inflationRate); }
        else { deterministicWithdrawal = deterministicWithdrawal * (1 + inflationRate); }
      }
      if (deterministicBalance <= 0 && isRetirementStarted) break;
    }

    // Monte Carlo
    const numTrials = 5000;
    const stdDev = 0.15;
    const monteCarloResults: number[][] = [];
    let successes = 0;

    for (let t = 0; t < numTrials; t++) {
      let trialBalance = currentPortfolioValue;
      let trialWithdrawal = annualExpenses; 
      const trialPath: number[] = [trialBalance];

      for (let y = 0; y <= yearsToSimulate; y++) {
        const currentSimYear = currentYear + y;
        const currentAge = ageToday + y;
        const isRetirementStarted = currentSimYear >= retirementYear;
        let actualWithdrawal = 0;
        let yearSS = 0;

        if (isRetirementStarted) {
          const isFirstRetirementYear = currentSimYear === retirementYear;
          if (currentAge >= ssStartAge) {
            yearSS = baseSS * Math.pow(1 + inflationRate, y);
            if (isFirstRetirementYear) yearSS *= remainingMonthsFactor;
          }
          const targetTotalWithdrawal = isFirstRetirementYear ? initialWithdrawal : trialWithdrawal;
          let netWithdrawal = Math.max(0, targetTotalWithdrawal - yearSS);
          if (isFirstRetirementYear) netWithdrawal *= remainingMonthsFactor;
          actualWithdrawal = netWithdrawal;
        }

        trialBalance -= actualWithdrawal;
        const u1 = Math.random(); const u2 = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        const randomReturn = returnRate + (z * stdDev);
        trialBalance = Math.max(0, trialBalance * (1 + randomReturn));
        trialPath.push(trialBalance);
        if (isRetirementStarted) {
          if (currentSimYear === retirementYear) { trialWithdrawal = initialWithdrawal * (1 + inflationRate); }
          else { trialWithdrawal = trialWithdrawal * (1 + inflationRate); }
        }
        if (trialBalance <= 0 && isRetirementStarted) break;
      }
      const targetLifeYear = parseInt(lifeExpectancy) || 85;
      if (trialPath.length > (targetLifeYear - ageToday) && trialPath[Math.max(0, targetLifeYear - ageToday)] > 0) successes++;
      monteCarloResults.push(trialPath);
    }

    const chartData: any[] = [];
    for (let y = 0; y <= yearsToSimulate; y++) {
      const yearValues = monteCarloResults.map(path => path[y] ?? 0).sort((a, b) => a - b);
      const getPercentile = (p: number) => yearValues[Math.floor((yearValues.length - 1) * p)];
      chartData.push({ year: currentYear + y, p90: getPercentile(0.9), p75: getPercentile(0.75), median: getPercentile(0.5), p25: getPercentile(0.25), p10: getPercentile(0.1) });
      if (yearValues.every(v => v === 0) && y > yearsUntilRetirement) break;
    }

    // Find when 25th percentile is depleted
    let p25DepletionYear = currentYear + yearsToSimulate;
    const p25Path = chartData.map(d => d.p25);
    for (let i = 0; i < chartData.length; i++) {
      if (chartData[i].p25 <= 0) {
        p25DepletionYear = chartData[i].year;
        break;
      }
    }
    const p25LastAge = userBirthDate ? (p25DepletionYear - userBirthDate.getFullYear()) : deterministicLastAge;

    const targetLifeExpectancy = parseInt(lifeExpectancy) || 85;

    return {
      withdrawalRate: (effectiveInitialRate * 100).toFixed(2),
      years: evolution.length - (evolution[evolution.length-1].endBalance <= 0 ? 1 : 0),
      lastAge: p25LastAge,
      successRate: (successes / numTrials * 100).toFixed(2),
      annualExpenses: projectedExpensesAtStart,
      currentPortfolioValue,
      projectedPortfolioAtStart,
      retirementYear,
      p25DepletionYear,
      age85Year: currentYear + (targetLifeExpectancy - ageToday),
      isSustainable: deterministicLastAge >= targetLifeExpectancy,
      evolution,
      chartData
    };
  }, [totals.amount, totalPortfolioValue, retirementWithdrawalRate, retirementReturnRate, retirementInflationRate, retirementStartDate, userBirthDate, ssAmount, ssAge, lifeExpectancy, holdings]);

  // View States
  if (holdingsError || expensesError) {
    return (
      <div className="flex items-center justify-center h-64 flex-col gap-4 text-center">
        <div className="p-4 bg-red-50 rounded-full text-red-600"><Trash2 className="w-8 h-8" /></div>
        <div>
          <h3 className="text-lg font-bold text-slate-800">Failed to load financial data</h3>
          <p className="text-sm text-slate-500 max-w-sm">{(holdingsError?.message || expensesError?.message || "An unexpected error occurred.")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => { if (holdingsError) utils.portfolio.getAllHoldings.refetch(); if (expensesError) utils.fi.getExpenses.refetch(); }}>Retry Connection</Button>
        </div>
      </div>
    );
  }

  if (isHoldingsPending || isExpensesPending) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] flex-col gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#004a99]"></div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-700 uppercase tracking-widest animate-pulse">Establishing Secure Connection...</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-tight">Fetching Portfolio Dividends & Expenses</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-32">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-lg shadow-sm border border-border">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-700"><Calculator className="w-6 h-6" /></div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Financial Independence</h2>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Track your path to dividend-funded living</p>
          </div>
        </div>
      </div>

      {/* Income & Progress Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-white border-none shadow-md shadow-slate-200/50 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-green-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Est. Monthly Dividend Income</CardTitle>
              <Wallet className="w-4 h-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-800 tracking-tighter">{formatCurrency(monthlyIncome)}</div>
            <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-tight">Average based on annual projections</p>
          </CardContent>
        </Card>

        <Card className="bg-white border-none shadow-md shadow-slate-200/50 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">FI Progress Score</CardTitle>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-end mb-2">
              <div className="text-3xl font-black text-slate-800 tracking-tighter">{(totals.amount > 0 ? (monthlyIncome / totals.amount) * 100 : 0).toFixed(1)}%</div>
              <div className="text-right text-[10px] font-bold text-slate-500 uppercase">Gap: {formatCurrency(Math.max(0, totals.amount - monthlyIncome))}</div>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${Math.min(100, (totals.amount > 0 ? (monthlyIncome / totals.amount) * 100 : 0))}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Expenses Section */}
      <Card className="bg-white border-none shadow-md shadow-slate-200/50">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-4">
          <div className="flex items-center gap-2"><ReceiptText className="w-5 h-5 text-blue-600" /><CardTitle className="text-sm font-bold uppercase tracking-wider">Monthly Expenses & Coverage</CardTitle></div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild><Button size="sm" className="bg-[#004a99] hover:bg-[#003d7a] h-8 font-bold uppercase text-[10px] tracking-widest"><Plus className="w-3.5 h-3.5 mr-1.5" />Add Expense</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Monthly Expense</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">Description</label><Input placeholder="e.g., Rent" value={newExpense.description} onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })} /></div>
                <div className="space-y-2"><label className="text-xs font-bold text-slate-500 uppercase">Amount ($)</label><Input type="number" placeholder="0.00" value={newExpense.amount} onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={handleAddExpense} className="bg-[#004a99]">Add Expense</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="font-bold text-[10px] uppercase h-10">Description</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Monthly</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Annual</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Covered</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Covered %</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Remaining</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Remaining %</TableHead>
                  <TableHead className="text-center font-bold text-[10px] uppercase h-10">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distributedExpenses.length === 0 ? (<TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-400 italic">No expenses defined yet.</TableCell></TableRow>) : (
                  distributedExpenses.map((exp) => (
                    <TableRow key={exp.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-bold">{exp.description}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(exp.amount)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(exp.amount * 12)}</TableCell>
                      <TableCell className="text-right font-mono text-green-600">{formatCurrency(exp.covered)}</TableCell>
                      <TableCell className="text-right font-black">{exp.coveredPercent.toFixed(1)}%</TableCell>
                      <TableCell className="text-right font-mono text-red-500">{formatCurrency(exp.remainingAmount)}</TableCell>
                      <TableCell className="text-right">{exp.remainingPercent.toFixed(1)}%</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingExpense({ id: exp.id, description: exp.description, amount: exp.amount.toString() })}><Edit className="w-3" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => { if(confirm("Delete this expense?")) deleteExpenseMutation.mutate({ id: exp.id }); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {distributedExpenses.length > 0 && (
                <TableFooter className="bg-slate-50/50">
                  <TableRow>
                    <TableCell className="font-bold text-[10px] uppercase">Totals</TableCell>
                    <TableCell className="text-right font-mono font-bold">{formatCurrency(totals.amount)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(totals.amount * 12)}</TableCell>
                    <TableCell className="text-right font-mono text-green-700 font-bold">{formatCurrency(totals.covered)}</TableCell>
                    <TableCell className="text-right font-black">{(totals.amount > 0 ? (totals.covered / totals.amount) * 100 : 0).toFixed(1)}%</TableCell>
                    <TableCell className="text-right font-mono text-red-700 font-bold">{formatCurrency(totals.remaining)}</TableCell>
                    <TableCell className="text-right font-black">{(totals.amount > 0 ? (totals.remaining / totals.amount) * 100 : 0).toFixed(1)}%</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Total Portfolio Simulation */}
      <Card className="bg-white border-none shadow-md shadow-slate-200/50 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-4">
          <div className="flex items-center gap-2"><Target className="w-5 h-5 text-indigo-600" /><CardTitle className="text-sm font-bold uppercase tracking-wider">Total Portfolio Simulation (Full Coverage)</CardTitle></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input placeholder="Symbol" className="h-8 w-32 pl-8 text-[10px] font-bold uppercase" value={fullSimSymbol} onChange={(e) => setFullSimSymbol(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddFullSimAsset()} /></div>
            <Input type="number" placeholder="Alloc %" className="h-8 w-16 text-[10px] font-bold text-right" value={fullSimAllocation} onChange={(e) => setFullSimAllocation(e.target.value)} />
            <div className="flex items-center gap-1 bg-slate-50 px-2 rounded h-8 border border-slate-200"><span className="text-[8px] font-bold text-slate-400 uppercase">Usage %</span><Input type="number" className="h-6 w-12 border-none bg-transparent text-[10px] font-bold text-right p-0 focus-visible:ring-0" value={fullSimUsage} onChange={(e) => setFullSimUsage(e.target.value)} /></div>
            <Button size="sm" onClick={handleAddFullSimAsset} className="bg-indigo-600 hover:bg-indigo-700 h-8 font-bold uppercase text-[10px] tracking-widest" disabled={addFullSimAssetMutation.isPending}><Plus className="w-3.5 h-3.5 mr-1.5" />{addFullSimAssetMutation.isPending ? "..." : "Add"}</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 bg-indigo-50/30 border-b border-indigo-50 flex justify-between items-center"><p className="text-[10px] text-indigo-700 font-bold uppercase tracking-widest leading-relaxed">Strategy: Define a complete asset mix to cover all {formatCurrency(totals.amount)} expenses. Usage % defines spendable dividend portion.</p>{fullSimTotals.allocation !== 100 && (<p className="text-[10px] text-orange-600 font-black uppercase bg-orange-50 px-2 py-1 rounded">Alloc: {fullSimTotals.allocation.toFixed(1)}%</p>)}</div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="font-bold text-[10px] uppercase h-10">Asset</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Alloc %</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Usage %</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Des. Div (Used)</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Cur. Shares</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Rem. Shares</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Target Shares</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Progress %</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Cur. Capital</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Rem. Capital</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Total Capital</TableHead>
                  <TableHead className="text-center font-bold text-[10px] uppercase h-10">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fullSimulationResults.length === 0 ? (<TableRow><TableCell colSpan={11} className="text-center py-8 text-slate-400 italic text-xs">No simulation assets added.</TableCell></TableRow>) : (
                  fullSimulationResults.map((asset) => (
                    <TableRow key={asset.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-bold text-slate-700">{asset.symbol}</TableCell>
                      <TableCell className="text-right"><Input type="number" className="h-7 w-16 text-right font-mono text-[11px] ml-auto" value={asset.allocation} onChange={(e) => handleUpdateFullSim(asset.id, { allocation: e.target.value })} /></TableCell>
                      <TableCell className="text-right"><Input type="number" className="h-7 w-20 text-right font-mono text-[11px] ml-auto" value={asset.usagePercent} onChange={(e) => handleUpdateFullSim(asset.id, { usagePercent: e.target.value })} /></TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-green-600">{formatCurrency(asset.monthlyDivUsed)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-500">{asset.currentShares.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-indigo-600">{asset.remainingSharesNeeded.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-slate-700">{asset.totalSharesNeeded.toLocaleString()}</TableCell>
                      <TableCell className="text-right"><div className="flex flex-col items-end"><span className={`text-[10px] font-black ${asset.progressPercent >= 100 ? "text-green-600" : "text-blue-600"}`}>{asset.progressPercent.toFixed(1)}%</span><div className="w-12 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden"><div className={`h-full transition-all ${asset.progressPercent >= 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${Math.min(100, asset.progressPercent)}%` }} /></div></div></TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-500">{formatCurrency(asset.currentValue)}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-indigo-700">{formatCurrency(asset.remainingCostNeeded)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-400">{formatCurrency(asset.costNeeded)}</TableCell>
                      <TableCell className="text-center"><Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => deleteFullSimAssetMutation.mutate({ id: asset.id })}><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter className="bg-indigo-50/50">
                <TableRow>
                  <TableCell className="font-bold text-indigo-700 uppercase text-[10px]">Totals</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold">{fullSimTotals.allocation.toFixed(1)}%</TableCell><TableCell />
                  <TableCell className="text-right font-mono text-xs font-bold text-green-700">{formatCurrency(fullSimTotals.monthlyDivUsed)}</TableCell>
                  <TableCell colSpan={3} />
                  <TableCell className="text-right font-mono text-xs font-bold text-green-700">{(fullSimTotals.cost > 0 ? (fullSimTotals.currentValue / fullSimTotals.cost) * 100 : 0).toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-slate-500">{formatCurrency(fullSimTotals.currentValue)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-indigo-900">{formatCurrency(fullSimTotals.remainingCost)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-slate-500">{formatCurrency(fullSimTotals.cost)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Effort Simulation */}
      <Card className="bg-white border-none shadow-md shadow-slate-200/50 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-4">
          <div className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-emerald-600" />
            <CardTitle className="text-sm font-bold uppercase tracking-wider">Monthly Effort Simulation</CardTitle>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Target Goal Date</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-8 w-[160px] text-[10px] font-bold">
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {targetEffortDate ? format(targetEffortDate, "PPP") : "Pick Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar 
                    mode="single" 
                    selected={targetEffortDate} 
                    onSelect={(d) => { 
                      if (d) { 
                        setTargetEffortDate(d); 
                        updateRetirementSettingsMutation.mutate({ targetEffortDate: d });
                      } 
                    }} 
                    captionLayout="dropdown" 
                    fromYear={new Date().getFullYear()} 
                    toYear={new Date().getFullYear() + 30} 
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 bg-emerald-50/30 border-b border-emerald-50 flex justify-between items-center">
            <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-widest leading-relaxed">
              Plan: Investment required every month until {format(targetEffortDate, "MMMM yyyy")} ({effortResults?.months} months remaining).
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="font-bold text-[10px] uppercase h-10">Asset</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Monthly Target</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Purchased (CM)</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Capital Used (CM)</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Monthly Rem.</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Rem. Capital (CM)</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Monthly Capital</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Total Rem. Shares</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase h-10">Total Rem. Capital</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!effortResults || effortResults.assets.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-400 italic text-xs">Define your Total Portfolio Simulation above.</TableCell></TableRow>
                ) : (
                  effortResults.assets.map((asset) => (
                    <TableRow key={asset.symbol} className="hover:bg-slate-50/50">
                      <TableCell className="font-bold text-slate-700">{asset.symbol}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-slate-600">
                        {asset.monthlyShares.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-blue-600">
                        {asset.purchasedThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-blue-700">
                        {formatCurrency(asset.capitalPurchasedThisMonth)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-emerald-600">
                        {asset.monthlyRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-emerald-700">
                        {formatCurrency(asset.capitalForRemaining)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-slate-400">
                        {formatCurrency(asset.monthlyCapital)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-500">
                        {asset.remainingShares.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-500">
                        {formatCurrency(asset.remainingCapital)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter className="bg-emerald-50/50">
                <TableRow>
                  <TableCell className="font-bold text-emerald-700 uppercase text-[10px]">Totals</TableCell>
                  <TableCell />
                  <TableCell className="text-right font-mono text-xs font-bold text-blue-700">
                    {effortResults?.totals.purchasedThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-blue-900">
                    {formatCurrency(effortResults?.totals.capitalPurchasedThisMonth || 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-emerald-700">
                    {effortResults?.totals.monthlyRemaining.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-black text-emerald-900">
                    {formatCurrency(effortResults?.totals.capitalForRemaining || 0)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-slate-500">
                    {formatCurrency(effortResults?.totals.monthlyCapital || 0)} / mo
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right font-mono text-xs font-bold text-slate-700">
                    {formatCurrency(effortResults?.totals.remainingCapital || 0)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Longevity Simulation Section */}
      <Card className="bg-white border-none shadow-md shadow-slate-200/50 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-1 h-full bg-orange-500" />
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-4">
          <div className="flex items-center gap-2"><Target className="w-5 h-5 text-orange-600" /><CardTitle className="text-sm font-bold uppercase tracking-wider">Retirement Longevity Simulation</CardTitle></div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Birth Date</span>
              <Popover><PopoverTrigger asChild><Button variant="outline" className="h-8 w-[160px] text-[10px] font-bold">{userBirthDate ? format(userBirthDate, "PPP") : "Select Date"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={userBirthDate} onSelect={(d) => { if(d) { setUserBirthDate(d); updateRetirementSettingsMutation.mutate({ birthDate: d }); } }} captionLayout="dropdown" fromYear={1940} toYear={new Date().getFullYear()} /></PopoverContent></Popover>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Retirement Start</span>
              <Popover><PopoverTrigger asChild><Button variant="outline" className="h-8 w-[160px] text-[10px] font-bold">{retirementStartDate ? format(retirementStartDate, "PPP") : "Pick Date"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={retirementStartDate} onSelect={(d) => { if (d) { setRetirementStartDate(d); updateRetirementSettingsMutation.mutate({ startDate: d }); } }} captionLayout="dropdown" fromYear={new Date().getFullYear()} toYear={new Date().getFullYear()+50} /></PopoverContent></Popover>
            </div>
            <div className="flex flex-col gap-1"><span className="text-[10px] font-bold text-slate-400 uppercase">SS Annual</span><Input type="number" className="h-8 w-24 text-right" value={ssAmount} onChange={(e) => { setSsAmount(e.target.value); updateRetirementSettingsMutation.mutate({ ssAmount: e.target.value }); }} /></div>
            <div className="flex flex-col gap-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Withdrawal %</span><Input type="number" className="h-8 w-24 text-right" value={retirementWithdrawalRate} onChange={(e) => { setRetirementWithdrawalRate(e.target.value); updateRetirementSettingsMutation.mutate({ withdrawalRate: e.target.value }); }} /></div>
            <div className="flex flex-col gap-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Return %</span><Input type="number" className="h-8 w-16 text-right" value={retirementReturnRate} onChange={(e) => { setRetirementReturnRate(e.target.value); updateRetirementSettingsMutation.mutate({ returnRate: e.target.value }); }} /></div>
            <div className="flex flex-col gap-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Inflation %</span><Input type="number" className="h-8 w-16 text-right" value={retirementInflationRate} onChange={(e) => { setRetirementInflationRate(e.target.value); updateRetirementSettingsMutation.mutate({ inflationRate: e.target.value }); }} /></div>
            <div className="flex flex-col gap-1"><span className="text-[10px] font-bold text-slate-400 uppercase">Life Exp.</span><Input type="number" className="h-8 w-16 text-right" value={lifeExpectancy} onChange={(e) => { setLifeExpectancy(e.target.value); updateRetirementSettingsMutation.mutate({ lifeExpectancy: e.target.value }); }} /></div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {retirementResults && (
            <div className="space-y-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6">
                <div className="space-y-1"><p className="text-[10px] font-bold text-slate-400 uppercase">Current Value</p><p className="text-xl font-black">{formatCurrency(retirementResults.currentPortfolioValue)}</p></div>
                <div className="space-y-1"><p className="text-[10px] font-bold text-slate-400 uppercase">Value at Start</p><p className="text-xl font-black">{formatCurrency(retirementResults.projectedPortfolioAtStart)}</p></div>
                <div className="space-y-1"><p className="text-[10px] font-bold text-slate-400 uppercase">Annual Outflow</p><p className="text-xl font-black">{formatCurrency(retirementResults.annualExpenses)}</p></div>
                <div className="space-y-1"><p className="text-[10px] font-bold text-slate-400 uppercase">Initial Rate</p><p className="text-xl font-black">{retirementResults.withdrawalRate}%</p></div>
                <div className="bg-slate-900 rounded-xl p-4 text-center">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Sustainable Until</p>
                  <div className={cn(
                    "text-3xl font-black tracking-tighter",
                    parseFloat(retirementResults.successRate) >= 75 ? "text-green-400" : "text-orange-400"
                  )}>
                    Age {retirementResults.lastAge}
                  </div>
                  <p className={cn(
                    "text-[9px] font-bold uppercase mt-1",
                    parseFloat(retirementResults.successRate) >= 75 ? "text-green-500" : "text-orange-500"
                  )}>
                    {parseFloat(retirementResults.successRate) >= 75 ? `Success Rate ${retirementResults.successRate}%` : `Warning: Success Rate ${retirementResults.successRate}%`}
                  </p>
                </div>
              </div>

              {/* Monte Carlo Results */}
              <div className="p-4 bg-slate-50 rounded-xl border flex items-center justify-between">
                <div><h4 className="text-sm font-bold uppercase">Monte Carlo Success Rate: {retirementResults.successRate}%</h4><p className="text-[10px] opacity-60">Based on 5,000 simulations through Age {lifeExpectancy}.</p></div>
                <TrendingUp className="w-5 h-5 text-green-500" />
              </div>

              {/* Chart */}
              <div className="h-[400px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={retirementResults.chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="year" tick={{fontSize: 10}} />
                    <YAxis tick={{fontSize: 10}} tickFormatter={(v) => `$${(v / 1000000).toFixed(1)}M`} />
                    <ChartTooltip formatter={(v: any) => formatCurrency(v as number)} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '20px' }} />
                    <ReferenceLine 
                      x={retirementResults.retirementYear} 
                      stroke="#3b82f6" 
                      strokeDasharray="3 3" 
                      label={{ value: 'Retirement', position: 'insideTopLeft', fill: '#3b82f6', fontSize: 10, fontWeight: 'bold', offset: 10 }} 
                    />
                    <ReferenceLine 
                      x={retirementResults.p25DepletionYear} 
                      stroke={retirementResults.lastAge >= (parseInt(lifeExpectancy) || 85) ? "#10b981" : "#f87171"} 
                      strokeDasharray="3 3" 
                      label={{ 
                        value: `Sustainable until Age ${retirementResults.lastAge}`, 
                        position: 'insideTopRight', 
                        fill: retirementResults.lastAge >= (parseInt(lifeExpectancy) || 85) ? "#10b981" : "#f87171", 
                        fontSize: 10, 
                        fontWeight: 'bold', 
                        offset: 10 
                      }} 
                    />
                    <Area type="monotone" dataKey="p90" name="90th %" stroke="#4ade80" fill="#4ade80" fillOpacity={0.05} />
                    <Area type="monotone" dataKey="p75" name="75th %" stroke="#60a5fa" fill="#60a5fa" fillOpacity={0.1} />
                    <Area type="monotone" dataKey="median" name="Median" stroke="#facc15" fill="#facc15" fillOpacity={0.1} />
                    <Area type="monotone" dataKey="p25" name="25th %" stroke="#fb923c" fill="#fb923c" fillOpacity={0.1} />
                    <Area type="monotone" dataKey="p10" name="10th %" stroke="#f87171" fill="#f87171" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Evolution Table */}
              <div className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader><TableRow className="bg-slate-50 h-10"><TableHead className="font-bold text-[9px] uppercase">Year</TableHead><TableHead className="font-bold text-[9px] uppercase">Age</TableHead><TableHead className="text-right font-bold text-[9px] uppercase">Start</TableHead><TableHead className="text-right font-bold text-[9px] uppercase">Return</TableHead><TableHead className="text-right font-bold text-[9px] uppercase">SS</TableHead><TableHead className="text-right font-bold text-[9px] uppercase">Port. Withdrawal</TableHead><TableHead className="text-right font-bold text-[9px] uppercase">Expenses</TableHead><TableHead className="text-right font-bold text-[9px] uppercase">End</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {retirementResults.evolution.map((step: any) => (
                      <TableRow key={step.year} className={cn("h-8", !step.isRetirement && "opacity-60")}>
                        <TableCell className="font-bold text-xs">{step.year}</TableCell><TableCell className="text-xs">{step.age}</TableCell><TableCell className="text-right font-mono text-[11px]">{formatCurrency(step.startBalance)}</TableCell><TableCell className="text-right font-mono text-[11px] text-green-600">+{formatCurrency(step.earnings)}</TableCell><TableCell className="text-right font-mono text-[11px] text-green-700">{step.ssIncome > 0 ? formatCurrency(step.ssIncome) : "—"}</TableCell><TableCell className="text-right font-mono text-[11px] text-red-500">{step.netWithdrawal > 0 ? `-${formatCurrency(step.netWithdrawal)}` : "—"}</TableCell><TableCell className="text-right font-mono text-[11px] text-slate-500">{formatCurrency(step.expenses)}</TableCell><TableCell className="text-right font-mono text-[11px] font-bold">{formatCurrency(step.endBalance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Expense Dialog */}
      <Dialog open={!!editingExpense} onOpenChange={() => setEditingExpense(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader><DialogTitle>Edit Monthly Expense</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="grid gap-2"><label className="text-xs font-bold uppercase opacity-60">Description</label><Input value={editingExpense?.description || ""} onChange={(e) => setEditingExpense(prev => prev ? ({ ...prev, description: e.target.value }) : null)} /></div>
            <div className="grid gap-2"><label className="text-xs font-bold uppercase opacity-60">Amount ($)</label><Input type="number" step="0.01" value={editingExpense?.amount || ""} onChange={(e) => setEditingExpense(prev => prev ? ({ ...prev, amount: e.target.value }) : null)} /></div>
            <div className="flex justify-end gap-3 pt-4"><Button variant="outline" onClick={() => setEditingExpense(null)}>Cancel</Button><Button onClick={handleUpdateExpense} disabled={updateExpenseMutation.isPending}>Save Changes</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinanceIndependence;
