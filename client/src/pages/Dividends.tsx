import { formatCurrency, formatNumber } from "@/lib/utils";
import React, { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";
import { DollarSign, Calendar, ListFilter, Trophy, RefreshCw, BarChart3, TrendingUp } from "lucide-react";

export default function Dividends({ selectedPortfolioId }: { selectedPortfolioId: number }) {
  const [withDRIP, setWithDRIP] = useState(false);

  const { data: report, isLoading } = trpc.etf.getDetailedDividendReport.useQuery(
    { portfolioId: selectedPortfolioId },
    { enabled: !!selectedPortfolioId }
  );

  const { data: accounts } = trpc.account.getAccounts.useQuery(
    { portfolioId: selectedPortfolioId },
    { enabled: !!selectedPortfolioId }
  );

  const { data: projections, isLoading: isProjectionLoading } = trpc.etf.getProjectedDividends.useQuery(
    { portfolioId: selectedPortfolioId, withDRIP: withDRIP },
    { enabled: !!selectedPortfolioId }
  );

  const [globalFilterSymbol, setGlobalFilterSymbol] = useState<string>("ALL");
  const [filterAccountId, setFilterAccountId] = useState<string>("ALL");

  // Reset filters when portfolio changes
  useEffect(() => {
    setGlobalFilterSymbol("ALL");
    setFilterAccountId("ALL");
  }, [selectedPortfolioId]);

  // Group history by month for bar chart
  const barChartData = useMemo(() => {
    if (!report?.history) return [];
    
    const filtered = globalFilterSymbol === "ALL" 
      ? report.history 
      : report.history.filter((h: any) => h.symbol === globalFilterSymbol);
      
    const grouped: Record<string, number> = {};
    
    filtered.forEach((div: any) => {
      const date = new Date(div.exDate);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      grouped[key] = (grouped[key] || 0) + div.totalAmount;
    });
    
    return Object.entries(grouped)
      .map(([date, amount]) => ({ 
        date, 
        amount: parseFloat(amount.toFixed(2)),
        displayDate: new Date(date + "-02").toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [report?.history, globalFilterSymbol]);

  const filteredHistory = useMemo(() => {
    if (!report?.history) return [];
    return report.history.filter((h: any) => {
      const symbolMatch = globalFilterSymbol === "ALL" || h.symbol === globalFilterSymbol;
      const accountMatch = filterAccountId === "ALL" || h.accountId?.toString() === filterAccountId;
      return symbolMatch && accountMatch;
    });
  }, [report?.history, globalFilterSymbol, filterAccountId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <RefreshCw className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Compiling Dividend History...</p>
      </div>
    );
  }

  const displayAllTimeTotal = globalFilterSymbol === "ALL"
    ? report?.totalAllTime
    : report?.etfBreakdown.find((e: any) => e.symbol === globalFilterSymbol)?.totalAllTime || "0.00";

  const displayMonthlyAverage = globalFilterSymbol === "ALL"
    ? (parseFloat(report?.totalLastYear || "0") / 12).toFixed(2)
    : (parseFloat(report?.etfBreakdown.find((e: any) => e.symbol === globalFilterSymbol)?.totalLastYear || "0") / 12).toFixed(2);

  const displayLastYearTotal = globalFilterSymbol === "ALL"
    ? report?.totalLastYear
    : report?.etfBreakdown.find((e: any) => e.symbol === globalFilterSymbol)?.totalLastYear || "0.00";

  const displayQuarterlyBreakdown = globalFilterSymbol === "ALL"
    ? report?.quarterlyBreakdown
    : report?.etfBreakdown.find((e: any) => e.symbol === globalFilterSymbol)?.quarterlyBreakdown || [];

  return (
    <div className="space-y-8">
      {/* Action Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-lg shadow-sm border border-border">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-slate-100 rounded-lg text-primary">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Dividend Analytics</h2>
            <p className="text-xs text-slate-500 font-medium">Passive income audit and payout timelines</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Focus:</span>
            <select 
              className="bg-transparent border-none p-0 text-xs font-bold text-slate-600 focus:outline-none h-6 min-w-[140px]"
              value={globalFilterSymbol}
              onChange={(e) => setGlobalFilterSymbol(e.target.value)}
            >
              <option value="ALL">Total Portfolio</option>
              {report?.etfBreakdown.map((etf: any) => (
                <option key={etf.symbol} value={etf.symbol}>{etf.symbol}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Dividend Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* All Time Panel */}
        <Card className="p-6 bg-white shadow-sm border border-border border-t-4 border-t-yellow-500">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Received (All Time)</div>
              <div className="text-3xl font-bold text-slate-800 font-mono">
                {formatCurrency(displayAllTimeTotal)}
              </div>
            </div>
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Trophy className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
        </Card>

        {/* Monthly Average Panel */}
        <Card className="p-6 bg-white shadow-sm border border-border border-t-4 border-t-green-600">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Monthly Avg (L12M)</div>
              <div className="text-3xl font-bold text-slate-800 font-mono">
                {formatCurrency(displayMonthlyAverage)}
              </div>
            </div>
            <div className="p-2 bg-green-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
          </div>
        </Card>

        {/* Last Year Panel */}
        <Card className="p-6 bg-white shadow-sm border border-border border-t-4 border-t-primary">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Total (Last 12M)</div>
              <div className="text-3xl font-bold text-slate-800 font-mono">{formatCurrency(displayLastYearTotal)}</div>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <Calendar className="w-5 h-5 text-slate-600" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {displayQuarterlyBreakdown?.map((q: any) => (
              <div key={q.quarter} className="text-center p-1 bg-slate-50 rounded border border-slate-100">
                <div className="text-[8px] font-bold text-slate-400 uppercase truncate">{q.quarter.split(' ')[1]}</div>
                <div className="text-[10px] font-bold text-slate-700">{formatCurrency(q.amount, 0)}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Asset Distribution */}
        <Card className="p-6 bg-white shadow-sm border border-border border-t-4 border-t-pink-600">
          <div className="flex justify-between items-start mb-4">
            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Distribution (L12M)</div>
            <div className="p-2 bg-pink-50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-pink-600" />
            </div>
          </div>
          <div className="space-y-2 max-h-[80px] overflow-y-auto pr-2 custom-scrollbar">
            {report?.etfBreakdown.map((etf: any) => (
              <div key={etf.symbol} className="flex justify-between items-center pb-1 border-b border-slate-100 last:border-0">
                <div className="font-bold text-slate-700 text-[10px]">{etf.symbol}</div>
                <div className="font-mono text-green-600 text-[10px] font-bold">{formatCurrency(etf.totalLastYear)}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Dividend Payout Chart */}
      <Card className="p-8 bg-white shadow-sm border border-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold text-slate-800">Dividend Payout Timeline</h2>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Period Value</div>
            <div className="text-3xl font-bold text-slate-800 font-mono">
              {formatCurrency(barChartData.reduce((acc, curr) => acc + curr.amount, 0))}
            </div>
          </div>
        </div>

        <div className="h-[350px] w-full">
          {barChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis 
                  dataKey="displayDate" 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  minTickGap={20}
                />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false}
                  tickFormatter={(value) => `$${value}`}
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
                  formatter={(value) => [formatCurrency(value as number), "Received"]}
                />
                <Bar dataKey="amount" fill="#004a99" radius={[4, 4, 0, 0]}>
                  {barChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill="#004a99" fillOpacity={0.8 + (index / barChartData.length) * 0.2} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 italic">
              No historical payouts recorded for this selection.
            </div>
          )}
        </div>
      </Card>

      {/* Forward-Looking Income Projection */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-slate-800">Forward-Looking Income Projection</h2>
          </div>
          <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-md border border-border shadow-sm">
            <Switch 
              id="drip-toggle" 
              checked={withDRIP} 
              onCheckedChange={setWithDRIP}
              className="scale-75 origin-right"
            />
            <Label htmlFor="drip-toggle" className="text-[10px] font-bold text-slate-500 uppercase cursor-pointer select-none">
              Simulate Dividend Re-investment (DRIP)
            </Label>
          </div>
        </div>

        {isProjectionLoading ? (
          <Card className="p-8 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-primary mr-2" />
            <span className="text-slate-500 font-medium">Calculating projections...</span>
          </Card>
        ) : projections ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6 bg-white shadow-sm border border-border border-l-4 border-l-green-600 relative overflow-hidden">
                <div className="flex justify-between items-start mb-1">
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Projected Annual Income (Next 12M)</div>
                  {withDRIP && (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 border-none text-[8px] font-bold py-0 h-4">
                      Includes Compounding
                    </Badge>
                  )}
                </div>
                <div className="text-4xl font-bold text-slate-800 font-mono mb-2">
                  {formatCurrency(projections.totalProjectedAnnual)}
                </div>
                <div className="text-sm text-slate-500">
                  Monthly average: <span className="font-bold text-slate-700">{formatCurrency(parseFloat(projections.totalProjectedAnnual) / 12)}</span>
                </div>
              </Card>

              <Card className="p-6 bg-white shadow-sm border border-border md:col-span-2">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart3 className="w-4 h-4 text-slate-400" />
                  <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Monthly Payout Forecast</div>
                </div>
                <div className="h-[120px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={projections.monthlyProjection}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={8} tickLine={false} axisLine={false} />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fff",
                          border: "1px solid #e2e8f0",
                          borderRadius: "8px",
                          fontSize: "10px",
                        }}
                        formatter={(value) => [formatCurrency(value as number), "Projected"]}
                      />
                      <Bar dataKey="amount" fill="#10b981" radius={[2, 2, 0, 0]}>
                        {projections.monthlyProjection.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill="#10b981" fillOpacity={0.6 + (index / 12) * 0.4} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </div>

            <Card className="bg-white shadow-sm border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-700">Projection by Asset</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-6 text-slate-600 font-bold">Symbol</th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold">Shares Owned</th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold">Shares after 12M</th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold">Annual DPS</th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold">Yield %</th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold">Projected Annual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projections.assets.map((asset: any) => (
                      <tr key={asset.symbol} className="border-b border-border hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-6 font-bold text-primary">{asset.symbol}</td>
                        <td className="py-3 px-6 text-right font-mono text-slate-500">{formatNumber(asset.currentQuantity, 3)}</td>
                        <td className="py-3 px-6 text-right font-mono font-bold text-slate-800">{formatNumber(asset.finalQuantity, 3)}</td>
                        <td className="py-3 px-6 text-right font-mono text-slate-500">{formatCurrency(asset.annualDPS, 4)}</td>
                        <td className="py-3 px-6 text-right font-mono font-medium text-blue-600">{asset.yield}%</td>
                        <td className="py-3 px-6 text-right font-mono font-bold text-green-600">{formatCurrency(asset.projectedAnnual)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        ) : (
          <div className="text-center py-10 text-slate-400">No projection data available. Add holdings to see forecasts.</div>
        )}
      </div>

      {/* Comparative Dividend Analysis */}
      <Card className="bg-white shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-widest">Year-over-Year Comparative Analysis</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-border text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <th className="text-left py-3 px-6">Asset</th>
                <th className="text-right py-3 px-6">{report?.targetQuarterKey || "Last Quarter"}</th>
                <th className="text-right py-3 px-6">{report?.priorYearQuarterKey || "Prior Year"}</th>
                <th className="text-center py-3 px-6">QoQ Growth %</th>
                <th className="text-right py-3 px-6">L12M Total</th>
                <th className="text-right py-3 px-6">P12M Total</th>
                <th className="text-center py-3 px-6">YoY Growth %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {report?.etfBreakdown.map((asset: any) => {
                const growthNum = parseFloat(asset.growthPercent);
                const isGrowthPositive = growthNum >= 0;
                const yearlyGrowthNum = parseFloat(asset.yearlyGrowthPercent);
                const isYearlyGrowthPositive = yearlyGrowthNum >= 0;
                
                return (
                  <tr key={asset.symbol} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6 font-bold text-slate-700">{asset.symbol}</td>
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
            {report?.consolidatedComparative && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr className="font-bold text-slate-800">
                  <td className="py-4 px-6 uppercase text-[10px] tracking-widest text-slate-500">Portfolio Totals</td>
                  <td className="text-right py-4 px-6 font-mono text-sm text-primary">
                    {formatCurrency(report.consolidatedComparative.latestAmount)}
                  </td>
                  <td className="text-right py-4 px-6 font-mono text-sm text-slate-600">
                    {formatCurrency(report.consolidatedComparative.priorAmount)}
                  </td>
                  <td className="text-center py-4 px-6">
                    <span className={`px-3 py-1 rounded text-xs font-bold font-mono ${parseFloat(report.consolidatedComparative.growthPercent) >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {parseFloat(report.consolidatedComparative.growthPercent) >= 0 ? "+" : ""}
                      {report.consolidatedComparative.growthPercent}%
                    </span>
                  </td>
                  <td className="text-right py-4 px-6 font-mono text-sm text-slate-800">
                    {formatCurrency(report.consolidatedComparative.totalLastYear)}
                  </td>
                  <td className="text-right py-4 px-6 font-mono text-sm text-slate-500">
                    {formatCurrency(report.consolidatedComparative.totalPriorYear)}
                  </td>
                  <td className="text-center py-4 px-6">
                    <span className={`px-3 py-1 rounded text-xs font-bold font-mono ${parseFloat(report.consolidatedComparative.yearlyGrowthPercent) >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                      {parseFloat(report.consolidatedComparative.yearlyGrowthPercent) >= 0 ? "+" : ""}
                      {report.consolidatedComparative.yearlyGrowthPercent}%
                    </span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Dividend History Table */}
      <Card className="bg-white shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-slate-800">Detailed Payout History</h2>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <ListFilter className="w-4 h-4 text-slate-400" />
            <select
              value={filterAccountId}
              onChange={(e) => setFilterAccountId(e.target.value)}
              className="bg-white border border-slate-200 rounded px-3 py-1.5 text-xs font-bold text-slate-600 focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Accounts</option>
              {accounts?.map((acc: any) => (
                <option key={acc.id} value={acc.id.toString()}>{acc.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          {filteredHistory && filteredHistory.length > 0 ? (
            <table className="w-full">
              <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-6 text-slate-600">Ex-Dividend Date</th>
                  <th className="text-left py-3 px-6 text-slate-600">Symbol</th>
                  <th className="text-left py-3 px-6 text-slate-600">Account</th>
                  <th className="text-right py-3 px-6 text-slate-600">Per Share</th>
                  <th className="text-right py-3 px-6 text-slate-600">Qty at Ex-Date</th>
                  <th className="text-right py-3 px-6 text-slate-600">Total Received</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((dividend: any, idx: number) => {
                  const account = accounts?.find((a: any) => a.id === dividend.accountId);
                  return (
                    <tr key={idx} className="border-b border-border hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-6 text-slate-600">
                        {new Date(dividend.exDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })}
                      </td>
                      <td className="py-4 px-6 font-bold text-primary">{dividend.symbol}</td>
                      <td className="py-4 px-6 text-slate-500 text-xs font-medium">{account?.name || "Unknown"}</td>
                      <td className="py-4 px-6 text-right font-mono text-slate-500">
                        {formatCurrency(dividend.dividendPerShare, 4)}
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-slate-500">
                        {formatNumber(dividend.quantityOwned, 3)}
                      </td>
                      <td className="py-4 px-6 text-right font-mono font-bold text-green-600 bg-green-50/30">
                        {formatCurrency(dividend.totalAmount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="py-20 text-center text-slate-400">
              <DollarSign className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm font-medium">No historical dividend distributions found for current selection.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
