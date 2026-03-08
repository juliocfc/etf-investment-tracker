import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { DollarSign, Calendar, ListFilter, Trophy, RefreshCw, Briefcase, TrendingUp } from "lucide-react";

export default function Dividends() {
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);

  // Get portfolios
  const { data: portfolios } = trpc.portfolio.getAll.useQuery();

  // Initialize selected portfolio
  useEffect(() => {
    if (portfolios && portfolios.length > 0 && !selectedPortfolioId) {
      setSelectedPortfolioId(portfolios[0].id);
    }
  }, [portfolios, selectedPortfolioId]);

  const { data: report, isLoading } = trpc.etf.getDetailedDividendReport.useQuery(
    { portfolioId: selectedPortfolioId || 0 },
    { enabled: selectedPortfolioId !== null }
  );

  const [filterSymbol, setFilterSymbol] = useState<string>("ALL");
  const [allTimeFilterSymbol, setAllTimeFilterSymbol] = useState<string>("ALL");
  const [monthlyFilterSymbol, setMonthlyFilterSymbol] = useState<string>("ALL");

  if (!portfolios) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <RefreshCw className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Compiling Dividend History...</p>
      </div>
    );
  }

  const filteredHistory = filterSymbol === "ALL" 
    ? report?.history 
    : report?.history.filter(h => h.symbol === filterSymbol);

  const displayAllTimeTotal = allTimeFilterSymbol === "ALL"
    ? report?.totalAllTime
    : report?.etfBreakdown.find(e => e.symbol === allTimeFilterSymbol)?.totalAllTime || "0.00";

  const displayMonthlyAverage = monthlyFilterSymbol === "ALL"
    ? (parseFloat(report?.totalLastYear || "0") / 12).toFixed(2)
    : (parseFloat(report?.etfBreakdown.find(e => e.symbol === monthlyFilterSymbol)?.totalLastYear || "0") / 12).toFixed(2);

  return (
    <div className="space-y-8">
      {/* Portfolio Selector */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-lg shadow-sm border border-border">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-slate-100 rounded-lg">
            <Briefcase className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block mb-1">Select Portfolio</label>
            <select
              value={selectedPortfolioId || ""}
              onChange={(e) => setSelectedPortfolioId(parseInt(e.target.value))}
              className="min-w-[200px] px-3 py-1.5 bg-transparent border-b-2 border-slate-200 focus:border-primary focus:outline-none font-semibold text-slate-800 transition-colors"
            >
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
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
                ${displayAllTimeTotal}
              </div>
            </div>
            <div className="p-2 bg-yellow-50 rounded-lg">
              <Trophy className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
          <select
            value={allTimeFilterSymbol}
            onChange={(e) => setAllTimeFilterSymbol(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] font-bold text-slate-600 focus:outline-none"
          >
            <option value="ALL">Entire Portfolio</option>
            {report?.etfBreakdown.map(etf => (
              <option key={etf.symbol} value={etf.symbol}>{etf.symbol}</option>
            ))}
          </select>
        </Card>

        {/* Monthly Average Panel */}
        <Card className="p-6 bg-white shadow-sm border border-border border-t-4 border-t-green-600">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Monthly Avg (L12M)</div>
              <div className="text-3xl font-bold text-slate-800 font-mono">
                ${displayMonthlyAverage}
              </div>
            </div>
            <div className="p-2 bg-green-50 rounded-lg">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <select
            value={monthlyFilterSymbol}
            onChange={(e) => setMonthlyFilterSymbol(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] font-bold text-slate-600 focus:outline-none"
          >
            <option value="ALL">Entire Portfolio</option>
            {report?.etfBreakdown.map(etf => (
              <option key={etf.symbol} value={etf.symbol}>{etf.symbol}</option>
            ))}
          </select>
        </Card>

        {/* Last Year Panel */}
        <Card className="p-6 bg-white shadow-sm border border-border border-t-4 border-t-primary">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Total (Last 12M)</div>
              <div className="text-3xl font-bold text-slate-800 font-mono">${report?.totalLastYear}</div>
            </div>
            <div className="p-2 bg-slate-50 rounded-lg">
              <Calendar className="w-5 h-5 text-slate-600" />
            </div>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {report?.quarterlyBreakdown.map((q) => (
              <div key={q.quarter} className="text-center p-1 bg-slate-50 rounded border border-slate-100">
                <div className="text-[8px] font-bold text-slate-400 uppercase truncate">{q.quarter.split(' ')[1]}</div>
                <div className="text-[10px] font-bold text-slate-700">${parseFloat(q.amount).toFixed(0)}</div>
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
            {report?.etfBreakdown.map((etf) => (
              <div key={etf.symbol} className="flex justify-between items-center pb-1 border-b border-slate-100 last:border-0">
                <div className="font-bold text-slate-700 text-[10px]">{etf.symbol}</div>
                <div className="font-mono text-green-600 text-[10px] font-bold">${etf.totalLastYear}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Dividend History Table */}
      <Card className="bg-white shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold text-slate-800">Detailed Payout History</h2>
          </div>
          
          <div className="flex items-center gap-3">
            <ListFilter className="w-4 h-4 text-slate-400" />
            <select
              value={filterSymbol}
              onChange={(e) => setFilterSymbol(e.target.value)}
              className="bg-white border border-slate-200 rounded px-3 py-1.5 text-xs font-bold text-slate-600 focus:outline-none focus:border-primary"
            >
              <option value="ALL">All Asset Symbols</option>
              {report?.etfBreakdown.map(etf => (
                <option key={etf.symbol} value={etf.symbol}>{etf.symbol}</option>
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
                  <th className="text-right py-3 px-6 text-slate-600">Per Share</th>
                  <th className="text-right py-3 px-6 text-slate-600">Qty at Ex-Date</th>
                  <th className="text-right py-3 px-6 text-slate-600">Total Received</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((dividend, idx) => (
                  <tr key={idx} className="border-b border-border hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-6 text-slate-600">
                      {new Date(dividend.exDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })}
                    </td>
                    <td className="py-4 px-6 font-bold text-primary">{dividend.symbol}</td>
                    <td className="py-4 px-6 text-right font-mono text-slate-500">
                      ${parseFloat(dividend.dividendPerShare.toString()).toFixed(4)}
                    </td>
                    <td className="py-4 px-6 text-right font-mono text-slate-500">
                      {parseFloat(dividend.quantityOwned.toString()).toFixed(3)}
                    </td>
                    <td className="py-4 px-6 text-right font-mono font-bold text-green-600 bg-green-50/30">
                      ${parseFloat(dividend.totalAmount.toString()).toFixed(2)}
                    </td>
                  </tr>
                ))}
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
