import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, RefreshCw, ShoppingCart, History, FolderPlus, FileUp, Wallet, TrendingUp, Info } from "lucide-react";
import { toast } from "sonner";
import React, { useEffect, useRef, useState, useMemo } from "react";

const CHART_COLORS = ["#004a99", "#3d8a3d", "#f2a900", "#cc0000", "#666666", "#94a3b8", "#38bdf8", "#10b981", "#fbbf24"];

export default function Holdings({ selectedPortfolioId }: { selectedPortfolioId: number }) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBuyDialogOpen, setIsBuyDialogOpen] = useState<number | null>(null);
  const [purchaseHistoryOpen, setPurchaseHistoryOpen] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    symbol: "",
    name: "",
    quantity: "",
    purchasePrice: "",
    purchaseDate: new Date().toISOString().split("T")[0],
  });

  const [buyData, setBuyData] = useState({
    quantity: "",
    price: "",
    purchaseDate: new Date().toISOString().split("T")[0],
  });

  const [cashAmount, setCashAmount] = useState("");
  const [isEditingCash, setIsEditingCash] = useState(false);
  const [isCSVImportOpen, setIsCSVImportOpen] = useState<number | null>(null);
  const lookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const utils = trpc.useUtils();

  // Queries
  const { data: summary, refetch: refetchSummary } = trpc.etf.getPortfolioSummary.useQuery(
    { portfolioId: selectedPortfolioId },
    { enabled: !!selectedPortfolioId }
  );

  const { data: holdings, refetch: refetchHoldings } = trpc.etf.getHoldings.useQuery(
    { portfolioId: selectedPortfolioId },
    { enabled: !!selectedPortfolioId }
  );

  // Mutations
  const updatePricesMutation = trpc.etf.updatePrices.useMutation({
    onSuccess: () => {
      toast.success("Prices updated!");
      refetchHoldings();
      refetchSummary();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update prices");
    },
  });

  const addHoldingMutation = trpc.etf.addHolding.useMutation({
    onSuccess: () => {
      toast.success("ETF added successfully!");
      refetchHoldings();
      refetchSummary();
      setFormData({
        symbol: "",
        name: "",
        quantity: "",
        purchasePrice: "",
        purchaseDate: new Date().toISOString().split("T")[0],
      });
      setIsAddDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add ETF");
    },
  });

  const deleteHoldingMutation = trpc.etf.deleteHolding.useMutation({
    onSuccess: () => {
      toast.success("ETF deleted successfully!");
      refetchHoldings();
      refetchSummary();
    },
    onError: () => {
      toast.error("Failed to delete ETF");
    },
  });

  const buyMoreSharesMutation = trpc.etf.buyMoreShares.useMutation({
    onSuccess: () => {
      toast.success("Shares purchased successfully!");
      refetchHoldings();
      refetchSummary();
      setBuyData({
        quantity: "",
        price: "",
        purchaseDate: new Date().toISOString().split("T")[0],
      });
      setIsBuyDialogOpen(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to buy shares");
    },
  });

  const updateCashMutation = trpc.etf.updateCashBalance.useMutation({
    onSuccess: () => {
      toast.success("Cash balance updated!");
      refetchSummary();
      setIsEditingCash(false);
    },
  });

  const deletePurchaseMutation = trpc.etf.deletePurchase.useMutation({
    onSuccess: () => {
      toast.success("Purchase deleted!");
      refetchHoldings();
      refetchSummary();
    },
  });

  const importCSVMutation = trpc.etf.importPurchasesFromCSV.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Imported ${data.imported} purchases!`);
        if (data.failed > 0) {
          toast.warning(`${data.failed} rows failed to import.`);
        }
        refetchHoldings();
        refetchSummary();
        setIsCSVImportOpen(null);
      } else {
        toast.error("Failed to import CSV");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Import failed");
    },
  });

  // Handlers
  const handleSymbolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const symbol = e.target.value.toUpperCase();
    
    // Update symbol immediately for smooth typing
    setFormData(prev => ({ ...prev, symbol }));

    // Clear existing timeout
    if (lookupTimeoutRef.current) {
      clearTimeout(lookupTimeoutRef.current);
    }

    if (symbol.length >= 2) {
      lookupTimeoutRef.current = setTimeout(async () => {
        try {
          const name = await utils.etf.lookupETFName.fetch({ symbol });
          if (name) {
            // Use functional update to ensure we don't overwrite newer symbol typing
            setFormData(prev => ({ ...prev, name }));
          }
        } catch (error) {
          console.error("Error looking up ETF name:", error);
        }
      }, 500);
    }
  };

  const handleAddHolding = async () => {
    if (!selectedPortfolioId) {
      toast.error("Please select a portfolio");
      return;
    }
    if (!formData.symbol || !formData.quantity || !formData.purchasePrice) {
      toast.error("Please fill in all fields");
      return;
    }

    addHoldingMutation.mutate({
      portfolioId: selectedPortfolioId,
      symbol: formData.symbol,
      name: formData.name,
      quantity: formData.quantity,
      purchasePrice: formData.purchasePrice,
      purchaseDate: new Date(formData.purchaseDate + "T00:00:00"),
    });
  };

  const handleBuyMoreShares = async (holdingId: number) => {
    if (!selectedPortfolioId) {
      toast.error("Please select a portfolio");
      return;
    }
    if (!buyData.quantity || !buyData.price) {
      toast.error("Please fill in quantity and price");
      return;
    }

    buyMoreSharesMutation.mutate({
      portfolioId: selectedPortfolioId,
      holdingId,
      quantity: buyData.quantity,
      price: buyData.price,
      purchaseDate: new Date(buyData.purchaseDate + "T00:00:00"),
    });
  };

  const handleDeleteHolding = (id: number) => {
    if (confirm("Are you sure you want to delete this ETF?")) {
      deleteHoldingMutation.mutate({ id });
    }
  };

  const handleDeletePurchase = (purchaseId: number, holdingId: number) => {
    if (confirm("Are you sure you want to delete this purchase record?")) {
      deletePurchaseMutation.mutate({ purchaseId, holdingId });
    }
  };

  const handleImportCSV = (holdingId: number, csvContent: string) => {
    if (!selectedPortfolioId) return;
    importCSVMutation.mutate({
      portfolioId: selectedPortfolioId,
      holdingId,
      csvContent,
    });
  };

  if (!selectedPortfolioId) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="data-card border-l-4 border-l-primary">
          <div className="data-card-title">Total Portfolio</div>
          <div className="data-card-value">${summary?.totalValue || "0.00"}</div>
          <div className="data-card-subtitle flex items-center gap-1 text-slate-500">
            <Info className="w-3 h-3" /> Includes Cash
          </div>
        </div>

        <div className="data-card border-l-4 border-l-green-600">
          <div className="data-card-title">Investment Value</div>
          <div className="data-card-value">${summary?.investmentValue || "0.00"}</div>
          <div className="data-card-subtitle text-slate-500">Current ETF Market Value</div>
        </div>

        <div className="data-card border-l-4 border-l-slate-400">
          <div className="data-card-title">Cash Reserve</div>
          <div className="data-card-value">${summary?.cashBalance || "0.00"}</div>
          <div className="data-card-subtitle text-slate-500">Available Liquid Funds</div>
        </div>

        <div className="data-card border-l-4 border-l-orange-500">
          <div className="data-card-title">Asset Count</div>
          <div className="data-card-value">{holdings?.length || 0}</div>
          <div className="data-card-subtitle text-slate-500">Diversified Holdings</div>
        </div>
      </div>

      {/* Main Holdings Table */}
      <Card className="bg-white shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Active Holdings
            </h2>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-full uppercase tracking-widest">{summary?.holdings?.length || 0} Assets</span>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => selectedPortfolioId && updatePricesMutation.mutate({ portfolioId: selectedPortfolioId })}
              disabled={updatePricesMutation.isPending}
              className="flex-1 sm:flex-none border-slate-200 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider"
            >
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${updatePricesMutation.isPending ? "animate-spin" : ""}`} />
              Update Prices
            </Button>
            
            <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) {
                setFormData({
                  symbol: "",
                  name: "",
                  quantity: "",
                  purchasePrice: "",
                  purchaseDate: new Date().toISOString().split("T")[0],
                });
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm" className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/10 text-xs font-bold uppercase tracking-wider">
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Add ETF
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Add New ETF Holding</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Symbol</label>
                    <Input placeholder="e.g., VOO" value={formData.symbol} onChange={handleSymbolChange} />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">ETF Name</label>
                    <Input placeholder="Vanguard S&P 500 ETF" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Quantity</label>
                      <Input type="number" step="0.001" value={formData.quantity} onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))} />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Price</label>
                      <Input type="number" step="0.01" value={formData.purchasePrice} onChange={(e) => setFormData(prev => ({ ...prev, purchasePrice: e.target.value }))} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Date</label>
                    <Input type="date" value={formData.purchaseDate} onChange={(e) => setFormData(prev => ({ ...prev, purchaseDate: e.target.value }))} />
                  </div>
                  <Button onClick={handleAddHolding} className="w-full mt-2" disabled={addHoldingMutation.isPending}>
                    Add Asset
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                <th className="text-left py-3 px-6 text-slate-600">Asset</th>
                <th className="text-right py-3 px-6 text-slate-600">Qty</th>
                <th className="text-right py-3 px-6 text-slate-600">Avg Cost</th>
                <th className="text-right py-3 px-6 text-slate-600">Mkt Price</th>
                <th className="text-right py-3 px-6 text-slate-600">Mkt Value</th>
                <th className="text-right py-3 px-6 text-slate-600">Gain/Loss</th>
                <th className="text-right py-3 px-6 text-slate-600">Return</th>
                <th className="text-right py-3 px-6 text-slate-600">Alloc %</th>
                <th className="text-center py-3 px-6 text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {summary?.holdings?.map((holding: any) => {
                const allocation = summary.investmentAllocationBreakdown?.find((a: any) => a.symbol === holding.symbol);
                const isGain = parseFloat(holding.gain) >= 0;
                return (
                  <tr key={holding.id} className="border-b border-border hover:bg-slate-50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-bold text-primary text-base leading-tight">{holding.symbol}</div>
                      <div className="text-slate-500 text-[10px] leading-tight max-w-[180px] truncate">{holding.name}</div>
                    </td>
                    <td className="text-right py-4 px-6 font-mono font-medium">{parseFloat(holding.quantity).toFixed(3)}</td>
                    <td className="text-right py-4 px-6 font-mono text-slate-600">${holding.averageCost?.toFixed(2) || "0.00"}</td>
                    <td className="text-right py-4 px-6 font-mono text-slate-600">${parseFloat(holding.currentPrice || 0).toFixed(2)}</td>
                    <td className="text-right py-4 px-6 font-mono font-bold">${holding.currentValue}</td>
                    <td className={`text-right py-4 px-6 font-mono font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                      {isGain ? "+" : ""}${holding.gain}
                    </td>
                    <td className={`text-right py-4 px-6 font-mono font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                      {isGain ? "+" : ""}{holding.gainPercent}%
                    </td>
                    <td className="text-right py-4 px-6 font-mono text-slate-500 font-medium">
                      {allocation?.percentage || "0.00"}%
                    </td>
                    <td className="text-center py-4 px-6">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="icon" title="Batch Import" onClick={() => setIsCSVImportOpen(holding.id)} className="text-slate-400 hover:text-primary">
                          <FileUp className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Buy" onClick={() => setIsBuyDialogOpen(holding.id)} className="text-slate-400 hover:text-primary">
                          <ShoppingCart className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="History" onClick={() => setPurchaseHistoryOpen(holding.id)} className="text-slate-400 hover:text-primary">
                          <History className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDeleteHolding(holding.id)} className="text-slate-400 hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {summary?.holdings?.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr className="font-bold text-slate-800">
                  <td colSpan={4} className="py-4 px-6 uppercase text-[10px] tracking-widest text-slate-500">Total Portfolio Performance</td>
                  <td className="text-right py-4 px-6 font-mono text-lg">${summary.investmentValue}</td>
                  <td className={`text-right py-4 px-6 font-mono text-lg ${
                    summary.holdings.reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) >= 0 
                      ? "text-green-600" 
                      : "text-red-600"
                  }`}>
                    ${summary.holdings.reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0).toFixed(2)}
                  </td>
                  <td className={`text-right py-4 px-6 font-mono text-lg ${
                    (summary.holdings.reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) / 
                    summary.holdings.reduce((acc: number, h: any) => acc + (parseFloat(h.averageCost || h.purchasePrice) * parseFloat(h.quantity)), 0) * 100) >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}>
                    {(
                      (summary.holdings.reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) / 
                      summary.holdings.reduce((acc: number, h: any) => acc + (parseFloat(h.averageCost || h.purchasePrice) * parseFloat(h.quantity)), 0)) * 100
                    ).toFixed(2)}%
                  </td>
                  <td className="text-right py-4 px-6 font-mono text-slate-500">100%</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Allocation & Management Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Portfolio Allocation Pie Chart */}
        {summary && (
          <Card className="p-6 bg-white shadow-sm border border-border">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-1.5 bg-slate-100 rounded text-slate-600">
                <FolderPlus className="w-4 h-4" />
              </div>
              <h2 className="text-lg font-bold text-slate-800">Portfolio Allocation</h2>
            </div>
            <div className="flex flex-col md:flex-row items-center gap-8">
              <PortfolioAllocationChart data={summary.allocationBreakdown} cashPercent={summary.cashAllocationPercent} />
              <div className="flex-1 w-full">
                <div className="space-y-2">
                  {summary.allocationBreakdown.map((item: any, index: number) => (
                    <div key={item.symbol} className="flex justify-between items-center text-sm p-2 hover:bg-slate-50 rounded transition-colors">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-3 h-3 rounded-full shrink-0" 
                          style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        <span className="font-bold text-primary w-12">{item.symbol}</span>
                        <span className="text-slate-500 text-xs truncate max-w-[150px]">{item.name}</span>
                      </div>
                      <span className="font-mono font-bold text-slate-700">{item.percentage}%</span>
                    </div>
                  ))}
                  <div className="border-t border-slate-100 pt-2 mt-2 flex justify-between items-center text-sm p-2 bg-slate-50 rounded">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full shrink-0 bg-slate-200" />
                      <span className="font-bold text-slate-600">Cash Reserve</span>
                    </div>
                    <span className="font-mono font-bold text-slate-700">{summary.cashAllocationPercent}%</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Cash Balance Section */}
        <Card className="p-6 bg-white shadow-sm border border-border flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-slate-100 rounded text-slate-600">
                <Wallet className="w-4 h-4" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">Cash Reserve Management</h3>
            </div>
            {!isEditingCash && (
              <Button variant="outline" size="sm" onClick={() => {
                setCashAmount(summary?.cashBalance || "0");
                setIsEditingCash(true);
              }} className="text-xs uppercase font-bold border-slate-200">
                Adjust Balance
              </Button>
            )}
          </div>
          
          <div className="flex-1 flex flex-col justify-center bg-slate-50 rounded-lg p-8 border border-slate-100 border-dashed">
            <div className="text-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Current Liquid Assets</p>
              {!isEditingCash ? (
                <p className="text-5xl font-bold text-slate-800 font-mono tracking-tighter">${summary?.cashBalance || "0.00"}</p>
              ) : (
                <div className="flex flex-col gap-4 max-w-xs mx-auto">
                  <Input
                    type="number"
                    step="0.01"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    className="text-center text-2xl h-14 font-mono bg-white"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => updateCashMutation.mutate({ amount: cashAmount, portfolioId: selectedPortfolioId! })} className="flex-1">Save</Button>
                    <Button variant="outline" onClick={() => setIsEditingCash(false)} className="flex-1">Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-6 text-center italic">
            Maintaining a healthy cash reserve allows for strategic entries during market downturns.
          </p>
        </Card>
      </div>

      {/* Dialogs */}
      {isBuyDialogOpen && (
        <Dialog open={!!isBuyDialogOpen} onOpenChange={() => setIsBuyDialogOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Shares</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="grid gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Quantity</label>
                <Input type="number" step="0.001" value={buyData.quantity} onChange={(e) => setBuyData(prev => ({ ...prev, quantity: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Execution Price</label>
                <Input type="number" step="0.01" value={buyData.price} onChange={(e) => setBuyData(prev => ({ ...prev, price: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Date of Purchase</label>
                <Input type="date" value={buyData.purchaseDate} onChange={(e) => setBuyData(prev => ({ ...prev, purchaseDate: e.target.value }))} />
              </div>
              <Button onClick={() => handleBuyMoreShares(isBuyDialogOpen)} className="w-full" disabled={buyMoreSharesMutation.isPending}>
                Execute Order
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {purchaseHistoryOpen && (
        <Dialog open={!!purchaseHistoryOpen} onOpenChange={() => setPurchaseHistoryOpen(null)}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Purchase Audit Trail</DialogTitle>
            </DialogHeader>
            <PurchaseHistoryTable holdingId={purchaseHistoryOpen} onDelete={handleDeletePurchase} />
          </DialogContent>
        </Dialog>
      )}

      {isCSVImportOpen && (
        <Dialog open={!!isCSVImportOpen} onOpenChange={() => setIsCSVImportOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Bulk Data Ingestion</DialogTitle>
            </DialogHeader>
            <CSVImportForm holdingId={isCSVImportOpen} onImport={handleImportCSV} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PortfolioAllocationChart({ data, cashPercent }: { data: any[], cashPercent: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const totalWithCash = parseFloat(cashPercent) + data.reduce((acc, item) => acc + parseFloat(item.percentage), 0);
  
  useEffect(() => {
    if (canvasRef.current && data.length > 0) {
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      const centerX = 100;
      const centerY = 100;
      const radius = 80;
      let startAngle = 0;

      ctx.clearRect(0, 0, 200, 200);

      // Add cash to data for chart
      const chartData = [...data];
      if (parseFloat(cashPercent) > 0) {
        chartData.push({ symbol: "Cash", percentage: cashPercent });
      }

      chartData.forEach((item, index) => {
        const sliceAngle = (parseFloat(item.percentage) / totalWithCash) * 2 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = item.symbol === "Cash" ? "#e2e8f0" : CHART_COLORS[index % CHART_COLORS.length];
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();
        startAngle += sliceAngle;
      });

      // Draw center hole for donut look
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius * 0.6, 0, 2 * Math.PI);
      ctx.fillStyle = "white";
      ctx.fill();
    }
  }, [data, cashPercent]);

  return (
    <div className="flex flex-col items-center">
      <canvas ref={canvasRef} width="200" height="200" className="drop-shadow-sm" />
    </div>
  );
}

function PurchaseHistoryTable({ holdingId, onDelete }: { holdingId: number, onDelete: (id: number, holdingId: number) => void }) {
  const { data: purchases } = trpc.etf.getPurchases.useQuery({ holdingId });

  return (
    <div className="overflow-auto max-h-[60vh] custom-scrollbar border border-border rounded-lg bg-slate-50/30">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4">Date</th>
            <th className="text-right py-3 px-4">Quantity</th>
            <th className="text-right py-3 px-4">Price</th>
            <th className="text-center py-3 px-4">Action</th>
          </tr>
        </thead>
        <tbody>
          {purchases?.map((purchase: any) => {
            const date = new Date(purchase.purchaseDate);
            const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            return (
              <tr key={purchase.id} className="border-b border-border hover:bg-white transition-colors">
                <td className="py-3 px-4 font-mono">{dateStr}</td>
                <td className="text-right py-3 px-4 font-mono">{parseFloat(purchase.quantity).toFixed(3)}</td>
                <td className="text-right py-3 px-4 font-mono font-medium">${parseFloat(purchase.price).toFixed(2)}</td>
                <td className="text-center py-3 px-4">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onDelete(purchase.id, holdingId)}
                    className="text-slate-400 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CSVImportForm({ holdingId, onImport }: { holdingId: number, onImport: (holdingId: number, csv: string) => void }) {
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) {
      toast.error("Please select a file first");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        onImport(holdingId, content);
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read file");
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 pt-4">
      <div className="bg-slate-50 p-4 rounded-lg border border-border">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Info className="w-3 h-3" /> Data Specification
        </h4>
        <div className="text-xs text-slate-600 space-y-2">
          <p>File should include a header: <code>date,quantity,cost</code></p>
          <div className="p-2 bg-white rounded border border-slate-200 font-mono text-[10px]">
            date,quantity,cost<br/>
            Dec-19-2025,10,$27.50
          </div>
        </div>
      </div>
      
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Select Source File</label>
        <div className="flex items-center justify-center w-full">
          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-border border-dashed rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-slate-500">
              <FileUp className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm font-medium">{file ? file.name : "Click to select CSV"}</p>
              <p className="text-[10px] uppercase font-bold opacity-50 mt-1">.csv or .txt files only</p>
            </div>
            <input type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
          </label>
        </div>
      </div>
      
      <Button onClick={handleUpload} className="w-full py-6 text-sm font-bold shadow-lg shadow-primary/10" disabled={!file}>
        Initiate Data Import
      </Button>
    </div>
  );
}
