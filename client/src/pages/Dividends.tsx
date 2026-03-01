import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

export default function Dividends() {
  const { data: holdings } = trpc.etf.getHoldings.useQuery();
  const { data: totalDividends } = trpc.etf.calculateTotalDividends.useQuery();
  const [selectedSymbol, setSelectedSymbol] = useState<string>(
    holdings?.[0]?.symbol || ""
  );

  const { data: dividendHistory } = trpc.etf.getDividendHistory.useQuery({
    symbol: selectedSymbol,
  });

  return (
    <div className="space-y-6">
      {/* Total Dividends Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="data-card">
          <div className="data-card-title">Total Earned</div>
          <div className="data-card-value">${totalDividends || "0.00"}</div>
          <div className="data-card-subtitle">All dividends received</div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Holdings Count</div>
          <div className="data-card-value">{holdings?.length || 0}</div>
          <div className="data-card-subtitle">ETFs with dividends</div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Avg Per Holding</div>
          <div className="data-card-value">
            $
            {holdings && holdings.length > 0
              ? (parseFloat(totalDividends || "0") / holdings.length).toFixed(2)
              : "0.00"}
          </div>
          <div className="data-card-subtitle">Average dividend</div>
        </div>
      </div>

      {/* Dividend History */}
      <Card className="hud-panel p-4">
        <div className="mb-4 flex justify-between items-center">
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Dividend History
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

        {dividendHistory && dividendHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-muted-foreground font-bold uppercase text-xs">
                    Ex-Date
                  </th>
                  <th className="text-right p-3 text-muted-foreground font-bold uppercase text-xs">
                    Per Share
                  </th>
                  <th className="text-right p-3 text-muted-foreground font-bold uppercase text-xs">
                    Total Amount
                  </th>
                  <th className="text-right p-3 text-muted-foreground font-bold uppercase text-xs">
                    Payment Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {dividendHistory.map((dividend, idx) => (
                  <tr key={idx} className="border-b border-border/50 hover:bg-card/50">
                    <td className="p-3">
                      {new Date(dividend.exDate).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-right ">
                      ${dividend.dividendPerShare.toString()}
                    </td>
                    <td className="p-3 text-right font-bold text-green-400">
                      ${dividend.totalDividend?.toString() || "N/A"}
                    </td>
                    <td className="p-3 text-right text-muted-foreground">
                      {dividend.paymentDate
                        ? new Date(dividend.paymentDate).toLocaleDateString()
                        : "Pending"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <DollarSign className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No dividend history available for {selectedSymbol}</p>
          </div>
        )}
      </Card>

      {/* Dividend Breakdown by ETF */}
      <Card className="hud-panel p-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
          Dividends by ETF
        </h3>

        <div className="space-y-3">
          {holdings && holdings.length > 0 ? (
            holdings.map((holding) => (
              <div
                key={holding.id}
                className="flex justify-between items-center p-3 bg-card/50 rounded border border-border/50"
              >
                <div>
                  <div className="font-bold ">{holding.symbol}</div>
                  <div className="text-xs text-muted-foreground">{holding.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-green-400">
                    ${(parseFloat(holding.quantity.toString()) * (parseFloat(holding.currentPrice?.toString() || "0"))).toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {holding.quantity.toString()} shares
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No holdings yet
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
