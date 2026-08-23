import { formatCurrency } from "@/lib/utils";
import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TrendingUp, Activity, BarChart3, Database, RefreshCw, ArrowUpRight, ArrowDownRight } from "lucide-react";

type TimeRange = "ytd" | "1y" | "all";

export default function Performance({ 
  selectedPortfolioId,
  selectedAccountType = "all"
}: { 
  selectedPortfolioId: number,
  selectedAccountType?: string
}) {
  // Independent time range states for each panel
  const [growthRange, setGrowthRange] = useState<TimeRange>("ytd");

  // Account filter
  const [selectedAccountId, setSelectedAccountId] = useState<number | "ALL">("ALL");

  // Reset filter when portfolio changes
  useEffect(() => {
    setSelectedAccountId("ALL");
  }, [selectedPortfolioId]);

  const { data: accounts } = trpc.account.getAccounts.useQuery(
    { portfolioId: selectedPortfolioId },
    { enabled: !!selectedPortfolioId }
  );

  // Queries
  const { data: evolution, isLoading: isLoadingEvolution } = trpc.etf.getPortfolioEvolution.useQuery(
    { 
      portfolioId: selectedPortfolioId, 
      range: growthRange,
      accountId: selectedAccountId === "ALL" ? undefined : selectedAccountId,
      accountType: selectedAccountType === "all" ? undefined : selectedAccountType,
      granularity: "1mo"
    },
    { enabled: !!selectedPortfolioId }
  );

  const { data: yearlyPerformance } = trpc.etf.getYearlyPerformance.useQuery(
    { 
      portfolioId: selectedPortfolioId,
      accountId: selectedAccountId === "ALL" ? undefined : selectedAccountId,
      accountType: selectedAccountType === "all" ? undefined : selectedAccountType
    },
    { enabled: !!selectedPortfolioId }
  );

  const { data: monthlyPerformance } = trpc.etf.getMonthlyPerformance.useQuery(
    { 
      portfolioId: selectedPortfolioId,
      accountId: selectedAccountId === "ALL" ? undefined : selectedAccountId,
      accountType: selectedAccountType === "all" ? undefined : selectedAccountType
    },
    { enabled: !!selectedPortfolioId }
  );

  const getDaysForRange = (range: TimeRange) => {
    if (range === "ytd") {
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    }
    if (range === "all") return 3650; // Use a large number for all time
    return 365;
  };

  // Format evolution data for chart
  const evolutionChartData = evolution?.map((item) => ({
    date: new Date(item.date + "T12:00:00").toLocaleDateString(undefined, {
      month: "short",
      year: "2-digit",
    }),
    value: parseFloat(item.value),
    investmentValue: parseFloat((item as any).investmentValue || "0"),
    equitiesValue: parseFloat(((item as any).equitiesValue ?? (item as any).investmentValue) || "0"),
    fixedIncomeValue: parseFloat((item as any).fixedIncomeValue || "0"),
    cashValue: parseFloat((item as any).cashValue || "0"),
    rawDate: item.date,
  })) || [];

  const EvolutionTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
          <p className="font-bold text-slate-800 mb-2 border-b border-slate-100 pb-1">{label}</p>
          <div className="space-y-1.5">
            <div className="flex justify-between gap-8">
              <span className="text-slate-500 font-bold uppercase text-[10px]">Total Value:</span>
              <span className="font-bold text-slate-800">{formatCurrency(data.value)}</span>
            </div>
            <div className="flex justify-between gap-8">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Equities:</span>
              <span className="font-mono text-primary">{formatCurrency(data.equitiesValue ?? data.investmentValue)}</span>
            </div>
            <div className="flex justify-between gap-8">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Fixed Income:</span>
              <span className="font-mono text-purple-600">{formatCurrency(data.fixedIncomeValue || 0)}</span>
            </div>
            <div className="flex justify-between gap-8">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Cash:</span>
              <span className="font-mono text-slate-500">{formatCurrency(data.cashValue)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const getEvolutionChange = () => {
    if (evolutionChartData.length < 2) return { val: 0, percent: 0, isPositive: true };
    const first = evolutionChartData[0].value;
    const last = evolutionChartData[evolutionChartData.length - 1].value;
    
    // Find first non-zero point to calculate growth from, same as backend
    const firstNonZero = evolutionChartData.find(d => d.value > 0);
    const baseValue = firstNonZero ? firstNonZero.value : first;
    
    const diff = last - baseValue;
    const percent = baseValue > 0 ? (diff / baseValue) * 100 : 0;
    return { val: diff.toFixed(2), percent: percent.toFixed(2), isPositive: diff >= 0 };
  };

  const evolutionChange = getEvolutionChange();

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
          <p className="font-bold text-slate-800 mb-2 border-b border-slate-100 pb-1">{label}</p>
          <div className="space-y-1.5">
            <div className="flex justify-between gap-4">
              <span className="text-slate-500">Total Portfolio Value:</span>
              <span className="font-bold text-primary">{formatCurrency(Number(data.totalValue))}</span>
            </div>
            <div className="flex justify-between gap-4 pl-2 border-l-2 border-slate-100">
              <span className="text-slate-400">Previous Value + Gains/Losses:</span>
              <span className="font-mono">{formatCurrency(Number(data.existingValue))}</span>
            </div>
            <div className="flex justify-between gap-4 pl-2 border-l-2 border-slate-100">
              <span className="text-slate-400">New Purchases:</span>
              <span className="font-mono text-blue-600">+{formatCurrency(Number(data.purchases))}</span>
            </div>
            <div className="flex justify-between gap-4 mt-2 pt-1 border-t border-slate-50 italic">
              <span className="text-slate-400">Monthly Market Change:</span>
              <span className={`font-mono ${Number(data.marketGainLoss) >= 0 ? "text-green-600" : "text-red-600"}`}>
                {Number(data.marketGainLoss) >= 0 ? "+" : ""}{formatCurrency(Number(data.marketGainLoss))}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const RangeSelector = ({ value, onChange, className }: { value: TimeRange, onChange: (val: TimeRange) => void, className?: string }) => (
    <div className={`flex bg-slate-100 p-0.5 rounded-md ${className}`}>
      {(["ytd", "1y", "all"] as const).map((period) => (
        <button
          key={period}
          onClick={() => onChange(period)}
          className={`px-3 py-1 rounded-sm text-[10px] font-bold uppercase transition-all duration-200 ${
            value === period
              ? "bg-white text-primary shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {period === "all" ? "ALL" : period}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Action Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-lg shadow-sm border border-border">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-slate-100 rounded-lg text-primary">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Performance Analytics</h2>
            <p className="text-xs text-slate-500 font-medium">Historical growth and individual asset tracking</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account:</span>
            <select 
              className="bg-transparent border-none p-0 text-xs font-bold text-slate-600 focus:outline-none h-6 min-w-[140px]"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value === "ALL" ? "ALL" : Number(e.target.value))}
            >
              <option value="ALL">All Accounts</option>
              {accounts
                ?.filter((acc: any) => selectedAccountType === "all" || acc.accountType === selectedAccountType)
                ?.map((acc: any) => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Portfolio Evolution Chart */}
      <Card className="p-8 bg-white shadow-sm border border-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold text-slate-800">Portfolio Growth</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <RangeSelector value={growthRange} onChange={setGrowthRange} />
            </div>
          </div>
          
          {evolutionChartData.length > 0 && (
            <div className="flex items-center gap-8">
              <div className="text-right">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Selected Value</div>
                <div className="text-3xl font-bold text-slate-800 font-mono">
                  {formatCurrency(evolutionChartData[evolutionChartData.length - 1].value)}
                </div>
              </div>
              <div className={`text-right px-4 py-2 rounded-lg ${evolutionChange.isPositive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">{growthRange === "all" ? "All Time" : growthRange} Change</div>
                <div className="flex items-center justify-end gap-1 font-bold">
                  {evolutionChange.isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  <span>{evolutionChange.isPositive ? "+" : ""}{evolutionChange.percent}%</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="h-[400px] w-full">
          {isLoadingEvolution ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
              <RefreshCw className="w-8 h-8 animate-spin" />
              <span className="text-xs font-bold uppercase tracking-widest">Processing Market Data...</span>
            </div>
          ) : evolutionChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={evolutionChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  minTickGap={40}
                />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  content={<EvolutionTooltip />}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: '20px' }}
                />
                <Bar
                  dataKey="equitiesValue"
                  name="Equities"
                  stackId="a"
                  fill="#004a99"
                  radius={[0, 0, 0, 0]}
                  animationDuration={1500}
                />
                <Bar
                  dataKey="fixedIncomeValue"
                  name="Fixed Income"
                  stackId="a"
                  fill="#9333ea"
                  radius={[0, 0, 0, 0]}
                  animationDuration={1500}
                />
                <Bar
                  dataKey="cashValue"
                  name="Cash"
                  stackId="a"
                  fill="#94a3b8"
                  radius={[4, 4, 0, 0]}
                  animationDuration={1500}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 italic">
              No historical data available for the selected timeframe.
            </div>
          )}
        </div>
      </Card>

      {/* Yearly Performance Table */}
      <Card className="bg-white border-none shadow-sm shadow-slate-200/50">
        <div className="p-6 border-b border-slate-50">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-bold text-slate-800 uppercase tracking-widest">Yearly Portfolio Performance</h2>
          </div>
        </div>
        <div className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/50 text-slate-400 font-bold text-[10px] uppercase tracking-tighter border-b border-slate-100">
                  <th className="py-2 px-3 text-left">Year</th>
                  <th className="py-2 px-3 text-right">Cost Basis</th>
                  <th className="py-2 px-3 text-right">Start Val.</th>
                  <th className="py-2 px-3 text-right">Purchases</th>
                  <th className="py-2 px-3 text-right">End Bal.</th>
                  <th className="py-2 px-3 text-right">Cash</th>
                  <th className="py-2 px-3 text-right">Total</th>
                  <th className="py-2 px-3 text-right">Yearly G/L</th>
                  <th className="py-2 px-3 text-right">Annual %</th>
                  <th className="py-2 px-3 text-right">Total G/L</th>
                  <th className="py-2 px-3 text-right">Total %</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                {yearlyPerformance?.map((row) => {
                  const gainNum = parseFloat(row.gainLoss);
                  const isPositive = gainNum >= 0;
                  const yearlyGainNum = parseFloat(row.yearlyGainLoss || "0");
                  const isYearlyPositive = yearlyGainNum >= 0;
                  const annualReturnNum = parseFloat(row.annualReturnPercent);
                  const isAnnualPositive = annualReturnNum >= 0;
                  const isCurrentYear = row.year === new Date().getFullYear();

                  return (
                    <tr key={row.year} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-3 font-bold text-slate-700 text-xs">{row.year}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600 text-[11px]">{formatCurrency(row.costBasis)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600 text-[11px]">{formatCurrency(row.startInvestment)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600 text-[11px]">{formatCurrency(row.purchasesInYear)}</td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600 text-[11px]">
                        <div className="flex flex-col items-end">
                          <span>{formatCurrency(row.investment)}</span>
                          {isCurrentYear && <span className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter leading-none">Current</span>}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-slate-600 text-[11px]">{formatCurrency(row.cash)}</td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-slate-800 text-[11px]">{formatCurrency(row.total)}</td>
                      <td className={`py-3 px-3 text-right font-mono font-bold text-[11px] ${isYearlyPositive ? "text-green-600" : "text-red-600"}`}>
                        {isYearlyPositive ? "+" : ""}{formatCurrency(row.yearlyGainLoss)}
                      </td>
                      <td className={`py-3 px-3 text-right`}>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${isAnnualPositive ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"}`}>
                          {isAnnualPositive ? "+" : ""}{row.annualReturnPercent}%
                        </span>
                      </td>
                      <td className={`py-3 px-3 text-right font-mono font-bold text-[11px] ${isPositive ? "text-green-600" : "text-red-600"}`}>
                        {isPositive ? "+" : ""}{formatCurrency(row.gainLoss)}
                      </td>
                      <td className={`py-3 px-3 text-right`}>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${isPositive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {isPositive ? "+" : ""}{row.gainLossPercent}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {(!yearlyPerformance || yearlyPerformance.length === 0) && (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-slate-400 italic">No historical data available for this portfolio.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Monthly Performance Chart */}
      <Card className="bg-white border-none shadow-sm shadow-slate-200/50">
        <div className="p-6 border-b border-slate-50">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-lg font-bold text-slate-800 uppercase tracking-widest">Last 12 Months Performance</h2>
          </div>
        </div>
        <div className="p-6 h-[400px]">
          {monthlyPerformance && monthlyPerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyPerformance} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis 
                  dataKey="month" 
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
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9' }}
                  content={<CustomTooltip />}
                />
                <Bar 
                  dataKey="existingValue" 
                  stackId="a" 
                  fill="#004a99" 
                  name="existingValue"
                  radius={[0, 0, 0, 0]}
                />
                <Bar 
                  dataKey="purchases" 
                  stackId="a" 
                  fill="#3b82f6" 
                  name="purchases"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 italic">
              No monthly data available.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
