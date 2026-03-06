import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Edit2, RefreshCw, ShoppingCart, History, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import React, { useEffect, useRef, useState, useMemo } from "react";

export default function Portfolio() {
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<number | null>(null);
  const [isAddPortfolioOpen, setIsAddPortfolioOpen] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBuyDialogOpen, setIsBuyDialogOpen] = useState<number | null>(null);
  const [purchaseHistoryOpen, setPurchaseHistoryOpen] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
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
  const [isLookingUpName, setIsLookingUpName] = useState(false);
  const [lookupTimeout, setLookupTimeout] = useState<NodeJS.Timeout | null>(null);
  const [isCSVImportOpen, setIsCSVImportOpen] = useState<number | null>(null);
  const [csvFile, setCSVFile] = useState<File | null>(null);
  const [csvPreview, setCSVPreview] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<Record<string, any>>({});
  const [loadingMetrics, setLoadingMetrics] = useState<Set<string>>(new Set());

  // Portfolio queries
  const { data: portfolios, refetch: refetchPortfolios } = trpc.portfolio.getAll.useQuery();

  // Initialize selected portfolio
  useEffect(() => {
    if (portfolios && portfolios.length > 0 && !selectedPortfolioId) {
      setSelectedPortfolioId(portfolios[0].id);
    }
  }, [portfolios, selectedPortfolioId]);

  // Queries (only run if portfolio is selected)
  const { data: holdings, refetch: refetchHoldings } = trpc.etf.getHoldings.useQuery(
    selectedPortfolioId ? { portfolioId: selectedPortfolioId } : { portfolioId: 0 },
    { enabled: selectedPortfolioId !== null }
  );
  const { data: summary, refetch: refetchSummary } = trpc.etf.getPortfolioSummary.useQuery(
    selectedPortfolioId ? { portfolioId: selectedPortfolioId } : { portfolioId: 0 },
    { enabled: selectedPortfolioId !== null }
  );
  const { data: cashBalance } = trpc.etf.getCashBalance.useQuery(
    selectedPortfolioId ? { portfolioId: selectedPortfolioId } : { portfolioId: 0 },
    { enabled: selectedPortfolioId !== null }
  );

  // ETF name lookup query - enabled only when needed
  const { refetch: refetchETFName } = trpc.etf.lookupETFName.useQuery(
    { symbol: formData.symbol },
    { enabled: false }
  );

  // Portfolio mutations
  const createPortfolioMutation = trpc.portfolio.create.useMutation({
    onSuccess: () => {
      toast.success("Portfolio created successfully!");
      refetchPortfolios();
      setNewPortfolioName("");
      setIsAddPortfolioOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to create portfolio");
    },
  });

  const deletePortfolioMutation = trpc.portfolio.delete.useMutation({
    onSuccess: () => {
      toast.success("Portfolio deleted successfully!");
      refetchPortfolios();
      setSelectedPortfolioId(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete portfolio");
    },
  });

  // ETF Mutations
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

  const updateHoldingMutation = trpc.etf.updateHolding.useMutation({
    onSuccess: () => {
      toast.success("ETF updated successfully!");
      refetchHoldings();
      refetchSummary();
      setEditingId(null);
      setFormData({
        symbol: "",
        name: "",
        quantity: "",
        purchasePrice: "",
        purchaseDate: new Date().toISOString().split("T")[0],
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update ETF");
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
      toast.error(error.message || "Failed to purchase shares");
    },
  });

  const deletePurchaseMutation = trpc.etf.deletePurchase.useMutation({
    onSuccess: () => {
      toast.success("Purchase deleted successfully!");
      refetchHoldings();
      refetchSummary();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete purchase");
    },
  });

  const updatePricesMutation = trpc.etf.updatePrices.useMutation({
    onSuccess: (data) => {
      console.log("Prices updated successfully:", data);
      toast.success("Prices updated!");
      refetchHoldings();
      refetchSummary();
    },
    onError: (error) => {
      console.error("Error updating prices:", error);
      toast.error(error.message || "Failed to update prices");
    },
  });

  const importCSVMutation = trpc.etf.importPurchasesFromCSV.useMutation({
    onSuccess: (data) => {
      toast.success(`Imported ${data.imported} purchases!`);
      refetchHoldings();
      refetchSummary();
      setIsCSVImportOpen(null);
      setCSVFile(null);
      setCSVPreview([]);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to import CSV");
    },
  });

  // Auto-fetch prices on page load or portfolio change
  useEffect(() => {
    if (selectedPortfolioId) {
      updatePricesMutation.mutate({ portfolioId: selectedPortfolioId });
    }
  }, [selectedPortfolioId]);

  // Fetch performance metrics for each holding
  const utils = trpc.useUtils();
  
  useEffect(() => {
    if (!summary?.holdings || summary.holdings.length === 0) return;

    const fetchMetrics = async () => {
      for (const holding of summary.holdings) {
        if (metrics[holding.symbol]) continue;
        
        try {
          const result = await utils.etf.getPerformanceMetrics.fetch({ symbol: holding.symbol });
          setMetrics(prev => ({
            ...prev,
            [holding.symbol]: result
          }));
        } catch (error) {
          console.error(`Failed to fetch metrics for ${holding.symbol}:`, error);
          setMetrics(prev => ({
            ...prev,
            [holding.symbol]: { ytdReturn: null, oneYearReturn: null, volatility: null }
          }));
        }
      }
    };

    fetchMetrics();
  }, [summary?.holdings, utils]);


  // Handle symbol input change with auto-lookup
  const handleSymbolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newSymbol = e.target.value.toUpperCase();
    setFormData((prev) => ({ ...prev, symbol: newSymbol }));

    if (lookupTimeout) clearTimeout(lookupTimeout);

    if (newSymbol.length > 0) {
      setIsLookingUpName(true);
      const timeout = setTimeout(async () => {
        try {
          const result = await refetchETFName();
          if (result.data) {
            setFormData((prev) => ({ ...prev, name: result.data || "" }));
          }
        } catch (error) {
          console.error("Failed to lookup ETF name:", error);
        } finally {
          setIsLookingUpName(false);
        }
      }, 500);

      setLookupTimeout(timeout);
    }
  };

  const handleAddHolding = async () => {
    if (!selectedPortfolioId) {
      toast.error("Please select a portfolio");
      return;
    }
    if (!formData.symbol || !formData.name || !formData.quantity || !formData.purchasePrice) {
      toast.error("Please fill in all fields");
      return;
    }

    addHoldingMutation.mutate({
      portfolioId: selectedPortfolioId,
      symbol: formData.symbol,
      name: formData.name,
      quantity: formData.quantity,
      purchasePrice: formData.purchasePrice,
      purchaseDate: new Date(formData.purchaseDate),
    });
  };

  const handleUpdateHolding = async () => {
    if (!editingId || !formData.symbol || !formData.quantity || !formData.purchasePrice) {
      toast.error("Please fill in all fields");
      return;
    }

    updateHoldingMutation.mutate({
      id: editingId,
      symbol: formData.symbol,
      name: formData.name,
      quantity: formData.quantity,
      purchasePrice: formData.purchasePrice,
      purchaseDate: new Date(formData.purchaseDate),
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
      purchaseDate: new Date(buyData.purchaseDate),
    });
  };

  const handleEditHolding = (holding: any) => {
    setEditingId(holding.id);
    setFormData({
      symbol: holding.symbol,
      name: holding.name,
      quantity: holding.quantity.toString(),
      purchasePrice: holding.purchasePrice.toString(),
      purchaseDate: new Date(holding.purchaseDate).toISOString().split("T")[0],
    });
  };

  const handleDeleteHolding = (id: number) => {
    if (confirm("Are you sure you want to delete this ETF?")) {
      deleteHoldingMutation.mutate({ id });
    }
  };

  const handleDeletePurchase = (purchaseId: number, holdingId: number) => {
    if (confirm("Are you sure you want to delete this purchase?")) {
      deletePurchaseMutation.mutate({ purchaseId, holdingId });
    }
  };

  const handleCSVImport = (holdingId: number, csvContent: string) => {
    if (!selectedPortfolioId) {
      toast.error("Please select a portfolio");
      return;
    }
    importCSVMutation.mutate({ portfolioId: selectedPortfolioId, holdingId, csvContent });
  };

  const updateCashMutation = trpc.etf.updateCashBalance.useMutation({
    onSuccess: () => {
      toast.success("Cash balance updated!");
      setIsEditingCash(false);
      refetchSummary();
    },
    onError: () => {
      toast.error("Failed to update cash balance");
    },
  });

  const handleCashUpdate = async () => {
    if (!selectedPortfolioId) {
      toast.error("Please select a portfolio");
      return;
    }
    if (!cashAmount) {
      toast.error("Please enter an amount");
      return;
    }

    updateCashMutation.mutate({ portfolioId: selectedPortfolioId, amount: cashAmount });
  };

  const handleCreatePortfolio = () => {
    if (!newPortfolioName.trim()) {
      toast.error("Please enter a portfolio name");
      return;
    }
    createPortfolioMutation.mutate({ name: newPortfolioName });
  };

  const handleDeletePortfolio = (portfolioId: number) => {
    if (confirm("Are you sure you want to delete this portfolio? This action cannot be undone.")) {
      deletePortfolioMutation.mutate({ portfolioId });
    }
  };

  if (!selectedPortfolioId || !portfolios) {
    return (
      <div className="space-y-6 p-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">No Portfolios</h2>
          <p className="text-gray-400 mb-6">Create your first portfolio to get started</p>
          <Dialog open={isAddPortfolioOpen} onOpenChange={setIsAddPortfolioOpen}>
            <DialogTrigger asChild>
              <Button className="bg-cyan-600 hover:bg-cyan-700">
                <FolderPlus className="mr-2 h-4 w-4" />
                Create Portfolio
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Portfolio</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Portfolio name (e.g., Retirement, Education)"
                  value={newPortfolioName}
                  onChange={(e) => setNewPortfolioName(e.target.value)}
                />
                <Button
                  onClick={handleCreatePortfolio}
                  className="w-full bg-cyan-600 hover:bg-cyan-700"
                  disabled={createPortfolioMutation.isPending}
                >
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Portfolio Selector */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex-1">
          <label className="text-sm text-gray-400 block mb-2">Select Portfolio</label>
          <select
            value={selectedPortfolioId || ""}
            onChange={(e) => setSelectedPortfolioId(parseInt(e.target.value))}
            className="w-full px-4 py-2 bg-black border border-cyan-500/50 rounded text-white"
          >
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <Dialog open={isAddPortfolioOpen} onOpenChange={setIsAddPortfolioOpen}>
          <DialogTrigger asChild>
            <Button className="bg-cyan-600 hover:bg-cyan-700 mt-6">
              <FolderPlus className="mr-2 h-4 w-4" />
              New Portfolio
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Portfolio</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Portfolio name (e.g., Retirement, Education)"
                value={newPortfolioName}
                onChange={(e) => setNewPortfolioName(e.target.value)}
              />
              <Button
                onClick={handleCreatePortfolio}
                className="w-full bg-cyan-600 hover:bg-cyan-700"
                disabled={createPortfolioMutation.isPending}
              >
                Create
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {portfolios.length > 1 && (
          <Button
            variant="destructive"
            onClick={() => selectedPortfolioId && handleDeletePortfolio(selectedPortfolioId)}
            className="mt-6"
          >
            Delete Portfolio
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4 border-2 border-cyan-500/50 bg-black/50">
          <div className="text-xs text-cyan-400 mb-2">TOTAL VALUE</div>
          <div className="text-2xl font-bold text-white">${summary?.totalValue || "0.00"}</div>
          <div className="text-xs text-gray-400 mt-1">Portfolio worth</div>
        </Card>
        <Card className="p-4 border-2 border-cyan-500/50 bg-black/50">
          <div className="text-xs text-cyan-400 mb-2">INVESTMENT VALUE</div>
          <div className="text-2xl font-bold text-white">${summary?.investmentValue || "0.00"}</div>
          <div className="text-xs text-gray-400 mt-1">In ETFs</div>
        </Card>
        <Card className="p-4 border-2 border-cyan-500/50 bg-black/50">
          <div className="text-xs text-cyan-400 mb-2">CASH BALANCE</div>
          <div className="text-2xl font-bold text-white">${summary?.cashBalance || "0.00"}</div>
          <div className="text-xs text-gray-400 mt-1">Available cash</div>
        </Card>
        <Card className="p-4 border-2 border-cyan-500/50 bg-black/50">
          <div className="text-xs text-cyan-400 mb-2">HOLDINGS</div>
          <div className="text-2xl font-bold text-white">{holdings?.length || 0}</div>
          <div className="text-xs text-gray-400 mt-1">ETFs owned</div>
        </Card>
      </div>

      {/* Holdings Table */}
      <Card className="p-6 border-2 border-cyan-500/50 bg-black/50">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white">Holdings</h2>
          <div className="flex gap-2">
            <Button
              onClick={() => selectedPortfolioId && updatePricesMutation.mutate({ portfolioId: selectedPortfolioId })}
              disabled={updatePricesMutation.isPending}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Update Prices
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-cyan-600 hover:bg-cyan-700">
                  <Plus className="mr-2 h-4 w-4" />
                  Add ETF
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingId ? "Update ETF" : "Add New ETF"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Symbol (e.g., VOO)"
                    value={formData.symbol}
                    onChange={handleSymbolChange}
                    disabled={isLookingUpName}
                  />
                  <Input
                    placeholder="Name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                  <Input
                    placeholder="Quantity"
                    type="number"
                    step="0.001"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  />
                  <Input
                    placeholder="Purchase Price"
                    type="number"
                    step="0.01"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                  />
                  <Input
                    type="date"
                    value={formData.purchaseDate}
                    onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                  />
                  <Button
                    onClick={editingId ? handleUpdateHolding : handleAddHolding}
                    className="w-full bg-cyan-600 hover:bg-cyan-700"
                    disabled={addHoldingMutation.isPending || updateHoldingMutation.isPending}
                  >
                    {editingId ? "Update" : "Add"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cyan-500/30">
                <th className="text-left py-3 px-4 text-cyan-400">Symbol</th>
                <th className="text-left py-3 px-4 text-cyan-400">Name</th>
                <th className="text-right py-3 px-4 text-cyan-400">Quantity</th>
                <th className="text-right py-3 px-4 text-cyan-400">Avg Cost</th>
                <th className="text-right py-3 px-4 text-cyan-400">Current Price</th>
                <th className="text-right py-3 px-4 text-cyan-400">Value</th>
                <th className="text-right py-3 px-4 text-cyan-400">Gain/Loss</th>
                <th className="text-right py-3 px-4 text-cyan-400">YTD Return</th>
                <th className="text-right py-3 px-4 text-cyan-400">1Y Return</th>
                <th className="text-right py-3 px-4 text-cyan-400">Volatility</th>
                <th className="text-center py-3 px-4 text-cyan-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {summary?.holdings?.map((holding: any) => {
                const metric = metrics[holding.symbol];
                return (
                  <tr key={holding.id} className="border-b border-cyan-500/10 hover:bg-cyan-500/5">
                    <td className="py-3 px-4 font-mono text-cyan-300">{holding.symbol}</td>
                    <td className="py-3 px-4">{holding.name}</td>
                    <td className="text-right py-3 px-4 font-mono">{parseFloat(holding.quantity).toFixed(3)}</td>
                    <td className="text-right py-3 px-4 font-mono">${holding.averageCost?.toFixed(2) || "0.00"}</td>
                    <td className="text-right py-3 px-4 font-mono">${parseFloat(holding.currentPrice || 0).toFixed(2)}</td>
                    <td className="text-right py-3 px-4 font-mono">${holding.currentValue}</td>
                    <td className={`text-right py-3 px-4 font-mono ${parseFloat(holding.gain) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      ${holding.gain} ({holding.gainPercent}%)
                    </td>
                    <td className={`text-right py-3 px-4 font-mono ${metric?.ytdReturn && parseFloat(metric.ytdReturn) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {metric?.ytdReturn ? `${parseFloat(metric.ytdReturn).toFixed(2)}%` : "—"}
                    </td>
                    <td className={`text-right py-3 px-4 font-mono ${metric?.oneYearReturn && parseFloat(metric.oneYearReturn) >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {metric?.oneYearReturn ? `${parseFloat(metric.oneYearReturn).toFixed(2)}%` : "—"}
                    </td>
                    <td className="text-right py-3 px-4 font-mono text-yellow-400">
                      {metric?.volatility ? `${parseFloat(metric.volatility).toFixed(2)}%` : "—"}
                    </td>
                    <td className="text-center py-3 px-4 space-x-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditHolding(holding)}
                        className="text-cyan-400 hover:text-cyan-300"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setIsBuyDialogOpen(holding.id)}
                        className="text-cyan-400 hover:text-cyan-300"
                      >
                        <ShoppingCart className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setPurchaseHistoryOpen(holding.id)}
                        className="text-cyan-400 hover:text-cyan-300"
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteHolding(holding.id)}
                        className="text-red-400 hover:text-red-300"
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
      </Card>

      {/* Portfolio Allocation Pie Chart */}
      {summary && (
        <Card className="p-6 border-2 border-cyan-500/50 bg-black/50">
          <h2 className="text-xl font-bold text-white mb-6">Portfolio Allocation</h2>
          <div className="flex gap-8">
            <PortfolioAllocationChart data={summary.allocationBreakdown} cashPercent={summary.cashAllocationPercent} />
            <div className="flex-1">
              <div className="space-y-2">
                {summary.allocationBreakdown.map((item: any) => (
                  <div key={item.symbol} className="flex justify-between text-sm">
                    <span className="text-gray-300">{item.symbol}</span>
                    <span className="text-cyan-400 font-mono">{item.percentage}%</span>
                  </div>
                ))}
                <div className="border-t border-cyan-500/30 pt-2 mt-2 flex justify-between text-sm">
                  <span className="text-gray-300">Cash</span>
                  <span className="text-cyan-400 font-mono">{summary.cashAllocationPercent}%</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Cash Balance Section */}
      <Card className="p-6 border-2 border-cyan-500/50 bg-black/50">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-white mb-2">Cash Balance</h3>
            <p className="text-2xl font-bold text-cyan-400">${summary?.cashBalance || "0.00"}</p>
          </div>
          {!isEditingCash ? (
            <Button onClick={() => setIsEditingCash(true)} className="bg-cyan-600 hover:bg-cyan-700">
              Edit
            </Button>
          ) : (
            <div className="flex gap-2">
              <Input
                type="number"
                step="0.01"
                value={cashAmount}
                onChange={(e) => setCashAmount(e.target.value)}
                placeholder="Enter amount"
                className="w-32"
              />
              <Button onClick={handleCashUpdate} className="bg-cyan-600 hover:bg-cyan-700">
                Save
              </Button>
              <Button onClick={() => setIsEditingCash(false)} variant="outline">
                Cancel
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Buy More Shares Dialog */}
      {isBuyDialogOpen && (
        <Dialog open={!!isBuyDialogOpen} onOpenChange={() => setIsBuyDialogOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Buy More Shares</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Quantity"
                type="number"
                step="0.001"
                value={buyData.quantity}
                onChange={(e) => setBuyData({ ...buyData, quantity: e.target.value })}
              />
              <Input
                placeholder="Price per share"
                type="number"
                step="0.01"
                value={buyData.price}
                onChange={(e) => setBuyData({ ...buyData, price: e.target.value })}
              />
              <Input
                type="date"
                value={buyData.purchaseDate}
                onChange={(e) => setBuyData({ ...buyData, purchaseDate: e.target.value })}
              />
              <Button
                onClick={() => handleBuyMoreShares(isBuyDialogOpen)}
                className="w-full bg-cyan-600 hover:bg-cyan-700"
                disabled={buyMoreSharesMutation.isPending}
              >
                Buy
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Purchase History Dialog */}
      {purchaseHistoryOpen && (
        <Dialog open={!!purchaseHistoryOpen} onOpenChange={() => setPurchaseHistoryOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Purchase History</DialogTitle>
            </DialogHeader>
            <PurchaseHistoryTable
              holdingId={purchaseHistoryOpen}
              onDelete={handleDeletePurchase}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* CSV Import Dialog */}
      {isCSVImportOpen && (
        <Dialog open={!!isCSVImportOpen} onOpenChange={() => setIsCSVImportOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Purchases from CSV</DialogTitle>
            </DialogHeader>
            <CSVImportForm
              holdingId={isCSVImportOpen}
              onImport={handleCSVImport}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PortfolioAllocationChart({ data, cashPercent }: { data: any[], cashPercent: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  const allocationData = [
    ...data.map(item => ({
      name: item.symbol,
      percentage: parseFloat(item.percentage)
    })),
    {
      name: "Cash",
      percentage: parseFloat(cashPercent)
    }
  ];

  const colors = [
    "#06b6d4", "#0891b2", "#06a6d4", "#0891c2", "#0681b2",
    "#0671a2", "#066192", "#065182", "#064172", "#063162"
  ];

  let currentAngle = 0;
  const slices = allocationData.map((item, index) => {
    const sliceAngle = (item.percentage / 100) * 360;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;

    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const radius = 100;

    const x1 = 150 + radius * Math.cos(startRad);
    const y1 = 150 + radius * Math.sin(startRad);
    const x2 = 150 + radius * Math.cos(endRad);
    const y2 = 150 + radius * Math.sin(endRad);

    const largeArc = sliceAngle > 180 ? 1 : 0;
    const path = `M 150 150 L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    return {
      path,
      color: colors[index % colors.length],
      label: item.name,
      percentage: item.percentage.toFixed(1)
    };
  });

  return (
    <svg ref={svgRef} width="300" height="300" viewBox="0 0 300 300" className="flex-shrink-0">
      {slices.map((slice, index) => (
        <g key={index}>
          <path d={slice.path} fill={slice.color} stroke="#000" strokeWidth="1" />
        </g>
      ))}
    </svg>
  );
}

function PurchaseHistoryTable({ holdingId, onDelete }: { holdingId: number, onDelete: (id: number, holdingId: number) => void }) {
  const { data: purchases } = trpc.etf.getPurchases.useQuery({ holdingId });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cyan-500/30">
            <th className="text-left py-2 px-4">Date</th>
            <th className="text-right py-2 px-4">Quantity</th>
            <th className="text-right py-2 px-4">Price</th>
            <th className="text-center py-2 px-4">Action</th>
          </tr>
        </thead>
        <tbody>
          {purchases?.map((purchase: any) => (
            <tr key={purchase.id} className="border-b border-cyan-500/10">
              <td className="py-2 px-4">{new Date(purchase.purchaseDate).toLocaleDateString()}</td>
              <td className="text-right py-2 px-4">{parseFloat(purchase.quantity).toFixed(3)}</td>
              <td className="text-right py-2 px-4">${parseFloat(purchase.price).toFixed(2)}</td>
              <td className="text-center py-2 px-4">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onDelete(purchase.id, holdingId)}
                  className="text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CSVImportForm({ holdingId, onImport }: { holdingId: number, onImport: (holdingId: number, csv: string) => void }) {
  const [csvContent, setCSVContent] = useState("");

  return (
    <div className="space-y-4">
      <textarea
        placeholder="Paste CSV content here (Date, Quantity, Cost)"
        value={csvContent}
        onChange={(e) => setCSVContent(e.target.value)}
        className="w-full h-32 p-2 bg-black border border-cyan-500/50 rounded text-white"
      />
      <Button
        onClick={() => onImport(holdingId, csvContent)}
        className="w-full bg-cyan-600 hover:bg-cyan-700"
      >
        Import
      </Button>
    </div>
  );
}
