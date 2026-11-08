import React, { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Edit, Calculator, Wallet, ReceiptText, Target, TrendingUp, Shield, PiggyBank, HeartPulse, Landmark, AlertTriangle, CheckCircle2, Calendar as CalendarIcon, Briefcase } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, Legend, ReferenceLine } from "recharts";

const Retirement: React.FC = () => {
  const utils = trpc.useUtils();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<{ id: number; description: string; amount: string } | null>(null);
  const [newExpense, setNewExpense] = useState({ description: "", amount: "" });

  const [retirementReturnRate, setRetirementReturnRate] = useState<string>("5");
  const [retirementInflationRate, setRetirementInflationRate] = useState<string>("3");
  const [retirementStartDate, setRetirementStartDate] = useState<Date>(new Date());
  const [userBirthDate, setUserBirthDate] = useState<Date | undefined>(undefined);
  const [ssAmount, setSsAmount] = useState<string>("0");
  const [ssAge, setSsAge] = useState<string>("67");
  const [lifeExpectancy, setLifeExpectancy] = useState<string>("85");
  const [targetEffortDate, setTargetEffortDate] = useState<Date>(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 5); return d; });

  const readPortfolioFilter = (): string[] => {
    try { const s = localStorage.getItem("portfolios:portfolioFilter"); if (s) { const v = JSON.parse(s); if (Array.isArray(v)) return v.length ? v : ["all"]; if (typeof v === "string") return [v]; } } catch {}
    return ["all"];
  };
  const [portfolioFilter, setPortfolioFilter] = useState<string[]>(() => readPortfolioFilter());
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === "portfolios:portfolioFilter") setPortfolioFilter(readPortfolioFilter()); };
    const onFocus = () => setPortfolioFilter(readPortfolioFilter());
    window.addEventListener("storage", onStorage); window.addEventListener("focus", onFocus); document.addEventListener("visibilitychange", onFocus);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, []);

  const { data: user } = trpc.auth.me.useQuery();
  const { data: holdings } = trpc.portfolio.getAllHoldings.useQuery();
  const { data: expenses } = trpc.fi.getExpenses.useQuery();
  const { data: portfolios } = trpc.portfolio.getDetailedAll.useQuery();
  const { data: currentMonthActivities } = trpc.etf.getInvestmentActivities.useQuery({ range: "cm" });
  const { data: fullSimData } = trpc.fi.getFullSimulationData.useQuery();

  const addExpenseMutation = trpc.fi.addExpense.useMutation({ onSuccess: () => { toast.success("Expense added"); utils.fi.getExpenses.invalidate(); setIsAddDialogOpen(false); setNewExpense({ description: "", amount: "" }); } });
  const updateExpenseMutation = trpc.fi.updateExpense.useMutation({ onSuccess: () => { toast.success("Expense updated"); utils.fi.getExpenses.invalidate(); setEditingExpense(null); } });
  const deleteExpenseMutation = trpc.fi.deleteExpense.useMutation({ onSuccess: () => { toast.success("Expense deleted"); utils.fi.getExpenses.invalidate(); } });
  const updateRetirementSettingsMutation = trpc.fi.updateRetirementSettings.useMutation();

  useEffect(() => {
    if (user) {
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

  const handleAddExpense = () => { if (!newExpense.description || !newExpense.amount) return; addExpenseMutation.mutate(newExpense); };
  const handleUpdateExpense = () => { if (!editingExpense) return; updateExpenseMutation.mutate({ id: editingExpense.id, description: editingExpense.description, amount: editingExpense.amount }); };

  const isAllPortfolios = portfolioFilter.includes("all");
  const selectedIds = portfolioFilter.filter(v=>v!=="all").map(v=>parseInt(v));
  const filteredHoldings = useMemo(()=> { if (!holdings) return holdings; if (isAllPortfolios) return holdings; return (holdings as any[]).filter((h:any)=> selectedIds.includes(h.portfolioId)); }, [holdings, portfolioFilter]);
  const filteredPortfolios = useMemo(()=> { if (!portfolios) return portfolios; if (isAllPortfolios) return portfolios; return (portfolios as any[]).filter((p:any)=> selectedIds.includes(p.id)); }, [portfolios, portfolioFilter]);

  const totalPortfolioValue = useMemo(() => {
    if (!filteredPortfolios) return 0;
    const cash = filteredPortfolios.reduce((acc, p) => {
      const usd = (p as any).cashValueUSD; const local = (p as any).cashValue; const v = usd != null && usd !== "" ? usd : local; return acc + parseFloat(v || "0");
    }, 0);
    let investment = 0;
    if (filteredHoldings && filteredHoldings.length > 0) {
      investment = filteredHoldings.reduce((acc, h: any) => {
        const qty = parseFloat(h.quantity?.toString() || "0"); if (!Number.isFinite(qty) || qty <= 1e-9) return acc;
        const priceUSD = h.currentPriceUSD != null && h.currentPriceUSD !== "" ? parseFloat(h.currentPriceUSD) : parseFloat(h.currentPrice || "0");
        const price = Number.isFinite(priceUSD) ? priceUSD : parseFloat(h.currentPrice || "0"); return acc + qty * (Number.isFinite(price) ? price : 0);
      }, 0);
    } else {
      investment = filteredPortfolios.reduce((acc, p) => { const usd = (p as any).investmentValueUSD; const local = (p as any).investmentValue; const v = usd != null && usd !== "" ? usd : local; return acc + parseFloat(v || "0"); }, 0);
    }
    return cash + investment;
  }, [filteredPortfolios, filteredHoldings]);

  const monthlyIncome = useMemo(() => {
    if (!filteredHoldings) return 0;
    const totalAnnual = filteredHoldings.reduce((sum, h) => {
      const qty = parseFloat(h.quantity.toString());
      if ((h as any).assetType === "bond") { const coupon = parseFloat(((h as any).couponRateUSD ?? (h as any).couponRate) || "0"); return sum + qty * coupon; }
      const dps = parseFloat(((h as any).annualDividendPerShareUSD ?? (h as any).annualDividendPerShare) || 0); return sum + qty * dps;
    }, 0);
    return totalAnnual / 12;
  }, [filteredHoldings]);

  const distributedExpenses = useMemo(() => {
    const expensesList = expenses || [];
    if (expensesList.length === 0) return [];
    const sorted = [...expensesList].sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
    let remainingIncome = monthlyIncome;
    return sorted.map(exp => {
      const amount = parseFloat(exp.amount); const covered = Math.min(amount, remainingIncome); remainingIncome = Math.max(0, remainingIncome - covered);
      return { ...exp, amount, covered, coveredPercent: amount>0?(covered/amount)*100:0, remainingAmount: amount-covered, remainingPercent: amount>0?((amount-covered)/amount)*100:0 };
    });
  }, [expenses, monthlyIncome]);

  const totals = useMemo(() => distributedExpenses.reduce((acc, curr) => ({ amount: acc.amount + curr.amount, covered: acc.covered + curr.covered, remaining: acc.remaining + curr.remainingAmount }), { amount: 0, covered: 0, remaining: 0 }), [distributedExpenses]);

  // Account-type and asset-class breakdown (USD)
  const accountBreakdown = useMemo(() => {
    if (!filteredPortfolios) return { taxable:0, retirement:0, cashTaxable:0, cashRetirement:0, cashBrokerage:0, equity:0, fixedIncome:0, fixedTaxable:0, fixedRet:0, equityTaxable:0, equityRet:0, total:0 };
    const isCashUSD = (p:any)=> parseFloat((p.cashValueUSD ?? p.cashValue) || "0");
    const isInvUSD = (p:any)=> parseFloat((p.investmentValueUSD ?? p.investmentValue) || "0");
    let taxable=0, retirement=0;
    let cashTaxable=0, cashRetirement=0, cashBrokerage=0;
    let equity=0, fixedIncome=0, fixedTaxable=0, fixedRet=0, equityTaxable=0, equityRet=0;
    for (const p of filteredPortfolios as any[]) {
      const isRetAcc = (p.accounts||[]).filter((a:any)=> a.accountType==="Retirement");
      const isTaxAcc = (p.accounts||[]).filter((a:any)=> a.accountType!=="Retirement");
      const isBrokerageAcc = (p.accounts||[]).filter((a:any)=> a.accountType==="Brokerage");
      // Sum per account type in USD if available – fall back to pro-rata
      const pTotalInvUSD = isInvUSD(p);
      const pCashUSD = isCashUSD(p);
      // Approximate split by account counts if no per-account USD; use account investmentValue proportion
      const retAccInv = isRetAcc.reduce((s:any,a:any)=> s + parseFloat(a.investmentValue || "0"),0);
      const taxAccInv = isTaxAcc.reduce((s:any,a:any)=> s + parseFloat(a.investmentValue || "0"),0);
      const totalAccInv = retAccInv + taxAccInv || 1;
      const retCash = isRetAcc.reduce((s:any,a:any)=> s + parseFloat(a.cashValue || "0"),0);
      const taxCash = isTaxAcc.reduce((s:any,a:any)=> s + parseFloat(a.cashValue || "0"),0);
      const brokCash = isBrokerageAcc.reduce((s:any,a:any)=> s + parseFloat(a.cashValue || "0"),0);
      const totalCash = retCash + taxCash || 1;
      // Convert to USD proportionally
      const fx = p.baseCurrency==="USD" ? 1 : parseFloat(p.fxRateToUSD || "1");
      // Use USD totals already; split proportionally
      const retInvUSD = pTotalInvUSD * (retAccInv/totalAccInv);
      const taxInvUSD = pTotalInvUSD * (taxAccInv/totalAccInv);
      const retCashUSD = pCashUSD * (retCash/totalCash);
      const taxCashUSD = pCashUSD * (taxCash/totalCash);
      const brokCashUSD = pCashUSD * (brokCash/Math.max(1, totalCash));
      retirement += retInvUSD + retCashUSD;
      taxable += taxInvUSD + taxCashUSD;
      cashRetirement += retCashUSD;
      cashTaxable += taxCashUSD;
      cashBrokerage += brokCashUSD;
      const pEquity = parseFloat((p.equityInvestmentValueUSD ?? p.equityInvestmentValue) ?? "0") || (pTotalInvUSD - parseFloat((p.fixedIncomeInvestmentValueUSD ?? "0") as any));
      const pFixed = parseFloat(p.fixedIncomeInvestmentValueUSD ?? p.fixedIncomeInvestmentValue ?? "0");
      equity += pEquity;
      fixedIncome += pFixed;
      // split equity/fixed by account type pro-rata
      const eqTax = pEquity * (taxInvUSD / Math.max(1, pTotalInvUSD));
      const eqRet = pEquity - eqTax;
      const fxTax = pFixed * (taxInvUSD / Math.max(1, pTotalInvUSD));
      const fxRet = pFixed - fxTax;
      equityTaxable += eqTax; equityRet += eqRet;
      fixedTaxable += fxTax; fixedRet += fxRet;
    }
    // If per-account split not accurate, fallback to overall
    if (equity===0 && fixedIncome===0) {
      const totalInv = filteredPortfolios.reduce((s:any,p:any)=> s + isInvUSD(p),0);
      equity = totalInv * 0.8; fixedIncome = totalInv * 0.2;
      equityTaxable = equity * (taxable/Math.max(1, taxable+retirement)); equityRet = equity - equityTaxable;
      fixedTaxable = fixedIncome * (taxable/Math.max(1, taxable+retirement)); fixedRet = fixedIncome - fixedTaxable;
    }
    return { taxable, retirement, cashTaxable, cashRetirement, cashBrokerage, equity, fixedIncome, fixedTaxable, fixedRet, equityTaxable, equityRet, total: taxable+retirement };
  }, [filteredPortfolios]);

  const equityPct = useMemo(()=> {
    const inv = accountBreakdown.equity + accountBreakdown.fixedIncome;
    return inv>0 ? accountBreakdown.equity / inv : 0.6;
  }, [accountBreakdown]);

  // ETF Income vs Growth breakdown for bucket mapping (also split taxable vs retirement)
  const etfBucketSplit = useMemo(()=> {
    if (!filteredHoldings) return { income:0, growth:0, incomeTaxable:0, incomeRet:0, growthTaxable:0, growthRet:0 };
    // Build accountType map from portfolios
    const acctTypeMap = new Map<number,string>();
    for (const p of (filteredPortfolios||[]) as any[]) for (const a of (p.accounts||[])) acctTypeMap.set(a.id, a.accountType);
    let income=0, growth=0, incomeTaxable=0, incomeRet=0, growthTaxable=0, growthRet=0;
    for (const h of filteredHoldings as any[]) {
      if (h.assetType === "bond") continue;
      const qty = parseFloat(h.quantity?.toString()||"0");
      if (!Number.isFinite(qty) || qty<=1e-9) continue;
      const priceUSD = h.currentPriceUSD != null && h.currentPriceUSD!=="" ? parseFloat(h.currentPriceUSD) : parseFloat(h.currentPrice||"0");
      const val = qty * (Number.isFinite(priceUSD) ? priceUSD : 0);
      const isRet = acctTypeMap.get(h.accountId) === "Retirement";
      if ((h as any).etfCategory === "income") { income += val; if (isRet) incomeRet+=val; else incomeTaxable+=val; }
      else { growth += val; if (isRet) growthRet+=val; else growthTaxable+=val; }
    }
    return { income, growth, incomeTaxable, incomeRet, growthTaxable, growthRet };
  }, [filteredHoldings, filteredPortfolios]);

  // Retirement plan deterministic simulation
  const retirementPlan = useMemo(() => {
    const annualExpenses = totals.amount * 12;
    let currentPortfolioValue = totalPortfolioValue;
    if (currentPortfolioValue <= 0 || annualExpenses <=0) return null;
    const returnRate = parseFloat(retirementReturnRate)/100;
    const inflationRate = parseFloat(retirementInflationRate)/100 || 0;
    const now = new Date(); const currentYear = now.getFullYear();
    const retirementYear = retirementStartDate.getFullYear();
    let ageToday = 0, ageAtRetirement = 0;
    if (userBirthDate) { ageToday = currentYear - userBirthDate.getFullYear(); ageAtRetirement = retirementYear - userBirthDate.getFullYear(); }
    const yearsUntilRetirement = Math.max(0, retirementYear - currentYear);
    let projectedPortfolioAtStart = currentPortfolioValue;
    let projectedExpensesAtStart = annualExpenses;
    let fractionYearsToRet = 0;
    if (retirementStartDate > now) {
      const f = (retirementStartDate.getTime() - now.getTime())/(1000*60*60*24*365.25);
      fractionYearsToRet = f;
      projectedPortfolioAtStart = currentPortfolioValue * Math.pow(1+returnRate, f);
      projectedExpensesAtStart = annualExpenses * Math.pow(1+inflationRate, f);
    }
    const effectiveRate = projectedPortfolioAtStart>0 ? projectedExpensesAtStart / projectedPortfolioAtStart : 0;
    const initialWithdrawal = projectedExpensesAtStart; // = effective*portfolio
    const baseSS = parseFloat(ssAmount)||0;
    const ssStartAge = parseInt(ssAge)||67;
    const startMonth = retirementStartDate.getMonth();
    const remainingMonthsFactor = (12 - startMonth)/12;
    const maxAge = 100;
    const yearsToSimulate = userBirthDate ? (maxAge - ageToday) : 50;
    const medicareAge = 65;
    const penaltyFreeAge = 59.5;

    // Helper to simulate one scenario — market drops are modeled as a big year-1 fall with 2-3y recovery (bucket shield for 3y)
    function simulateScenario(opts: { crashPct: number, highInflationYears: number, highInflationRate: number, lowReturnYears: number, lowReturnRate: number }) {
      let balance = currentPortfolioValue;
      let withdrawal = annualExpenses;
      let age = ageToday;
      const evolution: any[] = [];
      let depletionYear: number | null = null;
      let depletionAge: number | null = null;
      // Buckets at retirement start (projected) — only used when crash>0 to model 3-5y recovery without selling stocks
      const useBuckets = opts.crashPct>0;
      let b1 = (accountBreakdown as any).cashBrokerage ?? accountBreakdown.cashTaxable;
      let b2Bonds = accountBreakdown.fixedIncome;
      let b2Income = etfBucketSplit.income;
      let b2 = b2Bonds + b2Income;
      let b3 = etfBucketSplit.growth + (accountBreakdown.cashRetirement || 0);
      if (fractionYearsToRet>0 && totalPortfolioValue>0) {
        const scale = projectedPortfolioAtStart / totalPortfolioValue;
        b1 *= scale; b2Bonds *= scale; b2Income *= scale; b2 = b2Bonds + b2Income; b3 *= scale;
      }
      // track bucket total separately when useBuckets so balance mirrors buckets in recovery window
      for (let y=0; y<=yearsToSimulate; y++) {
        const simYear = currentYear + y;
        const curAge = ageToday + y;
        const isRetired = simYear >= retirementYear;
        const isFirst = simYear === retirementYear;
        let yearSS = 0;
        if (isRetired && curAge >= ssStartAge) {
          // SS indexed to inflation (simplified: base inflation, not high-inflation override? Use opts highInflation for first years)
          const infForSS = y; // use base inflation for SS COLA
          yearSS = baseSS * Math.pow(1+inflationRate, y);
          if (isFirst) yearSS *= remainingMonthsFactor;
        }
        // Determine return and inflation for this year
        let yrReturn = returnRate;
        let yrInflation = inflationRate;
        if (isRetired) {
          if (opts.highInflationYears>0 && y - yearsUntilRetirement < opts.highInflationYears && y>=yearsUntilRetirement) yrInflation = opts.highInflationRate;
          if (opts.lowReturnYears>0 && y - yearsUntilRetirement < opts.lowReturnYears && y>=yearsUntilRetirement) yrReturn = opts.lowReturnRate;
        }
        let crashApplied = 0;
        if (isFirst && opts.crashPct>0) {
          const crashLoss = balance * equityPct * opts.crashPct;
          balance = Math.max(0, balance - crashLoss);
          crashApplied = crashLoss;
          b2Income = Math.max(0, b2Income * (1 - opts.crashPct));
          b2 = b2Bonds + b2Income;
          b3 = Math.max(0, b3 * (1 - opts.crashPct));
        }
        const startBal = useBuckets && y - yearsUntilRetirement >=0 && y - yearsUntilRetirement < 3 && isRetired ? (b1 + b2 + b3 + (isFirst ? crashApplied : 0)) : balance;
        // for crash recovery window, startBal should be bucket sum before withdrawal
        const effectiveStart = useBuckets && isFirst && opts.crashPct>0 ? b1 + b2 + b3 + crashApplied : startBal;
        let netWithdrawal = 0;
        if (isRetired) {
          const target = isFirst ? initialWithdrawal : withdrawal;
          let gross = target - yearSS;
          if (gross<0) gross=0;
          if (isFirst) gross *= remainingMonthsFactor;
          netWithdrawal = Math.min(balance, gross);
          if (useBuckets && y - yearsUntilRetirement >=0 && y - yearsUntilRetirement < 3) {
            let remaining = netWithdrawal;
            const takeB1 = Math.min(b1, remaining); b1 -= takeB1; remaining -= takeB1;
            const takeB2 = Math.min(b2, remaining); b2 -= takeB2; remaining -= takeB2;
            const takeB3 = Math.min(b3, remaining); b3 -= takeB3; remaining -= takeB3;
          }
        }
        // Current year (y===0) is already at last quarter — treat balance as final, no extra full-year return
        const isCurrentYear = y === 0;
        let earnings = 0;
        const afterWithdrawalBal = balance - netWithdrawal;
        if (!isCurrentYear) {
          if (useBuckets && y - yearsUntilRetirement >=0 && y - yearsUntilRetirement < 3) {
            const yearsAfterCrash = y - yearsUntilRetirement;
            // 2-3y recovery: only the crash rebound years get a boost; otherwise use your base return
            let b3RetBase = yrReturn;
            if (yearsAfterCrash === 1) b3RetBase = 0.18 + yrReturn * 0.3; // ~18-20% bounce yr1
            else if (yearsAfterCrash === 2) b3RetBase = 0.12 + yrReturn * 0.3; // ~12-14% yr2
            const b1Ret = 0.01, b2BondsRet = 0.025, b2IncomeRet = yrReturn, b3Ret = b3RetBase;
            const bucketEarnings = b1*b1Ret + b2Bonds*b2BondsRet + b2Income*b2IncomeRet + b3*b3Ret;
            b1 = b1 * (1 + b1Ret);
            b2Bonds = b2Bonds * (1 + b2BondsRet);
            b2Income = b2Income * (1 + b2IncomeRet);
            b2 = b2Bonds + b2Income;
            b3 = b3 * (1 + b3Ret);
            earnings = bucketEarnings;
          } else {
            earnings = afterWithdrawalBal * yrReturn;
            // keep buckets in sync outside window by scaling
            if (useBuckets && b1+b2+b3>0) {
              const totalB = b1+b2+b3;
              const totalAfter = afterWithdrawalBal + earnings;
              const scaleB = totalB>0 ? totalAfter / totalB : 1;
              b1 *= scaleB; b2 *= scaleB; b3 *= scaleB;
            }
          }
        } else {
          earnings = 0;
        }
        const endBal = useBuckets && y - yearsUntilRetirement >=0 && y - yearsUntilRetirement < 3 && !isCurrentYear
          ? b1 + b2 + b3
          : afterWithdrawalBal + earnings;
        const effectiveStartBal = useBuckets && y - yearsUntilRetirement >=0 && y - yearsUntilRetirement < 3 ? effectiveStart : startBal;
        const isPenalty = isRetired && curAge < penaltyFreeAge;
        const isMedicare = curAge >= medicareAge;
        const isSS = curAge >= ssStartAge && isRetired;
        evolution.push({ year: simYear, age: curAge, startBalance: startBal, netWithdrawal, yearSS, earnings, endBalance: endBal, isRetired, crashApplied, yrReturn, yrInflation, isPenalty, isMedicare, isSS, expenses: isRetired ? (isFirst? initialWithdrawal*remainingMonthsFactor : withdrawal) : annualExpenses * Math.pow(1+inflationRate, y), b1: useBuckets ? b1 : null, b2: useBuckets ? b2 : null, b3: useBuckets ? b3 : null, bucketTotal: useBuckets ? (b1+b2+b3) : null });
        balance = endBal;
        if (isRetired) {
          if (isFirst) withdrawal = initialWithdrawal * (1+yrInflation);
          else withdrawal = withdrawal * (1+yrInflation);
        }
        if (balance <=0 && isRetired && depletionYear==null) { depletionYear = simYear; depletionAge = curAge; }
        if (balance<=0 && isRetired) break;
      }
      const targetLE = parseInt(lifeExpectancy)||85;
      const success = depletionYear==null || (depletionAge!=null && depletionAge >= targetLE);
      return { evolution, depletionYear, depletionAge, success, endingBalance: evolution[evolution.length-1]?.endBalance || 0 };
    }

    const scenarios = [
      { key: "base", label: "Base", desc: `${(returnRate*100).toFixed(0)}% return, ${(inflationRate*100).toFixed(0)}% inflation`, opts: { crashPct:0, highInflationYears:0, highInflationRate:0.06, lowReturnYears:0, lowReturnRate:0.02 } },
      { key: "crash30", label: "Crash -30%", desc: "30% equity drop in y1 — 3y bucket shield, 2-3y recovery", opts: { crashPct:0.30, highInflationYears:0, highInflationRate:0.06, lowReturnYears:0, lowReturnRate:0.02 } },
      { key: "crash40", label: "Crash -40%", desc: "40% equity drop in y1 — 3y bucket shield, 2-3y recovery", opts: { crashPct:0.40, highInflationYears:0, highInflationRate:0.06, lowReturnYears:0, lowReturnRate:0.02 } },
      { key: "highInfl", label: "High inflation", desc: "6% inflation 10y post-retire", opts: { crashPct:0, highInflationYears:10, highInflationRate:0.06, lowReturnYears:0, lowReturnRate:0.02 } },
      { key: "stag", label: "Stagflation", desc: "-30% y1 + 5% inflation 7y — 3y shield, 2-3y recovery", opts: { crashPct:0.30, highInflationYears:7, highInflationRate:0.05, lowReturnYears:0, lowReturnRate:0.02 } },
      { key: "lowRet", label: "Low returns", desc: "2% return 10y post-retire", opts: { crashPct:0, highInflationYears:0, highInflationRate:0.06, lowReturnYears:10, lowReturnRate:0.02 } },
    ].map(s => ({ ...s, result: simulateScenario(s.opts) }));

    const base = scenarios.find(s=>s.key==="base")!;
    // Chart data: base vs stress lines
    const maxLen = Math.max(...scenarios.map(s=>s.result.evolution.length));
    const chartData: any[] = [];
    for (let i=0;i<maxLen;i++) {
      const row: any = { year: base.result.evolution[i]?.year || currentYear+i };
      for (const s of scenarios) {
        const ev = s.result.evolution[i];
        row[s.key] = ev ? ev.endBalance : null;
      }
      chartData.push(row);
    }

    // Guardrails: Guyton–Klinger (2006) — rules 3 + 4 implemented as dynamic withdrawal guardrails
    // Initial rate = effectiveRate (projectedExpensesAtStart / projectedPortfolioAtStart), upper=120%, lower=80%
    const initialRate = effectiveRate;
    const gkUpper = initialRate * 1.2;
    const gkLower = initialRate * 0.8;
    function simulateGuytonKlinger(opts: any) {
      let bal = currentPortfolioValue;
      const useB = opts.crashPct>0;
      let gkB1 = (accountBreakdown as any).cashBrokerage ?? accountBreakdown.cashTaxable;
      let gkB2Bonds = accountBreakdown.fixedIncome;
      let gkB2Income = etfBucketSplit.income;
      let gkB2 = gkB2Bonds + gkB2Income;
      let gkB3 = etfBucketSplit.growth + (accountBreakdown.cashRetirement || 0);
      if (fractionYearsToRet>0 && totalPortfolioValue>0) { const sc = projectedPortfolioAtStart / totalPortfolioValue; gkB1*=sc; gkB2Bonds*=sc; gkB2Income*=sc; gkB2=gkB2Bonds+gkB2Income; gkB3*=sc; }
      if (useB) {
        const capGrowth = projectedPortfolioAtStart * 0.5;
        if (gkB3 > capGrowth) { const ex = gkB3 - capGrowth; gkB3 = capGrowth; gkB2Bonds += ex; gkB2 = gkB2Bonds + gkB2Income; }
      }
      let withdrawalForYear = projectedExpensesAtStart; // gross before SS, rule 2 base
      let prevReturnNegative = false;
      let cuts=0, raises=0, inflSkips=0;
      const evolution: any[] = [];
      for (let y=0; y<=yearsToSimulate; y++) {
        const simYear = currentYear + y;
        const curAge = ageToday + y;
        const isRetired = simYear >= retirementYear;
        const isFirst = simYear === retirementYear;
        let yearSS = 0;
        if (isRetired && curAge >= ssStartAge) { yearSS = baseSS * Math.pow(1+inflationRate, y); if (isFirst) yearSS *= remainingMonthsFactor; }
        let yrReturn = returnRate;
        let yrInflation = inflationRate;
        if (isRetired) {
          if (opts.highInflationYears>0 && y - yearsUntilRetirement < opts.highInflationYears && y>=yearsUntilRetirement) yrInflation = opts.highInflationRate;
          if (opts.lowReturnYears>0 && y - yearsUntilRetirement < opts.lowReturnYears && y>=yearsUntilRetirement) yrReturn = opts.lowReturnRate;
        }
        if (isFirst && opts.crashPct>0) {
          const loss = bal * equityPct * opts.crashPct;
          bal = Math.max(0, bal - loss);
          gkB2Income = Math.max(0, gkB2Income * (1 - opts.crashPct));
          gkB2 = gkB2Bonds + gkB2Income;
          gkB3 = Math.max(0, gkB3 * (1 - opts.crashPct));
        }
        let netWithdrawal = 0;
        let grossWithdrawal = 0;
        let rate = 0;
        let action: string | null = null;
        if (isRetired) {
          if (isFirst) {
            grossWithdrawal = withdrawalForYear;
          } else {
            // Inflation rule: skip raise if prior year return negative
            if (prevReturnNegative) { grossWithdrawal = withdrawalForYear; inflSkips++; }
            else { grossWithdrawal = withdrawalForYear * (1 + yrInflation); }
          }
          // Rebalance note: withdrawal taken proportionally (portfolio management rule 1)
          // Guardrails 3 & 4: compare current withdrawal rate vs initial
          const startBalForRate = bal; // portfolio before withdrawal
          const tentativeRate = startBalForRate>0 ? (grossWithdrawal - yearSS) / startBalForRate : 0; // net rate; use net after SS for guardrail
          // Clamp to not negative after SS
          let adjusted = grossWithdrawal;
          if (tentativeRate > gkUpper + 1e-9) { adjusted = adjusted * 0.9; cuts++; action = "-10% cap-preservation"; }
          else if (tentativeRate < gkLower - 1e-9 && tentativeRate>0) { adjusted = adjusted * 1.1; raises++; action = "+10% prosperity"; }
          grossWithdrawal = adjusted;
          // Carry for next year's inflation base
          withdrawalForYear = grossWithdrawal;
          rate = startBalForRate>0 ? Math.max(0, grossWithdrawal - yearSS)/startBalForRate : 0;
          let grossNet = grossWithdrawal - yearSS; if (grossNet<0) grossNet=0;
          if (isFirst) grossNet *= remainingMonthsFactor;
          netWithdrawal = Math.min(bal, grossNet);
          if (useB && y - yearsUntilRetirement >=0 && y - yearsUntilRetirement < 3) {
            let rem = netWithdrawal; const t1=Math.min(gkB1,rem); gkB1-=t1; rem-=t1; const t2=Math.min(gkB2,rem); gkB2-=t2; rem-=t2; const t3=Math.min(gkB3,rem); gkB3-=t3; rem-=t3;
          }
        }
        const isCurrentYear = y===0;
        let earnings=0, endBal=0;
        if (isCurrentYear) { earnings=0; endBal=bal-netWithdrawal; if (useB && isRetired) endBal=gkB1+gkB2+gkB3; }
        else if (useB && y - yearsUntilRetirement >=0 && y - yearsUntilRetirement < 3) {
          const yearsAfterCrash = y - yearsUntilRetirement;
          let b3Ret = yrReturn;
          if (yearsAfterCrash === 1) b3Ret = 0.18 + yrReturn * 0.3;
          else if (yearsAfterCrash === 2) b3Ret = 0.12 + yrReturn * 0.3;
          const e1=gkB1*0.01, e2B=gkB2Bonds*0.025, e2I=gkB2Income*yrReturn, e3=gkB3*b3Ret;
          gkB1*=1.01; gkB2Bonds*=1.025; gkB2Income*=(1+yrReturn); gkB2=gkB2Bonds+gkB2Income; gkB3*=(1+b3Ret);
          earnings=e1+e2B+e2I+e3; endBal=gkB1+gkB2+gkB3;
        } else {
          const after = bal - netWithdrawal; earnings = after * yrReturn; endBal = after + earnings;
          if (useB) { const tot=gkB1+gkB2+gkB3; const sc=tot>0? endBal/tot:1; gkB1*=sc; gkB2Bonds*=sc; gkB2Income*=sc; gkB2=gkB2Bonds+gkB2Income; gkB3*=sc; }
        }
        evolution.push({ year: simYear, age: curAge, isRetired, startBalance: bal, netWithdrawal, grossWithdrawal, rate, yrReturn, action, endBalance: endBal });
        // Track prior return for inflation skip next year: negative market return OR crash year OR negative earnings
        const hadCrashThisYear = isFirst && opts.crashPct>0;
        prevReturnNegative = yrReturn < 0 || hadCrashThisYear || earnings < 0;
        bal = endBal;
        if (bal <=0 && isRetired) return { success:false, depletionAge:curAge, cuts, raises, inflSkips, evolution, upper:gkUpper, lower:gkLower, initialRate };
      }
      return { success:true, depletionAge:null as any, cuts, raises, inflSkips, evolution, upper:gkUpper, lower:gkLower, initialRate };
    }

    const targetLE = parseInt(lifeExpectancy)||85;
    const guardrails = scenarios.map(s => {
      const gk = simulateGuytonKlinger(s.opts);
      // low/high withdrawal range during retirement (net portfolio withdrawal and gross spending)
      let minGross = Infinity, maxGross = -Infinity, minNet = Infinity, maxNet = -Infinity;
      for (const e of gk.evolution as any[]) if (e.isRetired) {
        if (e.grossWithdrawal < minGross) minGross = e.grossWithdrawal;
        if (e.grossWithdrawal > maxGross) maxGross = e.grossWithdrawal;
        if (e.netWithdrawal < minNet) minNet = e.netWithdrawal;
        if (e.netWithdrawal > maxNet) maxNet = e.netWithdrawal;
      }
      if (!isFinite(minGross)) { minGross = 0; maxGross = 0; minNet = 0; maxNet = 0; }
      return {
        key: s.key, label: s.label, success: s.result.success,
        gkSuccess: gk.success, gkDepletionAge: gk.depletionAge, gkCuts: gk.cuts, gkRaises: gk.raises, gkInflSkips: gk.inflSkips, gkEvolution: gk.evolution,
        gkMinGross: minGross, gkMaxGross: maxGross, gkMinNet: minNet, gkMaxNet: maxNet,
        initialRate, gkUpper, gkLower,
        baseDepletionAge: s.result.depletionAge,
      };
    });

    // Bucket recommendation
    const bridgeToPenFree = Math.max(0, penaltyFreeAge - ageAtRetirement);
    const bridgeToSS = Math.max(0, ssStartAge - ageAtRetirement);
    const bridgeToMedicare = Math.max(0, medicareAge - ageAtRetirement);
    const bucket1Years = 2;
    const bucket1Need = projectedExpensesAtStart * bucket1Years;
    const bucket2Years = 3;
    const bucket2Need = projectedExpensesAtStart * bucket2Years;
    const bucket3Need = Math.max(0, projectedPortfolioAtStart - bucket1Need - bucket2Need);
    const actualCash = (accountBreakdown as any).cashBrokerage ?? accountBreakdown.cashTaxable;
    // Bucket mapping: Income ETFs join bonds in Bucket 2, Growth stays in Bucket 3
    const etfIncomeUSD = (etfBucketSplit as any).income || 0;
    const etfGrowthUSD = (etfBucketSplit as any).growth || 0;
    const actualBucket1 = (accountBreakdown as any).cashBrokerage ?? accountBreakdown.cashTaxable; // brokerage cash only (0-2y)
    const actualBucket2 = accountBreakdown.fixedIncome + etfIncomeUSD; // bonds + income ETFs 3-10y
    const actualBucket3 = etfGrowthUSD + (accountBreakdown.cashRetirement || 0); // growth + retirement cash (5y+)
    // Taxable bridge adequacy
    const taxableBridge = accountBreakdown.taxable;
    const needBridge = projectedExpensesAtStart * Math.max(bridgeToPenFree, 1);
    const bridgeCoverageYears = taxableBridge >0 && projectedExpensesAtStart>0 ? taxableBridge / projectedExpensesAtStart : 0;

    // Taxable bridge with return & inflation (uses projected taxable at retirement, yearly SS/inflation)
    const taxableAtStart = taxableBridge * Math.pow(1+returnRate, fractionYearsToRet);
    let bridgeYearsCoveredGrowth = 0;
    let bridgeShortfallAtRet = 0;
    let bridgeSuccessWithGrowth = bridgeToPenFree <= 0;
    if (bridgeToPenFree > 0) {
      let bal = taxableAtStart;
      let wdraw = projectedExpensesAtStart;
      const full = Math.floor(bridgeToPenFree);
      const frac = bridgeToPenFree - full;
      const totalSteps = full + (frac > 1e-6 ? 1 : 0);
      let success = true;
      for (let bi=0; bi < totalSteps; bi++) {
        const isLastFrac = bi === full && frac > 1e-6;
        const curAgeBridge = ageAtRetirement + bi;
        const isFirstBridge = bi === 0;
        let yrSSBridge = 0;
        if (curAgeBridge >= ssStartAge) {
          yrSSBridge = baseSS * Math.pow(1+inflationRate, fractionYearsToRet + bi);
          if (isFirstBridge) yrSSBridge *= remainingMonthsFactor;
        }
        let gross = wdraw - yrSSBridge;
        if (gross < 0) gross = 0;
        if (isFirstBridge) gross *= remainingMonthsFactor;
        if (isLastFrac) gross *= frac;
        if (bal + 1e-6 < gross) { success = false; bridgeShortfallAtRet = gross - bal; break; }
        bal -= gross;
        bridgeYearsCoveredGrowth += isLastFrac ? frac : 1;
        // earnings for next year (except after last step, and current-year 0-return rule if retiring now)
        const isCurrentBridgeYear = isFirstBridge && fractionYearsToRet === 0;
        if (bi < totalSteps - 1 && !isCurrentBridgeYear) {
          bal = bal * (1 + returnRate);
        } else if (bi < totalSteps - 1 && isCurrentBridgeYear && totalSteps > 1) {
          // current year has 0 return already accounted via balance as final; still grow after first year
          bal = bal * (1 + returnRate);
        }
        wdraw *= (1 + inflationRate);
        if (bal <= 1e-6 && !success) { success = false; break; }
      }
      bridgeSuccessWithGrowth = success && bridgeYearsCoveredGrowth + 1e-6 >= bridgeToPenFree;
      if (!bridgeSuccessWithGrowth && bridgeYearsCoveredGrowth < bridgeToPenFree) {
        // keep shortfall already set
      } else {
        bridgeYearsCoveredGrowth = bridgeToPenFree;
      }
    }

    return {
      annualExpenses, projectedPortfolioAtStart, projectedExpensesAtStart, effectiveRate, initialWithdrawal,
      ageToday, ageAtRetirement, yearsUntilRetirement, fractionYearsToRet, remainingMonthsFactor, baseSS, currentYear, retirementYear,
      penaltyFreeAge, medicareAge, ssStartAge, bridgeToPenFree, bridgeToSS, bridgeToMedicare,
      bucket1Need, bucket2Need, bucket3Need, actualBucket1, actualBucket2, actualBucket3, etfIncomeUSD, etfGrowthUSD, bridgeCoverageYears, bridgeYearsCoveredGrowth, bridgeShortfallAtRet, bridgeSuccessWithGrowth, taxableAtStart, needBridge, taxableBridge,
      bucket1Years, bucket2Years,
      scenarios, chartData, baseEvolution: base.result.evolution, equityPct, guardrails
    };
  }, [totals.amount, totalPortfolioValue, retirementReturnRate, retirementInflationRate, retirementStartDate, userBirthDate, ssAmount, ssAge, lifeExpectancy, accountBreakdown, equityPct, etfBucketSplit]);

  if (!expenses) {
    return <div className="flex items-center justify-center min-h-[60vh] flex-col gap-4"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#004a99]"></div><p className="text-sm font-bold text-slate-700 uppercase tracking-widest">Loading retirement data…</p></div>;
  }

  return (
    <div className="space-y-10 pb-24">
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-[#004a99] rounded-xl text-white"><Calculator className="w-6 h-6" /></div>
          <div>
            <h2 className="text-xl font-black text-slate-800 tracking-tight">Retirement Plan</h2>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Deterministic projection • Stress-tested • Bucket-based</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
          <span>Scope: {isAllPortfolios ? `${filteredPortfolios?.length||0} portfolios` : `${filteredPortfolios?.length} portfolios`}</span>
          <span className="w-1 h-1 bg-slate-300 rounded-full" />
          <span>{formatCurrency(totalPortfolioValue)} total</span>
        </div>
      </div>

      {/* Expenses */}
      <Card className="bg-white shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2"><ReceiptText className="w-5 h-5 text-blue-600" /><CardTitle className="text-sm font-bold uppercase tracking-wider">Monthly Expenses & Coverage</CardTitle></div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}><DialogTrigger asChild><Button size="sm" className="bg-[#004a99] h-8 text-[10px] font-bold uppercase tracking-widest"><Plus className="w-3.5 h-3.5 mr-1.5" />Add Expense</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Add Monthly Expense</DialogTitle></DialogHeader><div className="space-y-4 py-4"><div className="space-y-2"><label className="text-xs font-bold uppercase text-slate-500">Description</label><Input placeholder="e.g., Rent" value={newExpense.description} onChange={e=> setNewExpense({...newExpense, description:e.target.value})} /></div><div className="space-y-2"><label className="text-xs font-bold uppercase text-slate-500">Amount ($)</label><Input type="number" placeholder="0.00" value={newExpense.amount} onChange={e=> setNewExpense({...newExpense, amount:e.target.value})} /></div></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=> setIsAddDialogOpen(false)}>Cancel</Button><Button onClick={handleAddExpense}>Add</Button></div></DialogContent></Dialog>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {distributedExpenses.map(exp=> (
              <div key={exp.id} className="flex items-center justify-between p-3 rounded-lg border bg-slate-50/50">
                <div><div className="text-sm font-bold text-slate-800">{exp.description}</div><div className="text-[10px] text-slate-500 uppercase">{formatCurrency(exp.amount)}/mo • {exp.coveredPercent.toFixed(0)}% covered by dividends</div></div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-mono font-bold">{formatCurrency(exp.amount)}</div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=> setEditingExpense({id:exp.id, description:exp.description, amount: exp.amount.toString()})}><Edit className="w-3.5 h-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={()=> deleteExpenseMutation.mutate({id:exp.id})}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
            {distributedExpenses.length===0 && <div className="text-center py-8 text-sm text-slate-400">No expenses — add your monthly spend to plan.</div>}
            <div className="flex justify-between pt-3 border-t font-bold text-sm"><span>Total / month</span><span className="font-mono">{formatCurrency(totals.amount)}</span></div>
            <div className="flex justify-between text-xs text-slate-500"><span>Annual need</span><span className="font-mono">{formatCurrency(totals.amount*12)}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Retirement Inputs */}
      <Card className="shadow-sm border-t-4 border-t-[#004a99]">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2"><Target className="w-4 h-4 text-[#004a99]" /> Retirement Assumptions</CardTitle>
          <CardDescription className="text-xs">All values in USD. Inflation grows expenses, return grows portfolio until retirement.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Birth Date</label><Popover><PopoverTrigger asChild><Button variant="outline" className="h-9 w-full text-xs justify-start">{userBirthDate ? format(userBirthDate,"PPP") : "Select"}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={userBirthDate} onSelect={d=>{ if(d){ setUserBirthDate(d); updateRetirementSettingsMutation.mutate({ birthDate:d }); } }} captionLayout="dropdown" fromYear={1940} toYear={new Date().getFullYear()} /></PopoverContent></Popover></div>
            <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Retire On</label><Popover><PopoverTrigger asChild><Button variant="outline" className="h-9 w-full text-xs justify-start">{format(retirementStartDate,"PPP")}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={retirementStartDate} onSelect={d=>{ if(d){ setRetirementStartDate(d); updateRetirementSettingsMutation.mutate({ startDate:d }); } }} fromYear={new Date().getFullYear()} toYear={new Date().getFullYear()+50} /></PopoverContent></Popover></div>
            <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">SS / yr</label><Input type="number" className="h-9" value={ssAmount} onChange={e=>{ setSsAmount(e.target.value); updateRetirementSettingsMutation.mutate({ ssAmount:e.target.value }); }} /></div>
            <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">SS Age</label><Input type="number" className="h-9" value={ssAge} onChange={e=>{ setSsAge(e.target.value); updateRetirementSettingsMutation.mutate({ ssAge:e.target.value }); }} /></div>
            <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Return %</label><Input type="number" className="h-9" value={retirementReturnRate} onChange={e=>{ setRetirementReturnRate(e.target.value); updateRetirementSettingsMutation.mutate({ returnRate:e.target.value }); }} /></div>
            <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Inflation %</label><Input type="number" className="h-9" value={retirementInflationRate} onChange={e=>{ setRetirementInflationRate(e.target.value); updateRetirementSettingsMutation.mutate({ inflationRate:e.target.value }); }} /></div>
            <div className="space-y-1"><label className="text-[10px] font-bold uppercase text-slate-500">Live to</label><Input type="number" className="h-9" value={lifeExpectancy} onChange={e=>{ setLifeExpectancy(e.target.value); updateRetirementSettingsMutation.mutate({ lifeExpectancy:e.target.value }); }} /></div>
          </div>
        </CardContent>
      </Card>

      {retirementPlan && (
        <>
          {/* Snapshot */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <Card className="p-4"><div className="text-[10px] font-bold uppercase text-slate-400">Today Value</div><div className="text-xl font-black">{formatCurrency(totalPortfolioValue)}</div><div className="text-[10px] text-slate-500">{formatCurrency(accountBreakdown.taxable)} taxable • {formatCurrency(accountBreakdown.retirement)} retirement</div></Card>
            <Card className="p-4"><div className="text-[10px] font-bold uppercase text-slate-400">At Retirement ({retirementPlan.ageAtRetirement}y)</div><div className="text-xl font-black">{formatCurrency(retirementPlan.projectedPortfolioAtStart)}</div><div className="text-[10px] text-slate-500">{retirementPlan.yearsUntilRetirement.toFixed(1)}y • {retirementPlan.effectiveRate*100>6 ? "⚠️" : "✓"} {(retirementPlan.effectiveRate*100).toFixed(2)}% withdrawal</div></Card>
            <Card className="p-4"><div className="text-[10px] font-bold uppercase text-slate-400">Annual Need at Start</div><div className="text-xl font-black">{formatCurrency(retirementPlan.projectedExpensesAtStart)}</div><div className="text-[10px] text-slate-500">{formatCurrency(retirementPlan.projectedExpensesAtStart/12)}/mo inflated</div></Card>
            <Card className={`p-4 ${retirementPlan.bridgeToPenFree<=0 ? "" : retirementPlan.bridgeSuccessWithGrowth ? "bg-emerald-50 border-emerald-300" : "bg-amber-50 border-amber-300"}`}><div className="flex items-center justify-between"><div className="text-[10px] font-bold uppercase text-slate-400">Bridge Needed</div>{retirementPlan.bridgeToPenFree>0 && (<span className={`text-[10px] font-bold px-2 py-0.5 rounded ${retirementPlan.bridgeSuccessWithGrowth ? "bg-emerald-600 text-white" : "bg-amber-500 text-white"}`}>{retirementPlan.bridgeSuccessWithGrowth ? "✓ Covered" : "⚠ Not covered"}</span>)}</div><div className="text-xl font-black">{retirementPlan.bridgeToPenFree.toFixed(1)}y</div><div className="text-[10px] text-slate-500">to 59.5 • SS {retirementPlan.bridgeToSS.toFixed(1)}y • Medicare {retirementPlan.bridgeToMedicare.toFixed(1)}y</div><div className="text-[10px] mt-1 font-medium" style={{color: retirementPlan.bridgeSuccessWithGrowth ? "#059669" : "#d97706"}}>{retirementPlan.bridgeToPenFree<=0 ? "No bridge — penalty-free" : `${formatCurrency(accountBreakdown.taxable)} brokerage now • ${formatCurrency(retirementPlan.taxableAtStart)} at retirement vs need ${formatCurrency(retirementPlan.needBridge)}`}</div></Card>
            <Card className="p-4 bg-slate-900 text-white"><div className="text-[10px] font-bold uppercase text-slate-400">Runway (Base)</div><div className="text-xl font-black text-white">{retirementPlan.scenarios.find(s=>s.key==="base")?.result.depletionAge ? `to ${retirementPlan.scenarios.find(s=>s.key==="base")?.result.depletionAge}y` : `100+ y`}</div><div className="text-[10px] text-slate-400">{retirementPlan.scenarios.find(s=>s.key==="base")?.result.success ? "via base" : "depletes early"} • equity {(equityPct*100).toFixed(0)}%</div></Card>
          </div>

          {/* Timeline */}
          <Card className="p-4">
            <div className="text-xs font-black uppercase tracking-widest mb-3">Milestone Timeline</div>
            <div className="relative flex items-center justify-between gap-2 overflow-x-auto py-4">
              {[
                { label:"Today", age: retirementPlan.ageToday, active:true },
                { label:"Retire", age: retirementPlan.ageAtRetirement, active:true },
                { label:"59.5 unlock", age:59.5, active: retirementPlan.ageAtRetirement < 59.5 },
                { label:`SS @${retirementPlan.ssStartAge}`, age: retirementPlan.ssStartAge, active:true },
                { label:"Medicare 65", age:65, active:true },
                { label:`Plan to ${lifeExpectancy}`, age: parseInt(lifeExpectancy)||85, active:true },
              ].sort((a,b)=>a.age-b.age).map(m=> (
                <div key={m.label} className={cn("flex flex-col items-center min-w-[80px] p-2 rounded-lg border", m.active ? "bg-[#004a99] text-white border-[#004a99]" : "bg-slate-50 text-slate-400")}>
                  <div className="text-[10px] font-bold uppercase">{m.label}</div>
                  <div className="text-lg font-black">{m.age}</div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-slate-500">Retirement accounts penalty-free at 59.5. SS can be claimed 62-70 (reduced before FRA). Medicare at 65.</div>
          </Card>

          {/* Buckets */}
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="border-l-4 border-l-emerald-500">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><Wallet className="w-4 h-4 text-emerald-600" />Bucket 1 — Cash (0–2y)</CardTitle><CardDescription className="text-[10px]">2y • brokerage only • {totalPortfolioValue>0 ? (retirementPlan.actualBucket1/totalPortfolioValue*100).toFixed(1) : "0.0"}% of portfolio</CardDescription></CardHeader>
              <CardContent>
                <div className="text-2xl font-black">{formatCurrency(retirementPlan.actualBucket1)} <span className="text-[11px] font-bold text-slate-500">({totalPortfolioValue>0 ? (retirementPlan.actualBucket1/totalPortfolioValue*100).toFixed(1) : "0.0"}%)</span></div>
                <div className="text-[10px] text-slate-500">Have total • Need {formatCurrency(retirementPlan.bucket1Need)} ({(retirementPlan.bucket1Need/retirementPlan.projectedPortfolioAtStart*100).toFixed(1)}% at retirement)</div>
                <div className="text-[10px] text-slate-500 mt-1">Brokerage {formatCurrency((accountBreakdown as any).cashBrokerage ?? accountBreakdown.cashTaxable)} • Retirement {formatCurrency(accountBreakdown.cashRetirement)} locked until 59.5 — not in Bucket 1</div>
                <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{width:`${Math.min(100, retirementPlan.actualBucket1/retirementPlan.bucket1Need*100)}%`}} /></div>
                <div className="text-[10px] mt-1 font-bold" style={{color: retirementPlan.actualBucket1 >= retirementPlan.bucket1Need ? "#059669" : "#dc2626"}}>{retirementPlan.actualBucket1 >= retirementPlan.bucket1Need ? "✓ Funded" : `Short ${formatCurrency(retirementPlan.bucket1Need - retirementPlan.actualBucket1)} brokerage`}</div>
                {accountBreakdown.cashRetirement>0 && <div className="text-[10px] mt-1 text-amber-600">Retirement cash {formatCurrency(accountBreakdown.cashRetirement)} excluded from Bucket 1 • Keep for 59.5+ or Roth ladder</div>}
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><Landmark className="w-4 h-4 text-blue-600" />Bucket 2 — Income (2–5y)</CardTitle><CardDescription className="text-[10px]">Bonds + Income ETFs • 3y • {totalPortfolioValue>0 ? (retirementPlan.actualBucket2/totalPortfolioValue*100).toFixed(1) : "0.0"}% of portfolio</CardDescription></CardHeader>
              <CardContent>
                <div className="text-2xl font-black">{formatCurrency(retirementPlan.actualBucket2)} <span className="text-[11px] font-bold text-slate-500">({totalPortfolioValue>0 ? (retirementPlan.actualBucket2/totalPortfolioValue*100).toFixed(1) : "0.0"}%)</span></div>
                <div className="text-[10px] text-slate-500">Have • Need {formatCurrency(retirementPlan.bucket2Need)} ({(retirementPlan.bucket2Need/retirementPlan.projectedPortfolioAtStart*100).toFixed(1)}% at retirement)</div>
                <div className="text-[10px] text-slate-500 mt-1">↳ {formatCurrency(accountBreakdown.fixedIncome)} bonds + {formatCurrency(retirementPlan.etfIncomeUSD)} Income ETFs</div>
                <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{width:`${Math.min(100, retirementPlan.actualBucket2/retirementPlan.bucket2Need*100)}%`}} /></div>
                <div className="text-[10px] mt-1 font-bold" style={{color: retirementPlan.actualBucket2 >= retirementPlan.bucket2Need ? "#059669" : "#dc2626"}}>{retirementPlan.actualBucket2 >= retirementPlan.bucket2Need ? "✓ Funded" : `Short ${formatCurrency(retirementPlan.bucket2Need - retirementPlan.actualBucket2)}`}</div>
                <div className="text-[10px] mt-1 text-slate-400">Label ETFs as Income to fund this bucket</div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500">
              <CardHeader className="pb-2"><CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><TrendingUp className="w-4 h-4 text-purple-600" />Bucket 3 — Growth (5y+)</CardTitle><CardDescription className="text-[10px]">Growth ETFs • {totalPortfolioValue>0 ? (retirementPlan.actualBucket3/totalPortfolioValue*100).toFixed(1) : "0.0"}% of portfolio</CardDescription></CardHeader>
              <CardContent>
                <div className="text-2xl font-black">{formatCurrency(retirementPlan.actualBucket3)} <span className="text-[11px] font-bold text-slate-500">({totalPortfolioValue>0 ? (retirementPlan.actualBucket3/totalPortfolioValue*100).toFixed(1) : "0.0"}%)</span></div>
                <div className="text-[10px] text-slate-500">Have • Remainder {formatCurrency(retirementPlan.bucket3Need)} ({(retirementPlan.bucket3Need/retirementPlan.projectedPortfolioAtStart*100).toFixed(1)}% at retirement)</div>
                <div className="text-[10px] text-slate-500 mt-1">↳ {formatCurrency(retirementPlan.etfGrowthUSD)} Growth ETFs + {formatCurrency(accountBreakdown.cashRetirement)} retirement cash • {(equityPct*100).toFixed(0)}% equity</div>
                <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-purple-500" style={{width:`${Math.min(100, retirementPlan.bucket3Need>0 ? retirementPlan.actualBucket3/retirementPlan.bucket3Need*100 : 100)}%`}} /></div>
                <div className="text-[10px] mt-1 text-slate-500">{etfBucketSplit.income>0 ? `${formatCurrency(etfBucketSplit.income)} Income → B2` : "Label Income ETFs to fill B2"}</div>
              </CardContent>
            </Card>
          </div>

          {/* Bucket Paycheck Schedule — annual */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><Wallet className="w-4 h-4 text-slate-700" /> Bucket Paycheck Schedule — Once a Year</CardTitle>
              <CardDescription className="text-[11px]">Paycheck taken from Bucket 1 (cash) → 2 (bonds+Income) → 3 (growth). Bucket 1 holds {retirementPlan.bucket1Years}y, Bucket 2 holds {retirementPlan.bucket2Years}y. At year-end Bucket 1 refilled from Bucket 2, Bucket 2 from Bucket 3 in up years.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50">
                    <TableHead className="text-[10px]">Year</TableHead>
                    <TableHead className="text-[10px]">Age</TableHead>
                    <TableHead className="text-right text-[10px]">Paycheck<br/><span className="text-[9px] font-normal">-SS</span></TableHead>
                    <TableHead className="text-right text-[10px]">Growth<br/><span className="text-[9px] font-normal">year-end</span></TableHead>
                    <TableHead className="text-right text-[10px]">Δ Total<br/><span className="text-[9px] font-normal">growth - paycheck</span></TableHead>
                    <TableHead className="text-right text-[10px]">B1 cash<br/><span className="text-[9px] font-normal">after paycheck</span></TableHead>
                    <TableHead className="text-right text-[10px]">B2 income<br/><span className="text-[9px] font-normal">after paycheck</span></TableHead>
                    <TableHead className="text-right text-[10px]">B3 growth<br/><span className="text-[9px] font-normal">after paycheck</span></TableHead>
                    <TableHead className="text-right text-[10px]">Total<br/><span className="text-[9px] font-normal">after paycheck</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    // Use the same base simulation that drives the Stress Test so 2059 ≈ 1.7M (base exhausts 2072), not the duplicate that grew to 6.5M
                    const rows = (retirementPlan.baseEvolution as any[]).filter((e:any)=> e.isRetired).slice(0, 35);
                    return rows.map((e:any)=> {
                      const delta = (e.earnings||0) - (e.netWithdrawal||0);
                      // buckets after growth (end of year) — same as Stress Test; total = endBalance
                      const b1 = e.b1 ?? 0, b2 = e.b2 ?? 0, b3 = e.b3 ?? 0;
                      const total = e.bucketTotal ?? e.endBalance;
                      const depletes = total <= 0.01;
                      return (
                        <TableRow key={e.year} className={depletes ? "bg-red-50" : ""}>
                          <TableCell className="text-xs font-bold">{e.year}</TableCell>
                          <TableCell className="text-xs">{e.age}</TableCell>
                          <TableCell className="text-right font-mono text-[11px] font-bold text-red-600">-{formatCurrency(e.netWithdrawal||0)}</TableCell>
                          <TableCell className={`text-right font-mono text-[11px] ${(e.earnings||0)>=(e.netWithdrawal||0) ? "text-emerald-600" : "text-slate-500"}`}>+{formatCurrency(e.earnings||0)}</TableCell>
                          <TableCell className={`text-right font-mono text-[11px] font-bold ${delta>=0 ? "text-emerald-600" : "text-red-600"}`}>{delta>=0 ? "+" : ""}{formatCurrency(delta)}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{b1!=null ? formatCurrency(b1) : "—"}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{b2!=null ? formatCurrency(b2) : "—"}</TableCell>
                          <TableCell className="text-right font-mono text-[11px]">{b3!=null ? formatCurrency(b3) : "—"}</TableCell>
                          <TableCell className="text-right font-mono text-[11px] font-bold">{formatCurrency(total)}</TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
              <div className="text-[10px] text-slate-500 mt-2">Once-a-year paycheck: `gross` inflated from {formatCurrency(retirementPlan.projectedExpensesAtStart)}/y, minus SS (from {retirementPlan.ssStartAge}y), remainder taken from buckets. Refill runs at year-end in up years. Values projected at {((parseFloat(retirementReturnRate)||0).toFixed(1))}%/{((parseFloat(retirementInflationRate)||0).toFixed(1))}%.</div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader><CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-600" /> Recommendations</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs leading-relaxed">
              {(() => {
                const recs: string[] = [];
                if (retirementPlan.effectiveRate > 0.04) {
                  const neededAtRet = retirementPlan.projectedExpensesAtStart / 0.04;
                  const shortfallAtRet = neededAtRet - retirementPlan.projectedPortfolioAtStart;
                  const returnRateNum = parseFloat(retirementReturnRate)/100 || 0;
                  const inflNum = parseFloat(retirementInflationRate)/100 || 0;
                  // delay years to reach 4% if portfolio grows at returnRate and expenses at inflation
                  let delayYears: number | null = null;
                  if (returnRateNum > inflNum) {
                    const rate0 = retirementPlan.effectiveRate;
                    const ratio = (1 + inflNum) / (1 + returnRateNum);
                    const raw = Math.log(0.04 / rate0) / Math.log(ratio);
                    if (isFinite(raw) && raw > 0) delayYears = Math.ceil(raw * 10) / 10;
                    // cap search 0..30 via simulation if ratio method diverges
                    if (delayYears === null || delayYears > 30) {
                      let found: number | null = null;
                      for (let d = 0.5; d <= 30; d += 0.5) {
                        const projPort = retirementPlan.projectedPortfolioAtStart * Math.pow(1 + returnRateNum, d);
                        const projExp = retirementPlan.projectedExpensesAtStart * Math.pow(1 + inflNum, d);
                        if (projExp / projPort <= 0.04) { found = d; break; }
                      }
                      delayYears = found;
                    }
                    if (delayYears !== null && delayYears > 30) delayYears = null;
                  }
                  const todayNeeded = neededAtRet / Math.pow(1 + returnRateNum, (retirementPlan as any).fractionYearsToRet || 0);
                  const delayText = delayYears !== null ? ` Alternatively, delay retirement ~${delayYears.toFixed(1)}y at ${(returnRateNum*100).toFixed(1)}% return / ${(inflNum*100).toFixed(1)}% inflation to reach 4%.` : (returnRateNum <= inflNum ? ` Return ${(returnRateNum*100).toFixed(1)}% ≤ inflation — delay alone won't lower the rate without extra saving.` : ``);
                  recs.push(`Withdrawal ${(retirementPlan.effectiveRate*100).toFixed(2)}% exceeds 4% rule (at retirement ${formatCurrency(retirementPlan.projectedExpensesAtStart)}/y on ${formatCurrency(retirementPlan.projectedPortfolioAtStart)}). For 4%, need ${formatCurrency(neededAtRet)} at retirement — shortfall ${formatCurrency(shortfallAtRet)} (${(shortfallAtRet/neededAtRet*100).toFixed(1)}%). ≈ ${formatCurrency(todayNeeded)} needed today at ${(returnRateNum*100).toFixed(1)}% growth.${delayText}`);
                }
                if (!retirementPlan.bridgeSuccessWithGrowth) {
                  const haveY = retirementPlan.bridgeYearsCoveredGrowth.toFixed(1);
                  const needY = retirementPlan.bridgeToPenFree.toFixed(1);
                  const short = formatCurrency(retirementPlan.bridgeShortfallAtRet);
                  recs.push(`Taxable bridge short (modeled with ${(parseFloat(retirementReturnRate)||0).toFixed(1)}% return / ${(parseFloat(retirementInflationRate)||0).toFixed(1)}% inflation): have ${haveY}y covered in taxable at retirement (${formatCurrency(retirementPlan.taxableAtStart)} → covers ~${haveY}y), need ${needY}y to 59.5 — shortfall ~${short} at retirement start (static have ${retirementPlan.bridgeCoverageYears.toFixed(1)}y / ${formatCurrency(retirementPlan.taxableBridge)} today). Fund Bucket 1 with taxable/brokerage or plan Roth ladder/SEPP (72t) to avoid 10% penalty.`);
                } else if (retirementPlan.bridgeToPenFree > 0) {
                  recs.push(`Taxable bridge OK (modeled): ${formatCurrency(retirementPlan.taxableAtStart)} taxable at retirement covers ${retirementPlan.bridgeToPenFree.toFixed(1)}y to 59.5 at ${(parseFloat(retirementReturnRate)||0).toFixed(1)}%/${(parseFloat(retirementInflationRate)||0).toFixed(1)}% (SS offset ${formatCurrency(parseFloat(ssAmount)||0)}/y from ${ssAge}).`);
                }
                if (retirementPlan.actualBucket1 < retirementPlan.bucket1Need) recs.push(`Cash bucket underfunded by ${formatCurrency(retirementPlan.bucket1Need - retirementPlan.actualBucket1)} — move ${((retirementPlan.bucket1Need - retirementPlan.actualBucket1)/retirementPlan.projectedPortfolioAtStart*100).toFixed(1)}% to money market/T-Bills for 2y.`);
                if (retirementPlan.actualBucket2 < retirementPlan.bucket2Need *0.8) recs.push(`Bond bucket light — add ~${formatCurrency(retirementPlan.bucket2Need - retirementPlan.actualBucket2)} short/intermediate Treasuries to cover 3y stretch and dampen sequence risk.`);
                if (equityPct > 0.75 && retirementPlan.ageAtRetirement > 55) recs.push(`Equity ${(equityPct*100).toFixed(0)}% is aggressive near retirement — glide to 60/40 or 50/50 by retirement, keep Bucket 3 for >10y horizon.`);
                if (equityPct < 0.4) recs.push(`Equity ${(equityPct*100).toFixed(0)}% may not outpace inflation over ${parseInt(lifeExpectancy)-retirementPlan.ageAtRetirement}y — consider 40–60% equity for longevity.`);
                const worst = retirementPlan.scenarios.filter(s=>s.key!=="base").sort((a,b)=>(a.result.depletionAge||999)-(b.result.depletionAge||999))[0];
                if (worst && worst.result.depletionAge && worst.result.depletionAge < (parseInt(lifeExpectancy)||85)) recs.push(`Stress: ${worst.label} depletes at ${worst.result.depletionAge} — build buffer: +1–2y cash, or reduce initial withdrawal 0.5%, or delay SS to 70 to raise ${formatCurrency(parseFloat(ssAmount)||0)}/y.`);
                if (parseInt(ssAge) < 67) recs.push(`Claiming SS at ${ssAge} locks reduction (~6–8%/yr). If bridge allows, delaying to 67–70 boosts COLA’d lifetime income and lowers portfolio withdrawal.`);
                if (retirementPlan.bridgeToMedicare >0) recs.push(`Retiring ${retirementPlan.bridgeToMedicare.toFixed(1)}y before Medicare (65) — budget ACA premiums or employer COBRA; HSA (if any) can bridge.`);
                recs.push(`Withdrawal order: taxable brokerage → pre-tax 401k/IRA after 59.5 → Roth last. Use ages 59.5–75 for Roth conversions in low-bracket years before RMDs.`);
                if (accountBreakdown.retirement>0 && accountBreakdown.taxable>0) recs.push(`Asset location: keep bonds/cash in pre-tax retirement accounts, equities in taxable/Roth for tax efficiency.`);
                if (recs.length===0) recs.push("Plan looks balanced — keep rebalancing buckets annually and refill Bucket 1 from Bucket 2/3 in up years.");
                return recs.map((r,i)=> <div key={i} className="flex gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /><span>{r}</span></div>);
              })()}
            </CardContent>
          </Card>

          {/* Stress tests */}
          <Card>
            <CardHeader><CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><Shield className="w-4 h-4 text-slate-700" /> Stress Tests</CardTitle><CardDescription className="text-xs">Deterministic — no Monte Carlo. Shows depletion age.</CardDescription></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3">
                {retirementPlan.scenarios.map(s=> {
                  const ok = s.result.success;
                  return (
                    <div key={s.key} className={cn("p-3 rounded-xl border text-center", ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
                      <div className="text-[10px] font-black uppercase tracking-widest">{s.label}</div>
                      <div className="text-[10px] text-slate-500">{s.desc}</div>
                      <div className={cn("text-lg font-black mt-1", ok ? "text-emerald-700" : "text-red-700")}>{s.result.depletionAge ? `${s.result.depletionAge}y` : "100+"}</div>
                      <div className="text-[10px] font-bold uppercase">{ok ? "✓ Survives" : "✗ Depletes"}</div>
                      <div className="text-[10px] text-slate-500">{formatCurrency(s.result.endingBalance)} at end</div>
                    </div>
                  );
                })}
              </div>
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={retirementPlan.chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="year" tick={{fontSize:10}} />
                    <YAxis tick={{fontSize:10}} tickFormatter={v=> `$${(v/1000000).toFixed(1)}M`} />
                    <ChartTooltip formatter={(v:any)=> formatCurrency(v as number)} />
                    <Legend wrapperStyle={{fontSize:10}} />
                    <ReferenceLine x={retirementPlan.scenarios[0].result.evolution.find((e:any)=> e.isRetired)?.year} stroke="#334155" strokeDasharray="4 4" label={{value:"Retire", fontSize:10}} />
                    <Line type="monotone" dataKey="base" name="Base" stroke="#0ea5e9" dot={false} strokeWidth={2.5} />
                    <Line type="monotone" dataKey="crash30" name="Crash -30%" stroke="#f59e0b" dot={false} />
                    <Line type="monotone" dataKey="crash40" name="Crash -40%" stroke="#ef4444" dot={false} />
                    <Line type="monotone" dataKey="highInfl" name="High infl" stroke="#8b5cf6" dot={false} />
                    <Line type="monotone" dataKey="stag" name="Stagflation" stroke="#ec4899" dot={false} />
                    <Line type="monotone" dataKey="lowRet" name="Low ret" stroke="#6b7280" dot={false} strokeDasharray="6 4" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Guyton–Klinger Guardrails (2006) — rules 3 & 4 */}
          <Card className="border-emerald-200 bg-emerald-50/20">
            <CardHeader>
              <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><PiggyBank className="w-4 h-4 text-emerald-700" /> Guyton–Klinger Guardrails — Rules 3 & 4</CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                <span className="font-bold">1. Portfolio mgmt</span> — withdrawal taken proportionally to rebalance to target ({(equityPct*100).toFixed(0)}% equity). <span className="font-bold">2. Withdrawal</span> — y1: {(retirementPlan.guardrails[0]?.initialRate*100||0).toFixed(2)}% × portfolio; then prior × (1+inflation). <span className="font-bold">3. Capital preservation</span> — if withdrawal rate &gt; {(retirementPlan.guardrails[0]?.gkUpper*100||0).toFixed(2)}% (120% of initial) → cut 10%. <span className="font-bold">4. Prosperity</span> — if &lt; {(retirementPlan.guardrails[0]?.gkLower*100||0).toFixed(2)}% (80%) → raise 10%. <span className="font-bold">5. Inflation</span> — skip inflation raise after any negative-return year.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded bg-white border"><div className="text-[10px] font-bold uppercase text-slate-400">Initial rate</div><div className="text-sm font-black">{(retirementPlan.guardrails[0]?.initialRate*100||0).toFixed(2)}%</div><div className="text-[10px] text-slate-500">{formatCurrency(retirementPlan.projectedExpensesAtStart)}/y ÷ {formatCurrency(retirementPlan.projectedPortfolioAtStart)}</div></div>
                <div className="p-2 rounded bg-amber-50 border border-amber-200"><div className="text-[10px] font-bold uppercase text-amber-700">Upper guardrail</div><div className="text-sm font-black text-amber-700">{(retirementPlan.guardrails[0]?.gkUpper*100||0).toFixed(2)}% — cut 10%</div><div className="text-[10px] text-slate-500">120% of initial</div></div>
                <div className="p-2 rounded bg-emerald-50 border border-emerald-200"><div className="text-[10px] font-bold uppercase text-emerald-700">Lower guardrail</div><div className="text-sm font-black text-emerald-700">{(retirementPlan.guardrails[0]?.gkLower*100||0).toFixed(2)}% — raise 10%</div><div className="text-[10px] text-slate-500">80% of initial</div></div>
              </div>
              {retirementPlan.guardrails.map((g:any)=> {
                const s = retirementPlan.scenarios.find((x:any)=> x.key===g.key);
                const baseOk = g.success;
                const gkOk = g.gkSuccess;
                return (
                  <div key={g.key} className={`p-3 rounded-xl border ${gkOk ? "bg-white border-emerald-200" : baseOk ? "bg-white" : "bg-red-50 border-red-200"}`}>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="text-[11px] font-black uppercase tracking-widest">{g.label} <span className="font-normal normal-case text-slate-500">— {s?.desc}</span></div>
                      <div className="flex gap-1">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded border ${baseOk ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-100 text-red-700 border-red-200"}`}>Base: {baseOk ? "✓ Survives" : `✗ Depletes @${g.baseDepletionAge}y`}</span>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded border ${gkOk ? "bg-emerald-600 text-white border-emerald-600" : "bg-amber-100 text-amber-800 border-amber-200"}`}>GK: {gkOk ? "✓ Survives" : `✗ Depletes @${g.gkDepletionAge}y`}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                      <div className="p-2 rounded bg-slate-50 border"><div className="text-[10px] uppercase font-bold text-slate-500">Cuts (−10%)</div><div className="text-lg font-black">{g.gkCuts}</div><div className="text-[10px] text-slate-500">preservation</div></div>
                      <div className="p-2 rounded bg-slate-50 border"><div className="text-[10px] uppercase font-bold text-slate-500">Raises (+10%)</div><div className="text-lg font-black">{g.gkRaises}</div><div className="text-[10px] text-slate-500">prosperity</div></div>
                      <div className="p-2 rounded bg-slate-50 border"><div className="text-[10px] uppercase font-bold text-slate-500">Infl. skips</div><div className="text-lg font-black">{g.gkInflSkips}</div><div className="text-[10px] text-slate-500">after loss</div></div>
                    </div>
                    <div className="mt-3 rounded-lg border overflow-hidden">
                      <div className="px-3 py-2 bg-slate-50 border-b flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Year-by-year GK spending (gross before SS)</span>
                        <span className="text-[10px] font-bold text-slate-500">Base {formatCurrency(retirementPlan.projectedExpensesAtStart)}/y → GK as below</span>
                      </div>
                      <div className="max-h-[220px] overflow-auto">
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0 bg-white border-b"><tr className="text-[10px] font-bold uppercase text-slate-500"><th className="text-left px-3 py-1.5">Year</th><th className="text-left px-3 py-1.5">Age</th><th className="text-right px-3 py-1.5">GK gross</th><th className="text-right px-3 py-1.5">Base gross</th><th className="text-left px-3 py-1.5">Action</th></tr></thead>
                          <tbody>
                            {(() => {
                              const baseInfl = parseFloat(retirementInflationRate)/100 || 0;
                              return g.gkEvolution.filter((e:any)=> e.isRetired).slice(0, 35).map((e:any, idx:number)=> {
                                const baseGross = retirementPlan.projectedExpensesAtStart * Math.pow(1+baseInfl, idx);
                                const isCut = e.action?.includes("-10%");
                                const isRaise = e.action?.includes("+10%");
                                return (
                                  <tr key={e.year} className={`border-b last:border-0 ${isCut ? "bg-amber-50/60" : isRaise ? "bg-emerald-50/60" : ""}`}>
                                    <td className="px-3 py-1 font-mono">{e.year}</td>
                                    <td className="px-3 py-1">{e.age}</td>
                                    <td className={`px-3 py-1 text-right font-mono font-bold ${isCut ? "text-amber-700" : isRaise ? "text-emerald-700" : "text-slate-700"}`}>{formatCurrency(e.grossWithdrawal)}</td>
                                    <td className="px-3 py-1 text-right font-mono text-slate-400">{formatCurrency(baseGross)}</td>
                                    <td className="px-3 py-1 text-[10px]">{e.action ? <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${isCut ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>{e.action}</span> : <span className="text-slate-400">—</span>}</td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-3 py-1.5 bg-slate-50 border-t text-[10px] text-slate-500">Negative years are portfolio-rate &gt;120% cuts; prosperity &lt;80% raises. Blank = just inflated base.</div>
                    </div>
                    {!baseOk && gkOk && <div className="text-[11px] mt-2 p-2 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">↳ GK saves this stress — base depletes at {g.baseDepletionAge}y but guardrails (cuts/raises + inflation skip) keep it to {lifeExpectancy}y.</div>}
                    {baseOk && gkOk && <div className="text-[10px] mt-2 text-slate-500">Base already survives; GK would add {g.gkCuts} cuts / {g.gkRaises} raises as volatility buffer.</div>}
                    {!gkOk && <div className="text-[11px] mt-2 p-2 rounded bg-amber-50 border border-amber-200 text-amber-800">GK still depletes — consider lower initial rate ({(g.initialRate*100).toFixed(2)}% → {(g.gkLower*100).toFixed(2)}% target) or extra buffer/delay.</div>}
                  </div>
                );
              })}
              <div className="text-[10px] text-slate-500 border-t pt-2">Deterministic at {(parseFloat(retirementReturnRate)||0).toFixed(1)}%/{(parseFloat(retirementInflationRate)||0).toFixed(1)}% and equity {(equityPct*100).toFixed(0)}% (buckets + 50% growth cap where crash). Inflation skip triggers on yrReturn &lt; 0; rebalancing proportional.</div>
            </CardContent>
          </Card>

          {/* Year-by-year */}
          <Card>
            <CardHeader><CardTitle className="text-xs font-black uppercase tracking-widest">Year-by-Year Plan (Base)</CardTitle><CardDescription className="text-xs">Expenses inflate at {(parseFloat(retirementInflationRate)||0).toFixed(1)}%, portfolio net of SS. Penalty flag before 59.5.</CardDescription></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-slate-50"><TableHead className="text-[10px]">Year</TableHead><TableHead className="text-[10px]">Age</TableHead><TableHead className="text-right text-[10px]">Start</TableHead><TableHead className="text-right text-[10px]">SS</TableHead><TableHead className="text-right text-[10px]">Net Wd</TableHead><TableHead className="text-right text-[10px]">Return</TableHead><TableHead className="text-right text-[10px]">End</TableHead><TableHead className="text-[10px]">Note</TableHead></TableRow></TableHeader>
                <TableBody>
                  {retirementPlan.baseEvolution.slice(0, 60).map((r:any)=> (
                    <TableRow key={r.year} className={cn(!r.isRetired && "opacity-60", r.isPenalty && "bg-amber-50/50")}>
                      <TableCell className="text-xs font-bold">{r.year}</TableCell>
                      <TableCell className="text-xs">{r.age}{r.isPenalty ? " ⚠️" : ""}</TableCell>
                      <TableCell className="text-right font-mono text-[11px]">{formatCurrency(r.startBalance)}</TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-emerald-700">{r.yearSS>0 ? formatCurrency(r.yearSS) : "—"}</TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-red-600">{r.netWithdrawal>0 ? "-"+formatCurrency(r.netWithdrawal) : "—"}</TableCell>
                      <TableCell className="text-right font-mono text-[11px] text-blue-600">+{formatCurrency(r.earnings)}</TableCell>
                      <TableCell className="text-right font-mono text-[11px] font-bold">{formatCurrency(r.endBalance)}</TableCell>
                      <TableCell className="text-[10px] text-slate-500">{r.isPenalty ? "Pre-59.5" : r.isSS && r.year===retirementPlan.scenarios[0].result.evolution.find((e:any)=> e.isSS)?.year ? "SS starts" : r.age===65 ? "Medicare" : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!editingExpense} onOpenChange={()=> setEditingExpense(null)}>
        <DialogContent className="sm:max-w-[425px]"><DialogHeader><DialogTitle>Edit Expense</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-4"><div className="grid gap-2"><label className="text-xs font-bold uppercase opacity-60">Description</label><Input value={editingExpense?.description||""} onChange={e=> setEditingExpense(p=> p?{...p, description:e.target.value}:null)} /></div><div className="grid gap-2"><label className="text-xs font-bold uppercase opacity-60">Amount ($)</label><Input type="number" value={editingExpense?.amount||""} onChange={e=> setEditingExpense(p=> p?{...p, amount:e.target.value}:null)} /></div><div className="flex justify-end gap-2 pt-4"><Button variant="outline" onClick={()=> setEditingExpense(null)}>Cancel</Button><Button onClick={handleUpdateExpense}>Save</Button></div></div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Retirement;
