import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function History() {
  const [timePeriod, setTimePeriod] = useState<"1m" | "1y" | "3y">("1y");

  const { data: balanceHistory } = trpc.etf.getBalanceHistory.useQuery({
    days: timePeriod === "1m" ? 30 : timePeriod === "1y" ? 365 : 1095,
  });

  // Prepare data for chart
  const chartData = balanceHistory?.map((item) => ({
    date: new Date(item.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
    totalValue: parseFloat(item.totalValue.toString()),
    investmentValue: parseFloat(item.investmentValue.toString()),
    cashValue: parseFloat(item.cashValue.toString()),
  })) || [];

  // Calculate statistics
  const stats = balanceHistory && balanceHistory.length > 0 ? {
    startValue: parseFloat(balanceHistory[0].totalValue.toString()),
    endValue: parseFloat(balanceHistory[balanceHistory.length - 1].totalValue.toString()),
    maxValue: Math.max(...balanceHistory.map(b => parseFloat(b.totalValue.toString()))),
    minValue: Math.min(...balanceHistory.map(b => parseFloat(b.totalValue.toString()))),
  } : null;

  const change = stats ? stats.endValue - stats.startValue : 0;
  const changePercent = stats && stats.startValue > 0 ? ((change / stats.startValue) * 100).toFixed(2) : "0";

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="data-card">
          <div className="data-card-title">Starting Value</div>
          <div className="data-card-value">${stats?.startValue.toFixed(2) || "0.00"}</div>
          <div className="data-card-subtitle">Period start</div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Current Value</div>
          <div className="data-card-value">${stats?.endValue.toFixed(2) || "0.00"}</div>
          <div className="data-card-subtitle">Latest snapshot</div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Highest Value</div>
          <div className="data-card-value">${stats?.maxValue.toFixed(2) || "0.00"}</div>
          <div className="data-card-subtitle">Peak balance</div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Lowest Value</div>
          <div className="data-card-value">${stats?.minValue.toFixed(2) || "0.00"}</div>
          <div className="data-card-subtitle">Lowest point</div>
        </div>
      </div>

      {/* Period Change */}
      <Card className="hud-panel p-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Period Change
            </h3>
            <div className="text-3xl font-bold">
              <span className={change >= 0 ? "text-green-400" : "text-red-400"}>
                {change >= 0 ? "+" : ""}{change.toFixed(2)}
              </span>
              <span className="text-lg ml-2 text-muted-foreground">
                ({changePercent}%)
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground mb-2">Time Period</div>
            <div className="space-x-2">
              {(["1m", "1y", "3y"] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setTimePeriod(period)}
                  className={`px-3 py-1 rounded-sm text-xs font-bold uppercase ${
                    timePeriod === period
                      ? "btn-neon "
                      : "btn-neon-cyan"
                  }`}
                >
                  {period === "1m" ? "1M" : period === "1y" ? "1Y" : "3Y"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Balance History Chart */}
      <Card className="hud-panel p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
          Balance History
        </h3>

        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
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
              <Bar dataKey="totalValue" fill="#00d9ff" name="Total Value" />
              <Bar dataKey="investmentValue" fill="#ff006e" name="Investment Value" />
              <Bar dataKey="cashValue" fill="#a0a0ff" name="Cash Value" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-96 flex items-center justify-center text-muted-foreground">
            No history data available
          </div>
        )}
      </Card>

      {/* Detailed History Table */}
      <Card className="hud-panel p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
          Detailed History
        </h3>

        {balanceHistory && balanceHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-muted-foreground font-bold uppercase text-xs">
                    Date
                  </th>
                  <th className="text-right p-3 text-muted-foreground font-bold uppercase text-xs">
                    Total Value
                  </th>
                  <th className="text-right p-3 text-muted-foreground font-bold uppercase text-xs">
                    Investment
                  </th>
                  <th className="text-right p-3 text-muted-foreground font-bold uppercase text-xs">
                    Cash
                  </th>
                </tr>
              </thead>
              <tbody>
                {balanceHistory.map((item, idx) => (
                  <tr key={idx} className="border-b border-border/50 hover:bg-card/50">
                    <td className="p-3">
                      {new Date(item.date).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-right  font-bold">
                      ${parseFloat(item.totalValue.toString()).toFixed(2)}
                    </td>
                    <td className="p-3 text-right">
                      ${parseFloat(item.investmentValue.toString()).toFixed(2)}
                    </td>
                    <td className="p-3 text-right text-green-400">
                      ${parseFloat(item.cashValue.toString()).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center text-muted-foreground py-8">
            No history data available
          </div>
        )}
      </Card>
    </div>
  );
}
