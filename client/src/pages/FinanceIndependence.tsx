import React, { useState, useMemo } from "react";
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
  Calendar as CalendarIcon 
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const FinanceIndependence: React.FC = () => {
  const utils = trpc.useUtils();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<{ id: number; description: string; amount: string } | null>(null);
  const [newExpense, setNewExpense] = useState({ description: "", amount: "" });
  
  // Bridge Simulation State
  const [simulationSymbol, setSimulationSymbol] = useState("");
  const [simulationAllocation, setSimulationAllocation] = useState("0");
  
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

  // Data fetching
  const { data: user } = trpc.auth.me.useQuery();
  const { data: holdings, isPending: isHoldingsPending, error: holdingsError } = trpc.portfolio.getAllHoldings.useQuery();
  const { data: expenses, isPending: isExpensesPending, error: expensesError } = trpc.fi.getExpenses.useQuery();
  const { data: simulationData, isPending: isSimPending } = trpc.fi.getSimulationData.useQuery();
  const { data: fullSimData, isPending: isFullSimPending } = trpc.fi.getFullSimulationData.useQuery();
  const { data: portfolios } = trpc.portfolio.getDetailedAll.useQuery();

  // Initialize retirement settings from user data
  React.useEffect(() => {
    if (user) {
      if (user.retirementWithdrawalRate) setRetirementWithdrawalRate(user.retirementWithdrawalRate);
      if (user.retirementReturnRate) setRetirementReturnRate(user.retirementReturnRate);
      if (user.retirementInflationRate) setRetirementInflationRate(user.retirementInflationRate);
      if (user.retirementStartDate) setRetirementStartDate(new Date(user.retirementStartDate));
      if (user.userBirthDate) setUserBirthDate(new Date(user.userBirthDate));
      if (user.ssAmount) setSsAmount(user.ssAmount);
      if (user.ssAge) setSsAge(user.ssAge);
    }
  }, [user]);

  const updateRetirementSettingsMutation = trpc.fi.updateRetirementSettings.useMutation();

  const totalPortfolioValue = useMemo(() => {
    if (!portfolios) return 0;
    const cash = portfolios.reduce((acc, p) => acc + parseFloat(p.cashValue), 0);
    const investment = portfolios.reduce((acc, p) => acc + parseFloat(p.investmentValue), 0);
    return cash + investment;
  }, [portfolios]);

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

  const addSimAssetMutation = trpc.fi.addSimulationAsset.useMutation({
    onSuccess: () => {
      toast.success("Asset added to bridge simulation");
      utils.fi.getSimulationData.invalidate();
      setSimulationSymbol("");
      setSimulationAllocation("0");
    },
  });

  const updateSimAssetMutation = trpc.fi.updateSimulationAsset.useMutation({
    onSuccess: () => utils.fi.getSimulationData.invalidate(),
  });

  const deleteSimAssetMutation = trpc.fi.deleteSimulationAsset.useMutation({
    onSuccess: () => {
      toast.success("Asset removed from bridge simulation");
      utils.fi.getSimulationData.invalidate();
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

  // Calculations
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

  const remainingGap = Math.max(0, totals.amount - monthlyIncome);

  // Bridge Simulation Calculation
  const simulationResults = useMemo(() => {
    if (!simulationData || simulationData.length === 0 || remainingGap <= 0) return [];

    let weightedYieldSum = 0;
    simulationData.forEach(asset => {
      const alloc = parseFloat(asset.allocation) || 0;
      const yield_ = asset.price > 0 ? (asset.annualDPS / 12) / asset.price : 0;
      weightedYieldSum += (alloc / 100) * yield_;
    });

    if (weightedYieldSum <= 0) return [];
    const totalCapitalNeeded = remainingGap / weightedYieldSum;

    return simulationData.map(asset => {
      const allocationPercent = parseFloat(asset.allocation) || 0;
      const costNeeded = totalCapitalNeeded * (allocationPercent / 100);
      const sharesNeeded = asset.price > 0 ? Math.ceil(costNeeded / asset.price) : 0;
      const monthlyDPS = asset.annualDPS / 12;
      const totalMonthlyDiv = sharesNeeded * monthlyDPS;
      
      const currentShares = holdings
        ? holdings
            .filter(h => h.symbol.toUpperCase() === asset.symbol.toUpperCase())
            .reduce((sum, h) => sum + parseFloat(h.quantity.toString()), 0)
        : 0;
      const currentMonthlyDiv = currentShares * monthlyDPS;

      return { ...asset, monthlyDPS, sharesNeeded, costNeeded, allocationPercent, totalMonthlyDiv, currentMonthlyDiv };
    });
  }, [simulationData, remainingGap, holdings]);

  const simTotals = useMemo(() => {
    return simulationResults.reduce((acc, curr) => ({
      cost: acc.cost + curr.costNeeded,
      shares: acc.shares + curr.sharesNeeded,
      allocation: acc.allocation + curr.allocationPercent,
      currentMonthlyDiv: acc.currentMonthlyDiv + curr.currentMonthlyDiv,
      totalMonthlyDiv: acc.totalMonthlyDiv + curr.totalMonthlyDiv
    }), { cost: 0, shares: 0, allocation: 0, currentMonthlyDiv: 0, totalMonthlyDiv: 0 });
  }, [simulationResults]);

  // Full Simulation Calculation
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
      
      const currentShares = holdings
        ? holdings
            .filter(h => h.symbol.toUpperCase() === asset.symbol.toUpperCase())
            .reduce((sum, h) => sum + parseFloat(h.quantity.toString()), 0)
        : 0;

      const currentValue = currentShares * asset.price;
      const remainingSharesNeeded = Math.max(0, totalSharesNeeded - currentShares);
      const remainingCostNeeded = remainingSharesNeeded * asset.price;
      const progressPercent = costNeeded > 0 ? (currentValue / costNeeded) * 100 : 0;

      const monthlyDPS = asset.annualDPS / 12;
      const currentMonthlyDiv = currentShares * monthlyDPS;
      const desiredMonthlyDiv = totalSharesNeeded * monthlyDPS;
      const monthlyDivUsed = (desiredMonthlyDiv * usagePercent) / 100;

      return { 
        ...asset, 
        monthlyDPS, 
        totalSharesNeeded, 
        costNeeded, 
        currentShares,
        currentValue,
        remainingSharesNeeded,
        remainingCostNeeded,
        progressPercent,
        allocationPercent, 
        usagePercent, 
        currentMonthlyDiv, 
        desiredMonthlyDiv,
        monthlyDivUsed 
      };
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

  const handleAddExpense = () => {
    if (!newExpense.description || !newExpense.amount) return;
    addExpenseMutation.mutate(newExpense);
  };

  const handleUpdateExpense = () => {
    if (!editingExpense) return;
    updateExpenseMutation.mutate({ id: editingExpense.id, description: editingExpense.description, amount: editingExpense.amount });
  };

  const handleAddSimAsset = () => {
    if (!simulationSymbol) return;
    addSimAssetMutation.mutate({ symbol: simulationSymbol, allocation: simulationAllocation });
  };

  const handleUpdateSimAllocation = (id: number, val: string) => {
    updateSimAssetMutation.mutate({ id, allocation: val });
  };

  const handleAddFullSimAsset = () => {
    if (!fullSimSymbol) return;
    addFullSimAssetMutation.mutate({ symbol: fullSimSymbol, allocation: fullSimAllocation, usagePercent: fullSimUsage });
  };

  const handleUpdateFullSim = (id: number, updates: { allocation?: string, usagePercent?: string }) => {
    updateFullSimAssetMutation.mutate({ id, ...updates });
  };

  // Retirement Simulation Calculation
  const retirementResults = useMemo(() => {
    const annualExpenses = totals.amount * 12;
    let currentPortfolioValue = totalPortfolioValue;

    if (currentPortfolioValue <= 0 || annualExpenses <= 0) return null;

    const returnRate = parseFloat(retirementReturnRate) / 100;
    const inflationRate = parseFloat(retirementInflationRate) / 100 || 0;
    const now = new Date();

    // 1. Project growth and expense inflation if retirement is in the future
    let projectedPortfolioAtStart = currentPortfolioValue;
    let projectedExpensesAtStart = annualExpenses;
    
    if (retirementStartDate > now) {
      const yearsToRetirement = (retirementStartDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      projectedPortfolioAtStart = currentPortfolioValue * Math.pow(1 + returnRate, yearsToRetirement);
      projectedExpensesAtStart = annualExpenses * Math.pow(1 + inflationRate, yearsToRetirement);
    }

    // 2. Calculate Initial Withdrawal Rate
    const informedRate = parseFloat(retirementWithdrawalRate);
    const effectiveInitialRate = !isNaN(informedRate) && informedRate > 0 
      ? informedRate / 100 
      : projectedExpensesAtStart / projectedPortfolioAtStart;

    const initialWithdrawal = projectedPortfolioAtStart * effectiveInitialRate;
    
    // 3. Social Security Projection
    const baseSS = parseFloat(ssAmount) || 0;
    const ssStartAge = parseInt(ssAge) || 67;

    // 4. Estimate Years with Age and SS
    const startMonth = retirementStartDate.getMonth();
    const remainingMonthsFactor = (12 - startMonth) / 12;

    let years = 0;
    let balance = projectedPortfolioAtStart;
    let currentWithdrawal = initialWithdrawal;
    const evolution: any[] = [];
    
    // Max age for simulation is 100
    const currentYear = new Date().getFullYear();
    const retirementYear = retirementStartDate.getFullYear();
    
    // Calculate user age at retirement
    let ageAtRetirement = 0;
    if (userBirthDate) {
      ageAtRetirement = retirementYear - userBirthDate.getFullYear();
    }

    const maxSimulationYears = userBirthDate ? (100 - ageAtRetirement) : 50;
    let lastAge = ageAtRetirement;

    while (balance > 0 && years <= maxSimulationYears) {
      const isFirstYear = years === 0;
      const yearStartPortfolio = balance;
      const currentSimYear = retirementYear + years;
      const currentAge = ageAtRetirement + years;
      
      // Calculate SS for this year
      let yearSS = 0;
      if (currentAge >= ssStartAge) {
        // Adjust base SS by inflation for the number of years since NOW
        const yearsFromNow = currentSimYear - currentYear;
        yearSS = baseSS * Math.pow(1 + inflationRate, yearsFromNow);
        if (isFirstYear) yearSS *= remainingMonthsFactor;
      }

      // Net withdrawal needed from portfolio (Expenses - SS)
      const targetTotalWithdrawal = isFirstYear ? currentWithdrawal * remainingMonthsFactor : currentWithdrawal;
      const netWithdrawalFromPortfolio = Math.max(0, targetTotalWithdrawal - yearSS);
      
      const actualWithdrawal = Math.min(balance, netWithdrawalFromPortfolio);
      const remainingBalanceAfterWithdrawal = balance - actualWithdrawal;
      
      const effectiveReturnRate = isFirstYear ? returnRate * remainingMonthsFactor : returnRate;
      const earnings = remainingBalanceAfterWithdrawal * effectiveReturnRate;
      const yearEndBalance = remainingBalanceAfterWithdrawal + earnings;

      evolution.push({
        year: currentSimYear,
        age: currentAge,
        startBalance: yearStartPortfolio,
        withdrawal: targetTotalWithdrawal,
        ssIncome: yearSS,
        netWithdrawal: actualWithdrawal,
        earnings: earnings,
        endBalance: yearEndBalance,
        isProportional: isFirstYear && remainingMonthsFactor < 1
      });
      
      balance = yearEndBalance;
      lastAge = currentAge;
      if (balance <= 0) break;
      
      currentWithdrawal = currentWithdrawal * (1 + inflationRate);
      years++;
    }

    return {
      withdrawalRate: (effectiveInitialRate * 100).toFixed(2),
      years: evolution.length - (evolution[evolution.length-1].endBalance <= 0 ? 1 : 0),
      lastAge,
      annualExpenses: projectedExpensesAtStart,
      currentPortfolioValue,
      projectedPortfolioAtStart,
      isSustainable: lastAge >= 85,
      evolution
    };
  }, [totals.amount, totalPortfolioValue, retirementWithdrawalRate, retirementReturnRate, retirementInflationRate, retirementStartDate, userBirthDate, ssAmount, ssAge]);

  if (holdingsError || expensesError) {
    return (
      <div className="flex items-center justify-center h-64 flex-col gap-4 text-center">
        <div className="p-4 bg-red-50 rounded-full text-red-600">
          <Trash2 className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800">Failed to load financial data</h3>
          <p className="text-sm text-slate-500 max-w-sm">{(holdingsError?.message || expensesError?.message || "An unexpected error occurred.")}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => {
            if (holdingsError) utils.portfolio.getAllHoldings.refetch();
            if (expensesError) utils.fi.getExpenses.refetch();
          }}>Retry Connection</Button>
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
          <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Financial Independence</h2>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Track your path to dividend-funded living</p>
          </div>
        </div>
      </div>

      {/* Income Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
      </div>

      {/* Expenses Table */}
      <Card className="bg-white border-none shadow-md shadow-slate-200/50">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-4">
          <div className="flex items-center gap-2">
            <ReceiptText className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-sm font-bold uppercase tracking-wider">Monthly Expenses & Coverage</CardTitle>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-[#004a99] hover:bg-[#003d7a] h-8 font-bold uppercase text-[10px] tracking-widest">
                <Plus className="w-3.5 h-3.5 mr-1.5" />Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Monthly Expense</DialogTitle></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                  <Input placeholder="e.g., Rent, Grocery, Utilities" value={newExpense.description} onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Amount ($)</label>
                  <Input type="number" placeholder="0.00" value={newExpense.amount} onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })} />
                </div>
              </div>
              <DialogFooter><Button onClick={handleAddExpense} className="bg-[#004a99]">Add Expense</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="font-bold text-[10px] uppercase tracking-widest h-10">Description</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Monthly Amount</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Annual Amount</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Covered</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Covered %</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Remaining</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Remaining %</TableHead>
                  <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest h-10">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distributedExpenses.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-400 italic text-sm">No expenses defined yet.</TableCell></TableRow>
                ) : (
                  distributedExpenses.map((exp) => (
                    <TableRow key={exp.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-bold text-slate-700">{exp.description}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900">{formatCurrency(exp.amount)}</TableCell>
                      <TableCell className="text-right font-mono text-slate-500">{formatCurrency(exp.amount * 12)}</TableCell>
                      <TableCell className="text-right font-mono text-green-600 font-bold">{formatCurrency(exp.covered)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className={`text-[11px] font-black ${exp.coveredPercent >= 100 ? "text-green-600" : "text-orange-600"}`}>{exp.coveredPercent.toFixed(1)}%</span>
                          <div className="w-16 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full transition-all ${exp.coveredPercent >= 100 ? "bg-green-500" : "bg-orange-500"}`} style={{ width: `${Math.min(100, exp.coveredPercent)}%` }} />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-500">{formatCurrency(exp.remainingAmount)}</TableCell>
                      <TableCell className="text-right text-[11px] font-bold text-slate-400">{exp.remainingPercent.toFixed(1)}%</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600" onClick={() => setEditingExpense({ id: exp.id, description: exp.description, amount: exp.amount.toString() })}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" onClick={() => { if (confirm("Delete this expense?")) deleteExpenseMutation.mutate({ id: exp.id }); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {distributedExpenses.length > 0 && (
                <TableFooter className="bg-slate-50/50 border-t-2 border-slate-100">
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="font-bold text-slate-600 uppercase text-[10px] tracking-widest">Total</TableCell>
                    <TableCell className="text-right font-mono font-black text-slate-900">{formatCurrency(totals.amount)}</TableCell>
                    <TableCell className="text-right font-mono text-slate-500">{formatCurrency(totals.amount * 12)}</TableCell>
                    <TableCell className="text-right font-mono font-black text-green-700">{formatCurrency(totals.covered)}</TableCell>
                    <TableCell className="text-right font-black text-green-700">{(totals.amount > 0 ? (totals.covered / totals.amount) * 100 : 0).toFixed(1)}%</TableCell>
                    <TableCell className="text-right font-mono font-black text-red-700">{formatCurrency(totals.remaining)}</TableCell>
                    <TableCell className="text-right font-black text-red-700">{(totals.amount > 0 ? (totals.remaining / totals.amount) * 100 : 0).toFixed(1)}%</TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Progress Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-white border-none shadow-md shadow-slate-200/50">
          <CardHeader><CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">Financial Independence Progress</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-4xl font-black text-slate-800 tracking-tighter">{(totals.amount > 0 ? (monthlyIncome / totals.amount) * 100 : 0).toFixed(1)}%</div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">FI Score (Income / Total Expenses)</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-slate-700">{formatCurrency(Math.max(0, totals.amount - monthlyIncome))}</div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gap to Full FI</div>
                </div>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 transition-all duration-1000" style={{ width: `${Math.min(100, (totals.amount > 0 ? (monthlyIncome / totals.amount) * 100 : 0))}%` }} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FI Bridge Simulation */}
      <Card className="bg-white border-none shadow-md shadow-slate-200/50">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-4">
          <div className="flex items-center gap-2">
            <BarChart className="w-5 h-5 text-purple-600" />
            <CardTitle className="text-sm font-bold uppercase tracking-wider">FI Bridge Simulation</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Symbol" className="h-8 w-24 pl-8 text-[10px] font-bold uppercase" value={simulationSymbol} onChange={(e) => setSimulationSymbol(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddSimAsset()} />
            </div>
            <Input type="number" placeholder="Alloc %" className="h-8 w-16 text-[10px] font-bold text-right" value={simulationAllocation} onChange={(e) => setSimulationAllocation(e.target.value)} />
            <Button size="sm" onClick={handleAddSimAsset} className="bg-purple-600 hover:bg-purple-700 h-8 font-bold uppercase text-[10px] tracking-widest" disabled={addSimAssetMutation.isPending}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />{addSimAssetMutation.isPending ? "..." : "Add"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 bg-purple-50/30 border-b border-purple-50 flex justify-between items-center">
            <p className="text-[10px] text-purple-700 font-bold uppercase tracking-widest">
              Strategy: Distributing required capital for the {formatCurrency(remainingGap)} gap based on allocation.
            </p>
            {simTotals.allocation !== 100 && (
              <p className="text-[10px] text-orange-600 font-black uppercase bg-orange-50 px-2 py-1 rounded">Alloc: {simTotals.allocation.toFixed(1)}%</p>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="font-bold text-[10px] uppercase tracking-widest h-10">Asset</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Alloc %</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Cur. Monthly Div</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Des. Monthly Div</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Shares Needed</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Capital Required</TableHead>
                  <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest h-10">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {simulationResults.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400 italic text-xs">No assets defined.</TableCell></TableRow>
                ) : (
                  simulationResults.map((asset) => (
                    <TableRow key={asset.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-bold text-slate-700">{asset.symbol}</TableCell>
                      <TableCell className="text-right"><Input type="number" className="h-7 w-16 text-right font-mono text-[11px] ml-auto" value={asset.allocation} onChange={(e) => handleUpdateSimAllocation(asset.id, e.target.value)} /></TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-500">{formatCurrency(asset.currentMonthlyDiv)}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-green-600">{formatCurrency(asset.totalMonthlyDiv)}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-blue-600">{asset.sharesNeeded.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold">{formatCurrency(asset.costNeeded)}</TableCell>
                      <TableCell className="text-center"><Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-600" onClick={() => deleteSimAssetMutation.mutate({ id: asset.id })}><Trash2 className="w-3.5 h-3.5" /></Button></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              <TableFooter className="bg-purple-50/50">
                <TableRow>
                  <TableCell className="font-bold text-purple-700 uppercase text-[10px]">Totals</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold">{simTotals.allocation.toFixed(1)}%</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-slate-500">{formatCurrency(simTotals.currentMonthlyDiv)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-green-700">{formatCurrency(simTotals.totalMonthlyDiv)}</TableCell>
                  <TableCell /><TableCell className="text-right font-mono text-xs font-bold text-purple-900">{formatCurrency(simTotals.cost)}</TableCell><TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Total Portfolio Simulation */}
      <Card className="bg-white border-none shadow-md shadow-slate-200/50">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            <CardTitle className="text-sm font-bold uppercase tracking-wider">Total Portfolio Simulation</CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Symbol" className="h-8 w-24 pl-8 text-[10px] font-bold uppercase" value={fullSimSymbol} onChange={(e) => setFullSimSymbol(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleAddFullSimAsset()} />
            </div>
            <Input type="number" placeholder="Alloc %" className="h-8 w-16 text-[10px] font-bold text-right" value={fullSimAllocation} onChange={(e) => setFullSimAllocation(e.target.value)} />
            <div className="flex items-center gap-1 bg-slate-50 px-2 rounded h-8 border border-slate-200">
               <span className="text-[8px] font-bold text-slate-400 uppercase">Usage %</span>
               <Input type="number" className="h-6 w-12 border-none bg-transparent text-[10px] font-bold text-right p-0 focus-visible:ring-0" value={fullSimUsage} onChange={(e) => setFullSimUsage(e.target.value)} />
            </div>
            <Button size="sm" onClick={handleAddFullSimAsset} className="bg-indigo-600 hover:bg-indigo-700 h-8 font-bold uppercase text-[10px] tracking-widest" disabled={addFullSimAssetMutation.isPending}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />{addFullSimAssetMutation.isPending ? "..." : "Add"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 bg-indigo-50/30 border-b border-indigo-50 flex justify-between items-center">
            <p className="text-[10px] text-indigo-700 font-bold uppercase tracking-widest leading-relaxed">
              Target: Cover {formatCurrency(totals.amount)} total monthly expenses. 
              Capital is distributed based on allocation; "Usage %" defines spendable dividend portion.
            </p>
            {fullSimTotals.allocation !== 100 && (
              <p className="text-[10px] text-orange-600 font-black uppercase bg-orange-50 px-2 py-1 rounded">Alloc: {fullSimTotals.allocation.toFixed(1)}%</p>
            )}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50">
                  <TableHead className="font-bold text-[10px] uppercase tracking-widest h-10">Asset</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Alloc %</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Usage %</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Cur. Monthly Div</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Des. Monthly Div (Used)</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Des. Monthly Div (Gross)</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Current Shares</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Total Shares Needed</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Rem. Shares Needed</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Current Value</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Progress %</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Rem. Capital Needed</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Total Capital</TableHead>
                  <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest h-10">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fullSimulationResults.length === 0 ? (
                  <TableRow><TableCell colSpan={14} className="text-center py-8 text-slate-400 italic text-xs">No simulation assets added.</TableCell></TableRow>
                ) : (
                  fullSimulationResults.map((asset) => (
                    <TableRow key={asset.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-bold text-slate-700">{asset.symbol}</TableCell>
                      <TableCell className="text-right"><Input type="number" className="h-7 w-16 text-right font-mono text-[11px] ml-auto" value={asset.allocation} onChange={(e) => handleUpdateFullSim(asset.id, { allocation: e.target.value })} /></TableCell>
                      <TableCell className="text-right"><Input type="number" className="h-7 w-16 text-right font-mono text-[11px] ml-auto" value={asset.usagePercent} onChange={(e) => handleUpdateFullSim(asset.id, { usagePercent: e.target.value })} /></TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-500">{formatCurrency(asset.currentMonthlyDiv)}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-green-600">{formatCurrency(asset.monthlyDivUsed)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-400">{formatCurrency(asset.desiredMonthlyDiv)}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-500">{asset.currentShares.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-slate-700">{asset.totalSharesNeeded.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold text-indigo-600">{asset.remainingSharesNeeded.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-slate-500">{formatCurrency(asset.currentValue)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className={`text-[10px] font-black ${asset.progressPercent >= 100 ? "text-green-600" : "text-blue-600"}`}>{asset.progressPercent.toFixed(1)}%</span>
                          <div className="w-12 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full transition-all ${asset.progressPercent >= 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${Math.min(100, asset.progressPercent)}%` }} />
                          </div>
                        </div>
                      </TableCell>
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
                  <TableCell className="text-right font-mono text-xs font-bold text-slate-500">{formatCurrency(fullSimTotals.currentMonthlyDiv)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-green-700">{formatCurrency(fullSimTotals.monthlyDivUsed)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-slate-400">{formatCurrency(fullSimTotals.desiredMonthlyDiv)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-slate-700">{fullSimTotals.currentShares.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-slate-700">{fullSimTotals.totalShares.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-indigo-700">{fullSimTotals.remainingShares.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-slate-500">{formatCurrency(fullSimTotals.currentValue)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-green-700">
                    {(fullSimTotals.cost > 0 ? (fullSimTotals.currentValue / fullSimTotals.cost) * 100 : 0).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-indigo-900">{formatCurrency(fullSimTotals.remainingCost)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-bold text-slate-500">{formatCurrency(fullSimTotals.cost)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Retirement Longevity Simulation */}
      <Card className="bg-white border-none shadow-md shadow-slate-200/50 overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-orange-500" />
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-4">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-orange-600" />
            <CardTitle className="text-sm font-bold uppercase tracking-wider">Retirement Longevity Simulation</CardTitle>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Your Birth Date</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-8 w-[160px] justify-start text-left font-bold text-[10px] uppercase", !userBirthDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {userBirthDate ? format(userBirthDate, "PPP") : <span>Select Date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar 
                    mode="single" 
                    selected={userBirthDate} 
                    onSelect={(date) => {
                      setUserBirthDate(date);
                      if (date) updateRetirementSettingsMutation.mutate({ birthDate: date });
                    }} 
                    captionLayout="dropdown" 
                    fromYear={1940} 
                    toYear={new Date().getFullYear()} 
                    initialFocus 
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Retirement Start</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("h-8 w-[160px] justify-start text-left font-bold text-[10px] uppercase", !retirementStartDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {retirementStartDate ? format(retirementStartDate, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar 
                    mode="single" 
                    selected={retirementStartDate} 
                    onSelect={(date) => {
                      if (date) {
                        setRetirementStartDate(date);
                        updateRetirementSettingsMutation.mutate({ startDate: date });
                      }
                    }} 
                    captionLayout="dropdown" 
                    fromYear={new Date().getFullYear()} 
                    toYear={new Date().getFullYear() + 50} 
                    initialFocus 
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">SS Annual Benefit</span>
              <Input 
                type="number" 
                placeholder="$0.00" 
                className="h-8 w-28 text-[10px] font-bold text-right" 
                value={ssAmount} 
                onChange={(e) => {
                  setSsAmount(e.target.value);
                  updateRetirementSettingsMutation.mutate({ ssAmount: e.target.value });
                }} 
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">SS Start Age</span>
              <Input 
                type="number" 
                min="62" 
                max="70" 
                className="h-8 w-20 text-[10px] font-bold text-right" 
                value={ssAge} 
                onChange={(e) => {
                  setSsAge(e.target.value);
                  updateRetirementSettingsMutation.mutate({ ssAge: e.target.value });
                }} 
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Withdrawal Rate (%)</span>
              <Input 
                type="number" 
                placeholder={`Auto: ${retirementResults?.withdrawalRate}%`} 
                className="h-8 w-40 text-[10px] font-bold text-right" 
                value={retirementWithdrawalRate} 
                onChange={(e) => {
                  setRetirementWithdrawalRate(e.target.value);
                  updateRetirementSettingsMutation.mutate({ withdrawalRate: e.target.value });
                }} 
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Return Rate (%)</span>
              <Input 
                type="number" 
                className="h-8 w-20 text-[10px] font-bold text-right" 
                value={retirementReturnRate} 
                onChange={(e) => {
                  setRetirementReturnRate(e.target.value);
                  updateRetirementSettingsMutation.mutate({ returnRate: e.target.value });
                }} 
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Inflation (%)</span>
              <Input 
                type="number" 
                className="h-8 w-20 text-[10px] font-bold text-right" 
                value={retirementInflationRate} 
                onChange={(e) => {
                  setRetirementInflationRate(e.target.value);
                  updateRetirementSettingsMutation.mutate({ inflationRate: e.target.value });
                }} 
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {!retirementResults ? (
            <div className="py-8 text-center text-slate-400 italic text-sm">
              Define expenses and portfolios to see longevity estimates.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Current Value</p>
                <p className="text-xl font-black text-slate-500 font-mono">{formatCurrency(retirementResults.currentPortfolioValue)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Value at Retirement</p>
                <p className="text-xl font-black text-slate-800 font-mono">{formatCurrency(retirementResults.projectedPortfolioAtStart)}</p>
                {retirementResults.projectedPortfolioAtStart > retirementResults.currentPortfolioValue && (
                  <p className="text-[9px] text-green-600 font-bold uppercase mt-1 leading-none">
                    Includes projected growth
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Annual Outflow</p>
                <p className="text-xl font-black text-slate-700 font-mono">{formatCurrency(retirementResults.annualExpenses)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Withdrawal Rate</p>
                <p className={`text-xl font-black font-mono ${parseFloat(retirementResults.withdrawalRate) <= 4 ? "text-green-600" : "text-orange-600"}`}>
                  {retirementResults.withdrawalRate}%
                </p>
              </div>
              <div className="bg-slate-900 rounded-xl p-4 flex flex-col items-center justify-center text-center shadow-xl shadow-slate-200">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Sustainable Until</p>
                <div className={`text-3xl font-black tracking-tighter ${retirementResults.isSustainable ? "text-green-400" : "text-orange-400"}`}>
                  Age {retirementResults.lastAge}
                </div>
                <p className="text-[9px] text-slate-500 mt-2 leading-tight uppercase font-bold">
                  {retirementResults.isSustainable 
                    ? "Plan is Green (Age >85)" 
                    : "Caution: Shortfall Before Age 85"}
                </p>
              </div>
            </div>
          )}
          
          <div className="mt-8 p-4 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-[10px] text-slate-500 leading-relaxed">
              <span className="font-bold text-slate-700 mr-1">Simulation Methodology:</span> 
              This model assumes annual withdrawals at the beginning of each period. 
              Returns are calculated based on the remaining balance after withdrawal.
              The withdrawal amount is adjusted annually for inflation. 
              Actual longevity may vary based on market volatility (Sequence of Returns risk).
            </p>
          </div>

          {retirementResults && retirementResults.evolution.length > 0 && (
            <div className="mt-10 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <BarChart3 className="w-4 h-4 text-slate-400" />
                <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Retirement Evolution (50 Year Projection)</h3>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-100 shadow-inner">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 h-10">
                      <TableHead className="font-bold text-[9px] uppercase tracking-tighter">Year</TableHead>
                      <TableHead className="font-bold text-[9px] uppercase tracking-tighter">Age</TableHead>
                      <TableHead className="text-right font-bold text-[9px] uppercase tracking-tighter">Start Balance</TableHead>
                      <TableHead className="text-right font-bold text-[9px] uppercase tracking-tighter text-blue-600">Annual Return</TableHead>
                      <TableHead className="text-right font-bold text-[9px] uppercase tracking-tighter text-green-600">Soc. Security</TableHead>
                      <TableHead className="text-right font-bold text-[9px] uppercase tracking-tighter text-red-600">Total Withdrawal</TableHead>
                      <TableHead className="text-right font-bold text-[9px] uppercase tracking-tighter">End Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {retirementResults.evolution.map((step: any) => (
                      <TableRow key={step.year} className="hover:bg-slate-50/40 h-8 border-slate-50">
                        <TableCell className="font-bold text-slate-600 text-xs py-1.5">
                          <div className="flex flex-col">
                            <span>{step.year}</span>
                            {step.isProportional && <span className="text-[8px] text-blue-500 font-bold uppercase tracking-tighter leading-none mt-0.5">est. rem. months</span>}
                          </div>
                        </TableCell>
                        <TableCell className="font-bold text-slate-500 text-xs py-1.5">{step.age}</TableCell>
                        <TableCell className="text-right font-mono text-[11px] py-1.5">{formatCurrency(step.startBalance)}</TableCell>
                        <TableCell className="text-right font-mono text-[11px] text-green-600 py-1.5">+{formatCurrency(step.earnings)}</TableCell>
                        <TableCell className="text-right font-mono text-[11px] text-green-700 py-1.5">{step.ssIncome > 0 ? `+${formatCurrency(step.ssIncome)}` : "—"}</TableCell>
                        <TableCell className="text-right font-mono text-[11px] text-red-500 py-1.5">
                          <div className="flex flex-col items-end">
                            <span>-{formatCurrency(step.withdrawal)}</span>
                            {step.isProportional && <span className="text-[8px] text-slate-400 font-medium lowercase italic leading-none">proportional</span>}
                          </div>
                        </TableCell>
                        <TableCell className={`text-right font-mono text-[11px] font-bold py-1.5 ${step.endBalance > 0 ? "text-slate-800" : "text-red-700"}`}>
                          {formatCurrency(step.endBalance)}
                        </TableCell>
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
      <Dialog open={!!editingExpense} onOpenChange={(open) => !open && setEditingExpense(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Expense</DialogTitle></DialogHeader>
          {editingExpense && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                <Input value={editingExpense.description} onChange={(e) => setEditingExpense({ ...editingExpense, description: e.target.value })} />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Amount ($)</label>
                <Input type="number" value={editingExpense.amount} onChange={(e) => setEditingExpense({ ...editingExpense, amount: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={handleUpdateExpense} className="bg-[#004a99]">Save Changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinanceIndependence;
