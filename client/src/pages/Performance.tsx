import { formatCurrency } from "@/lib/utils";
import React, { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, Activity, BarChart3, Database, RefreshCw, ArrowUpRight, ArrowDownRight } from "lucide-react";

type TimeRange = "1m" | "ytd" | "1y" | "5y";

export default function Performance({ selectedPortfolioId }: { selectedPortfolioId: number }) {
  // Independent time range states for each panel
  const [growthRange, setGrowthRange] = useState<TimeRange>("1y");
  const [priceRange, setPriceRange] = useState<TimeRange>("1y");
  const [quantityRange, setQuantityRange] = useState<TimeRange>("1y");

  // Independent asset selectors for each chart
  const [evolutionSymbol, setEvolutionSymbol] = useState<string | "ALL">("ALL");
  const [priceSymbol, setPriceSymbol] = useState<string | null>(null);
  const [quantitySymbol, setQuantitySymbol] = useState<string | null>(null);

  // Reset symbols when portfolio changes
  useEffect(() => {
    setEvolutionSymbol("ALL");
    setPriceSymbol(null);
    setQuantitySymbol(null);
  }, [selectedPortfolioId]);

  const { data: holdings } = trpc.etf.getHoldings.useQuery(
    { portfolioId: selectedPortfolioId },
    { enabled: !!selectedPortfolioId }
  );

  // Initialize independent holding selectors when holdings are loaded
  useEffect(() => {
    if (holdings && holdings.length > 0) {
      if (priceSymbol === null) setPriceSymbol(holdings[0].symbol);
      if (quantitySymbol === null) setQuantitySymbol(holdings[0].symbol);
    }
  }, [holdings, priceSymbol, quantitySymbol]);

  // Queries
  const { data: growthMetrics, isLoading: isLoadingMetrics } = trpc.etf.getPortfolioGrowthMetrics.useQuery(
    { 
      portfolioId: selectedPortfolioId, 
      symbol: evolutionSymbol === "ALL" ? undefined : evolutionSymbol
    },
    { enabled: !!selectedPortfolioId }
  );

  const { data: evolution, isLoading: isLoadingEvolution } = trpc.etf.getPortfolioEvolution.useQuery(
    { 
      portfolioId: selectedPortfolioId, 
      range: growthRange,
      symbol: evolutionSymbol === "ALL" ? undefined : evolutionSymbol
    },
    { enabled: !!selectedPortfolioId }
  );

  const selectedPriceHolding = holdings?.find(h => h.symbol === priceSymbol) || holdings?.[0];
  
  const getDaysForRange = (range: TimeRange) => {
    if (range === "1m") return 30;
    if (range === "ytd") {
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    }
    if (range === "5y") return 365 * 5;
    return 365;
  };

  const { data: priceHistory, isLoading: isLoadingPrice } = trpc.etf.getMarketPriceHistory.useQuery(
    {
      symbol: selectedPriceHolding?.symbol || "",
      days: getDaysForRange(priceRange),
    },
    { enabled: !!selectedPriceHolding }
  );

  const { data: quantityHistory, isLoading: isLoadingQuantity } = trpc.etf.getAssetQuantityHistory.useQuery(
    {
      holdingId: -1,
      symbol: quantitySymbol || "",
      portfolioId: selectedPortfolioId,
      range: quantityRange,
    },
    { enabled: !!quantitySymbol && !!selectedPortfolioId }
  );

  // Format evolution data for chart
  const evolutionChartData = evolution?.map((item) => ({
    date: new Date(item.date + "T12:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: growthRange === "5y" ? "2-digit" : undefined,
    }),
    value: parseFloat(item.value),
    rawDate: item.date,
  })) || [];

  // Format price history data
  const priceChartData = priceHistory?.map((item) => ({
    date: new Date(item.timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: priceRange === "5y" ? "2-digit" : undefined,
    }),
    price: parseFloat(item.price.toString()),
  })) || [];

  // Format quantity history data
  const quantityChartData = quantityHistory?.map((item) => ({
    date: new Date(item.date + "T12:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: quantityRange === "5y" ? "2-digit" : undefined,
    }),
    shares: parseFloat(item.quantity),
  })) || [];

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

  const RangeSelector = ({ value, onChange, className }: { value: TimeRange, onChange: (val: TimeRange) => void, className?: string }) => (
    <div className={`flex bg-slate-100 p-0.5 rounded-md ${className}`}>
      {(["1m", "ytd", "1y", "5y"] as const).map((period) => (
        <button
          key={period}
          onClick={() => onChange(period)}
          className={`px-3 py-1 rounded-sm text-[10px] font-bold uppercase transition-all duration-200 ${
            value === period
              ? "bg-white text-primary shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {period}
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
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Focus:</span>
            <select 
              className="bg-transparent border-none p-0 text-xs font-bold text-slate-600 focus:outline-none h-6 min-w-[140px]"
              value={evolutionSymbol}
              onChange={(e) => setEvolutionSymbol(e.target.value)}
            >
              <option value="ALL">Total Portfolio</option>
              {holdings?.map((h) => (
                <option key={h.symbol} value={h.symbol}>{h.symbol}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Performance Summary Cards */}
      <div className="space-y-6">
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Market Performance (Pure Price Movement)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: "1 Month", value: growthMetrics?.pricePerformance.m1, id: "pp-m1" },
              { label: "YTD", value: growthMetrics?.pricePerformance.ytd, id: "pp-ytd" },
              { label: "1 Year", value: growthMetrics?.pricePerformance.y1, id: "pp-y1" },
              { label: "5 Years", value: growthMetrics?.pricePerformance.y5, id: "pp-pp5" },
            ].map((metric) => {
              const val = parseFloat(metric.value || "0");
              const isPositive = val >= 0;
              return (
                <Card key={metric.id} className="p-4 bg-white shadow-sm border border-border flex flex-col items-center justify-center text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{metric.label}</span>
                  {isLoadingMetrics ? (
                    <div className="h-8 w-16 bg-slate-100 animate-pulse rounded" />
                  ) : (
                    <div className={`text-2xl font-bold font-mono ${isPositive ? "text-green-600" : "text-red-600"}`}>
                      {isPositive ? "+" : ""}{val.toFixed(2)}%
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">Portfolio Growth (Total Value Change)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { label: "1 Month", value: growthMetrics?.marketGrowth.m1, id: "mg-m1" },
              { label: "YTD", value: growthMetrics?.marketGrowth.ytd, id: "mg-ytd" },
              { label: "1 Year", value: growthMetrics?.marketGrowth.y1, id: "mg-y1" },
              { label: "5 Years", value: growthMetrics?.marketGrowth.y5, id: "mg-y5" },
            ].map((metric) => {
              const val = parseFloat(metric.value || "0");
              const isPositive = val >= 0;
              return (
                <Card key={metric.id} className="p-4 bg-white shadow-sm border border-border flex flex-col items-center justify-center text-center border-t-2 border-t-primary/20">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{metric.label}</span>
                  {isLoadingMetrics ? (
                    <div className="h-8 w-16 bg-slate-100 animate-pulse rounded" />
                  ) : (
                    <div className={`text-2xl font-bold font-mono ${isPositive ? "text-green-600" : "text-red-600"}`}>
                      {isPositive ? "+" : ""}{val.toFixed(2)}%
                    </div>
                  )}
                </Card>
              );
            })}
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
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">{growthRange} Change</div>
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
              <AreaChart data={evolutionChartData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#004a99" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#004a99" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    fontSize: "12px",
                  }}
                  itemStyle={{ color: "#004a99", fontWeight: "bold" }}
                  formatter={(value) => [formatCurrency(value as number), "Value"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#004a99"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorValue)"
                  animationDuration={1500}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 italic">
              No historical data available for the selected timeframe.
            </div>
          )}
        </div>
      </Card>

      {/* Grid for Asset Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Price History */}
        <Card className="p-6 bg-white shadow-sm border border-border">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-slate-100 rounded text-slate-600">
                <Activity className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Asset Price History</h2>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={priceSymbol || ""}
                onChange={(e) => setPriceSymbol(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-600 focus:outline-none focus:border-primary"
              >
                {holdings?.map((h) => (
                  <option key={h.symbol} value={h.symbol}>{h.symbol}</option>
                ))}
              </select>
              <RangeSelector value={priceRange} onChange={setPriceRange} />
            </div>
          </div>

          <div className="h-[250px] w-full">
            {isLoadingPrice ? (
              <div className="h-full flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-slate-300" />
              </div>
            ) : priceChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={priceChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#cbd5e1" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    minTickGap={40}
                  />
                  <YAxis 
                    stroke="#cbd5e1" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    tickFormatter={(value) => `$${value}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: "11px",
                    }}
                    formatter={(value) => [formatCurrency(value as number), "Price"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#004a99"
                    strokeWidth={2}
                    dot={false}
                    animationDuration={1000}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                No market data found for this asset.
              </div>
            )}
          </div>
        </Card>

        {/* Quantity History */}
        <Card className="p-6 bg-white shadow-sm border border-border">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-slate-100 rounded text-slate-600">
                <Database className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Position Over Time</h2>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={quantitySymbol || ""}
                onChange={(e) => setQuantitySymbol(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-600 focus:outline-none focus:border-primary"
              >
                {holdings?.map((h) => (
                  <option key={h.symbol} value={h.symbol}>{h.symbol}</option>
                ))}
              </select>
              <RangeSelector value={quantityRange} onChange={setQuantityRange} />
            </div>
          </div>

          <div className="h-[250px] w-full">
            {isLoadingQuantity ? (
              <div className="h-full flex items-center justify-center">
                <RefreshCw className="w-6 h-6 animate-spin text-slate-300" />
              </div>
            ) : quantityChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={quantityChartData}>
                  <defs>
                    <linearGradient id="colorShares" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3d8a3d" stopOpacity={0.1} />
                      <stop offset="95%" stopColor="#3d8a3d" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    stroke="#cbd5e1" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                    minTickGap={40}
                  />
                  <YAxis 
                    stroke="#cbd5e1" 
                    fontSize={10} 
                    tickLine={false} 
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "6px",
                      fontSize: "11px",
                    }}
                    formatter={(value) => [`${value} Shares`, "Shares Owned"]}
                  />
                  <Area
                    type="stepAfter"
                    dataKey="shares"
                    stroke="#3d8a3d"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorShares)"
                    animationDuration={1000}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                No ledger records available.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Bottom Insights */}
      <Card className="p-6 bg-slate-800 text-white shadow-lg border-0 overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-10">
          <TrendingUp className="w-32 h-32" />
        </div>
        <div className="flex items-center gap-2 mb-6 relative z-10">
          <div className="p-1.5 bg-white/10 rounded">
            <BarChart3 className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold uppercase tracking-widest">Market Analysis Insight</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
          <div className="space-y-2">
            <div className="text-[10px] text-white/50 uppercase font-bold tracking-widest">Global Sourcing</div>
            <div className="text-sm font-semibold">Verified Yahoo Finance Market Link</div>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] text-white/50 uppercase font-bold tracking-widest">Calculated Returns</div>
            <div className="text-sm font-semibold">TWR - Time Weighted Return Proxy</div>
          </div>
          <div className="space-y-2">
            <div className="text-[10px] text-white/50 uppercase font-bold tracking-widest">Portfolio Tracking</div>
            <div className="text-sm font-semibold">{holdings?.length || 0} Investments Successfully Indexed</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
