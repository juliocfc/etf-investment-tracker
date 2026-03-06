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
  Legend,
  ResponsiveContainer,
} from "recharts";

export default function Performance() {
  const [timePeriod, setTimePeriod] = useState<"1m" | "1y" | "3y">("1y");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);

  // Get portfolios
  const { data: portfolios } = trpc.portfolio.getAll.useQuery();

  // Initialize selected portfolio
  useEffect(() => {
    if (portfolios && portfolios.length > 0 && !selectedPortfolioId) {
      setSelectedPortfolioId(portfolios[0].id);
    }
  }, [portfolios, selectedPortfolioId]);

  // Queries
  const { data: performance } = trpc.etf.calculatePerformance.useQuery(
    selectedPortfolioId ? { portfolioId: selectedPortfolioId, days: timePeriod === "1m" ? 30 : timePeriod === "1y" ? 365 : 1095 } : { portfolioId: 0, days: 365 },
    { enabled: selectedPortfolioId !== null }
  );

  const { data: balanceHistory } = trpc.etf.getBalanceHistory.useQuery(
    selectedPortfolioId ? { portfolioId: selectedPortfolioId, days: timePeriod === "1m" ? 30 : timePeriod === "1y" ? 365 : 1095 } : { portfolioId: 0, days: 365 },
    { enabled: selectedPortfolioId !== null }
  );

  const { data: holdings } = trpc.etf.getHoldings.useQuery(
    selectedPortfolioId ? { portfolioId: selectedPortfolioId } : { portfolioId: 0 },
    { enabled: selectedPortfolioId !== null }
  );

  // Prepare balance history data for chart
  const balanceChartData = balanceHistory?.map((item) => ({
    date: new Date(item.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    totalValue: parseFloat(item.totalValue.toString()),
    investmentValue: parseFloat(item.investmentValue.toString()),
    cashValue: parseFloat(item.cashValue.toString()),
  })) || [];

  // Prepare price history data for each holding
  const [selectedSymbol, setSelectedSymbol] = useState<string>(
    holdings?.[0]?.symbol || ""
  );

  useEffect(() => {
    if (holdings && holdings.length > 0 && !selectedSymbol) {
      setSelectedSymbol(holdings[0].symbol);
    }
  }, [holdings, selectedSymbol]);

  const { data: priceHistory } = trpc.etf.getPriceHistory.useQuery({
    symbol: selectedSymbol,
    days: timePeriod === "1m" ? 30 : timePeriod === "1y" ? 365 : 1095,
  });

  const priceChartData = priceHistory?.map((item) => ({
    date: new Date(item.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    price: parseFloat(item.price.toString()),
  })) || [];

  if (!selectedPortfolioId || !portfolios) {
    return (
      <div className="space-y-6 p-6">
        <div className="text-center text-gray-400">Loading portfolios...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Portfolio Selector */}
      <div className="flex items-center gap-4 mb-6">
        <label className="text-sm text-gray-400">Select Portfolio:</label>
        <select
          value={selectedPortfolioId || ""}
          onChange={(e) => setSelectedPortfolioId(parseInt(e.target.value))}
          className="px-4 py-2 bg-black border border-cyan-500/50 rounded text-white"
        >
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="data-card">
          <div className="data-card-title">Total Return</div>
          <div className="data-card-value">${performance?.totalReturn || "0.00"}</div>
          <div className="data-card-subtitle">
            {performance?.totalReturnPercent}%
          </div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Daily Return</div>
          <div className="data-card-value">{performance?.dailyReturn || "0"}%</div>
          <div className="data-card-subtitle">Last 24 hours</div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Monthly Return</div>
          <div className="data-card-value">{performance?.monthlyReturn || "0"}%</div>
          <div className="data-card-subtitle">Last 30 days</div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Yearly Return</div>
          <div className="data-card-value">{performance?.yearlyReturn || "0"}%</div>
          <div className="data-card-subtitle">Last 12 months</div>
        </div>
      </div>

      {/* Time Period Selector */}
      <div className="flex gap-2">
        {(["1m", "1y", "3y"] as const).map((period) => (
          <button
            key={period}
            onClick={() => setTimePeriod(period)}
            className={`px-4 py-2 rounded-sm font-bold uppercase text-xs tracking-wider transition-all ${
              timePeriod === period
                ? "btn-neon "
                : "btn-neon-cyan"
            }`}
          >
            {period === "1m" ? "1 Month" : period === "1y" ? "1 Year" : "3 Years"}
          </button>
        ))}
      </div>

      {/* Portfolio Balance Chart */}
      <Card className="hud-panel p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
          Portfolio Balance Over Time
        </h3>
        {balanceChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={balanceChartData}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00d9ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#00d9ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 217, 255, 0.1)" />
              <XAxis dataKey="date" stroke="rgba(0, 217, 255, 0.5)" />
              <YAxis stroke="rgba(0, 217, 255, 0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(20, 20, 40, 0.9)",
                  border: "1px solid rgba(0, 217, 255, 0.3)",
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="totalValue"
                stroke="#00d9ff"
                fillOpacity={1}
                fill="url(#colorTotal)"
                name="Total Value"
              />
              <Area
                type="monotone"
                dataKey="investmentValue"
                stroke="#ff006e"
                fillOpacity={0.1}
                name="Investment Value"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            No data available
          </div>
        )}
      </Card>

      {/* Price Chart */}
      <Card className="hud-panel p-4">
        <div className="mb-4 flex justify-between items-center">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Price History
          </h3>
          {holdings && holdings.length > 0 && (
            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className="bg-input border border-border rounded px-2 py-1 text-sm text-foreground"
            >
              {holdings.map((holding) => (
                <option key={holding.id} value={holding.symbol}>
                  {holding.symbol}
                </option>
              ))}
            </select>
          )}
        </div>

        {priceChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={priceChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 217, 255, 0.1)" />
              <XAxis dataKey="date" stroke="rgba(0, 217, 255, 0.5)" />
              <YAxis stroke="rgba(0, 217, 255, 0.5)" />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(20, 20, 40, 0.9)",
                  border: "1px solid rgba(0, 217, 255, 0.3)",
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#00d9ff"
                dot={false}
                strokeWidth={2}
                name="Price"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            No price data available for {selectedSymbol}
          </div>
        )}
      </Card>
    </div>
  );
}
