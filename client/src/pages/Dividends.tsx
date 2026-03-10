import { formatCurrency, formatNumber } from "@/lib/utils";
import React, { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
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
  const { data: report, isLoading } = trpc.etf.getDetailedDividendReport.useQuery(
    { portfolioId: selectedPortfolioId },
    { enabled: !!selectedPortfolioId }
  );

  const { data: accounts } = trpc.account.getAccounts.useQuery(
    { portfolioId: selectedPortfolioId },
    { enabled: !!selectedPortfolioId }
  );

  const [globalFilterSymbol, setGlobalFilterSymbol] = useState<string>("ALL");
  const [filterAccountId, setFilterAccountId] = useState<string>("ALL");

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
