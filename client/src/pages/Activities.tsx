import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { List, History, RefreshCw, Calendar, ArrowRightLeft } from "lucide-react";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";

type ActivityRange = "7d" | "1m" | "ytd" | "1y";

export default function Activities({ selectedPortfolioId }: { selectedPortfolioId: number }) {
  const [range, setRange] = useState<ActivityRange>("1m");
  const [viewingPurchases, setViewingPurchases] = useState<any | null>(null);

  const { data: activities, isLoading } = trpc.etf.getInvestmentActivities.useQuery(
    { portfolioId: selectedPortfolioId, range },
    { enabled: !!selectedPortfolioId }
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <RefreshCw className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Auditing Transaction Ledger...</p>
      </div>
    );
  }

  const totalPeriodCost = activities?.reduce((sum, a) => sum + parseFloat(a.totalCost), 0) || 0;
  const totalPeriodValue = activities?.reduce((sum, a) => sum + parseFloat(a.currentValue), 0) || 0;
  const totalPeriodGain = totalPeriodValue - totalPeriodCost;
  const totalPeriodGainPercent = totalPeriodCost > 0 ? (totalPeriodGain / totalPeriodCost) * 100 : 0;

  return (
    <div className="space-y-8">
      {/* Header / Filter Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-lg shadow-sm border border-border">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-slate-100 rounded-lg text-primary">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Investment Activities</h2>
            <p className="text-xs text-slate-500 font-medium">Review purchase volume and performance of recent acquisitions</p>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-md">
          {(["7d", "1m", "ytd", "1y"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-6 py-2 rounded text-xs font-bold uppercase transition-all duration-300 ${
                range === r
                  ? "bg-white text-primary shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {r === "7d" ? "7 Days" : r === "1m" ? "1 Month" : r === "ytd" ? "YTD" : "1 Year"}
            </button>
          ))}
        </div>
      </div>

      {/* Main Activities Table */}
      <Card className="bg-white shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <List className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Accumulation & Performance Summary</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded border border-border uppercase tracking-widest">
            {range === "7d" ? "Last 7 Days" : range === "1m" ? "Last 30 Days" : range === "ytd" ? "Year to Date" : "Last 365 Days"}
          </span>
        </div>
        
        <div className="overflow-x-auto">
          {activities && activities.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  <th className="text-left py-3 px-4 text-slate-600">Investment</th>
                  <th className="text-right py-3 px-4 text-slate-600">Qty Bought</th>
                  <th className="text-right py-3 px-4 text-slate-600">Avg Buy Price</th>
                  <th className="text-right py-3 px-4 text-slate-600">Total Outlay</th>
                  <th className="text-right py-3 px-4 text-slate-600">Mkt Price</th>
                  <th className="text-right py-3 px-4 text-slate-600">Mkt Value</th>
                  <th className="text-right py-3 px-4 text-slate-600">Gain/Loss</th>
                  <th className="text-right py-3 px-4 text-slate-600">Return</th>
                  <th className="text-center py-3 px-4 text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {activities.map((activity) => {
                  const isGain = parseFloat(activity.gain) >= 0;
                  return (
                    <tr key={activity.holdingId} className="border-b border-border hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-4">
                        <div className="font-bold text-primary text-sm">{activity.symbol}</div>
                        <div className="text-slate-500 text-[10px] truncate max-w-[150px]">{activity.name}</div>
                      </td>
                      <td className="text-right py-4 px-4 font-mono text-xs font-medium">
                        {formatNumber(activity.totalQuantity, 3)}
                      </td>
                      <td className="text-right py-4 px-4 font-mono text-xs text-slate-600">
                        {formatCurrency(activity.averagePrice)}
                      </td>
                      <td className="text-right py-4 px-4 font-mono text-xs text-slate-800">
                        {formatCurrency(activity.totalCost)}
                      </td>
                      <td className="text-right py-4 px-4 font-mono text-xs text-slate-600">
                        {formatCurrency(activity.currentPrice)}
                      </td>
                      <td className="text-right py-4 px-4 font-mono text-xs font-bold">
                        {formatCurrency(activity.currentValue)}
                      </td>
                      <td className={`text-right py-4 px-4 font-mono text-xs font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                        {isGain ? "+" : ""}{formatCurrency(activity.gain)}
                      </td>
                      <td className={`text-right py-4 px-4 font-mono text-xs font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                        {isGain ? "+" : ""}{activity.gainPercent}%
                      </td>
                      <td className="text-center py-4 px-4">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-slate-400 hover:text-primary"
                          onClick={() => setViewingPurchases(activity)}
                          title="Audit Trail"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr className="font-bold text-slate-800">
                  <td colSpan={3} className="py-4 px-4 uppercase text-[10px] tracking-widest text-slate-500">Combined Period Performance</td>
                  <td className="text-right py-4 px-4 font-mono text-sm text-slate-600">
                    {formatCurrency(totalPeriodCost)}
                  </td>
                  <td className="text-right py-4 px-4 font-mono text-slate-400">—</td>
                  <td className="text-right py-4 px-4 font-mono text-sm">
                    {formatCurrency(totalPeriodValue)}
                  </td>
                  <td className={`text-right py-4 px-4 font-mono text-sm ${totalPeriodGain >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {totalPeriodGain >= 0 ? "+" : ""}{formatCurrency(totalPeriodGain)}
                  </td>
                  <td className={`text-right py-4 px-4 font-mono text-sm ${totalPeriodGain >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {totalPeriodGain >= 0 ? "+" : ""}{totalPeriodGainPercent.toFixed(2)}%
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          ) : (
            <div className="py-20 text-center text-slate-400">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm font-medium">No purchase activities recorded for this time interval.</p>
            </div>
          )}
        </div>
      </Card>

      {/* Audit Trail Dialog */}
      <Dialog open={!!viewingPurchases} onOpenChange={() => setViewingPurchases(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              {viewingPurchases?.symbol} Purchase Audit Trail
            </DialogTitle>
          </DialogHeader>
          
          <div className="mt-4 space-y-4">
            <div className="bg-slate-50 p-4 rounded-lg border border-border flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Period Accumulation</p>
                <p className="text-xl font-bold text-slate-800 font-mono">{formatNumber(viewingPurchases?.totalQuantity, 3)} Shares</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Period Cost</p>
                <p className="text-xl font-bold text-primary font-mono">{formatCurrency(viewingPurchases?.totalCost)}</p>
              </div>
            </div>

            <div className="overflow-auto max-h-[40vh] custom-scrollbar border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4">Date</th>
                    <th className="text-right py-3 px-4">Qty</th>
                    <th className="text-right py-3 px-4">Unit Price</th>
                    <th className="text-right py-3 px-4">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingPurchases?.purchases.map((p: any, idx: number) => {
                    const qty = parseFloat(p.quantity.toString());
                    const price = parseFloat(p.price.toString());
                    return (
                      <tr key={idx} className="border-b border-border hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-600">{formatDate(p.purchaseDate)}</td>
                        <td className="text-right py-3 px-4 font-mono">{formatNumber(qty, 3)}</td>
                        <td className="text-right py-3 px-4 font-mono text-slate-500">{formatCurrency(price)}</td>
                        <td className="text-right py-3 px-4 font-mono font-bold text-slate-700">{formatCurrency(qty * price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
