import React, { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { List, History, RefreshCw, Calendar, ArrowRightLeft, Wallet } from "lucide-react";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Activities({ selectedPortfolioId }: { selectedPortfolioId: number }) {
  const [range, setRange] = useState<string>("30d");
  const [viewingPurchases, setViewingPurchases] = useState<any | null>(null);
  const [filterAccountId, setFilterAccountId] = useState<string>("");

  const rangeOptions = useMemo(() => {
    const options = [
      { label: "Past 10 Days", value: "10d" },
      { label: "Past 30 Days", value: "30d" },
      { label: "Past 60 Days", value: "60d" },
      { label: "Past 90 Days", value: "90d" },
      { label: "Year to Date", value: "ytd" },
      { label: "Past 1 Year", value: "1y" },
    ];

    const prevYear = new Date().getFullYear() - 1;
    for (let q = 4; q >= 1; q--) {
      options.push({
        label: `Q${q} ${prevYear}`,
        value: `${prevYear}Q${q}`,
      });
    }

    return options;
  }, []);

  const currentRangeLabel = useMemo(() => {
    return rangeOptions.find((opt) => opt.value === range)?.label || "Selected Range";
  }, [range, rangeOptions]);

  // Reset filters when portfolio changes
  useEffect(() => {
    setFilterAccountId("");
    setViewingPurchases(null);
  }, [selectedPortfolioId]);

  const { data: activities, isLoading } = trpc.etf.getInvestmentActivities.useQuery(
    { portfolioId: selectedPortfolioId, range },
    { enabled: !!selectedPortfolioId }
  );

  const { data: cashActivities, isLoading: isCashLoading } = trpc.etf.getCashActivities.useQuery(
    { portfolioId: selectedPortfolioId, range },
    { enabled: !!selectedPortfolioId }
  );

  const { data: accounts } = trpc.account.getAccounts.useQuery(
    { portfolioId: selectedPortfolioId },
    { enabled: !!selectedPortfolioId }
  );

  const filteredPurchases = useMemo(() => {
    if (!viewingPurchases) return [];
    let base = viewingPurchases.purchases;
    if (filterAccountId) {
      base = base.filter((p: any) => p.accountId === Number(filterAccountId));
    }
    // Sort by purchaseDate DESC
    return [...base].sort((a, b) => new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime());
  }, [viewingPurchases, filterAccountId]);

  const filteredTotalQuantity = useMemo(() => {
    return filteredPurchases.reduce((sum: number, p: any) => sum + parseFloat(p.quantity.toString()), 0);
  }, [filteredPurchases]);

  const filteredTotalCost = useMemo(() => {
    return filteredPurchases.reduce((sum: number, p: any) => sum + parseFloat(p.quantity.toString()) * parseFloat(p.price.toString()), 0);
  }, [filteredPurchases]);

  if (isLoading || isCashLoading) {
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

        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">Timeframe:</span>
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="w-[180px] h-9 bg-white text-xs font-bold uppercase border-slate-200">
              <SelectValue placeholder="Select range" />
            </SelectTrigger>
            <SelectContent>
              {rangeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs font-bold uppercase">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            {currentRangeLabel}
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
                    <tr key={activity.symbol} className="border-b border-border hover:bg-slate-50 transition-colors">
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
                          title="Purchase History"
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

      {/* Cash Balance History Table */}
      <Card className="bg-white shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Cash Balance History</h3>
          </div>
          <span className="text-[10px] font-bold text-slate-400 bg-white px-2 py-1 rounded border border-border uppercase tracking-widest">
            {currentRangeLabel}
          </span>
        </div>
        
        <div className="overflow-x-auto">
          {cashActivities && cashActivities.length > 0 ? (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-border">
                  <th className="text-left py-3 px-4 text-slate-600">Date</th>
                  <th className="text-left py-3 px-4 text-slate-600">Account</th>
                  <th className="text-right py-3 px-4 text-slate-600">Amount</th>
                </tr>
              </thead>
              <tbody>
                {cashActivities.map((activity: any, idx: number) => {
                  const account = accounts?.find((a: any) => a.id === activity.accountId);
                  return (
                    <tr key={idx} className="border-b border-border hover:bg-slate-50 transition-colors text-sm">
                      <td className="py-4 px-4 font-mono text-slate-600">
                        {formatDate(activity.date)}
                      </td>
                      <td className="py-4 px-4 font-medium text-slate-800">
                        {account?.name || "N/A"}
                      </td>
                      <td className="text-right py-4 px-4 font-mono font-bold text-slate-700">
                        {formatCurrency(activity.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="py-20 text-center text-slate-400">
              <Calendar className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm font-medium">No cash balance history recorded for this time interval.</p>
            </div>
          )}
        </div>
      </Card>

      {/* Purchase History Dialog */}
      <Dialog open={!!viewingPurchases} onOpenChange={() => {
        setViewingPurchases(null);
        setFilterAccountId("");
      }}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              {viewingPurchases?.symbol} Purchase History
            </DialogTitle>
          </DialogHeader>
          
          <div className="mt-4 space-y-4">
            <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-border shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Account Filter:</span>
                <select 
                  className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] font-bold text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary h-7 min-w-[160px]"
                  value={filterAccountId}
                  onChange={(e) => setFilterAccountId(e.target.value)}
                >
                  <option value="">All Accounts</option>
                  {accounts?.map((acc: any) => (
                    <option key={acc.id} value={acc.id}>{acc.name} {acc.number ? `(${acc.number})` : ""}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-border flex justify-between items-center">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Period Accumulation</p>
                <p className="text-xl font-bold text-slate-800 font-mono">{formatNumber(filteredTotalQuantity, 3)} Shares</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Period Cost</p>
                <p className="text-xl font-bold text-primary font-mono">{formatCurrency(filteredTotalCost)}</p>
              </div>
            </div>

            <div className="overflow-auto max-h-[40vh] custom-scrollbar border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4">Date</th>
                    <th className="text-left py-3 px-4">Account</th>
                    <th className="text-right py-3 px-4">Qty</th>
                    <th className="text-right py-3 px-4">Unit Price</th>
                    <th className="text-right py-3 px-4">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPurchases.map((p: any, idx: number) => {
                    const qty = parseFloat(p.quantity.toString());
                    const price = parseFloat(p.price.toString());
                    const account = accounts?.find((a: any) => a.id === p.accountId);
                    return (
                      <tr key={idx} className="border-b border-border hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono text-slate-600">{formatDate(p.purchaseDate)}</td>
                        <td className="py-3 px-4 text-slate-600 font-medium">{account?.name || "N/A"}</td>
                        <td className="text-right py-3 px-4 font-mono">{formatNumber(qty, 3)}</td>
                        <td className="text-right py-3 px-4 font-mono text-slate-500">{formatCurrency(price)}</td>
                        <td className="text-right py-3 px-4 font-mono font-bold text-slate-700">{formatCurrency(qty * price)}</td>
                      </tr>
                    );
                  })}
                  {filteredPurchases.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                        No purchase records found for this selection.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
