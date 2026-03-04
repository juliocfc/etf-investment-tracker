import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Edit2, RefreshCw, ShoppingCart, History } from "lucide-react";
import { toast } from "sonner";

export default function Portfolio() {
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

  // Queries
  const { data: holdings, refetch: refetchHoldings } = trpc.etf.getHoldings.useQuery();
  const { data: summary, refetch: refetchSummary } = trpc.etf.getPortfolioSummary.useQuery();
  const { data: cashBalance } = trpc.etf.getCashBalance.useQuery();

  // ETF name lookup query - enabled only when needed
  const { refetch: refetchETFName } = trpc.etf.lookupETFName.useQuery(
    { symbol: formData.symbol },
    { enabled: false }
  );

  // Mutations
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

  // Auto-fetch prices on page load
  useEffect(() => {
    updatePricesMutation.mutate();
  }, []);

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
    if (!formData.symbol || !formData.name || !formData.quantity || !formData.purchasePrice) {
      toast.error("Please fill in all fields");
      return;
    }

    addHoldingMutation.mutate({
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
    if (!buyData.quantity || !buyData.price) {
      toast.error("Please fill in quantity and price");
      return;
    }

    buyMoreSharesMutation.mutate({
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
    if (!cashAmount) {
      toast.error("Please enter an amount");
      return;
    }

    updateCashMutation.mutate({ amount: cashAmount });
  };

  return (
    <div className="space-y-6 p-6">
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
          <div className="text-xs text-gray-400 mt-1">ETF holdings</div>
        </Card>
        <Card className="p-4 border-2 border-cyan-500/50 bg-black/50">
          <div className="text-xs text-cyan-400 mb-2">CASH BALANCE</div>
          <div className="text-2xl font-bold text-white">${summary?.cashBalance || "0.00"}</div>
          <div className="text-xs text-gray-400 mt-1">Available cash</div>
        </Card>
        <Card className="p-4 border-2 border-cyan-500/50 bg-black/50">
          <div className="text-xs text-cyan-400 mb-2">ALLOCATION</div>
          <div className="text-2xl font-bold text-white">{summary?.holdings?.length || 0}</div>
          <div className="text-xs text-gray-400 mt-1">Holdings count</div>
        </Card>
      </div>

      {/* Cash Balance Section */}
      <Card className="p-6 border-2 border-cyan-500/30 bg-black/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-cyan-400">CASH AVAILABLE</h3>
          {!isEditingCash && (
            <Button
              onClick={() => {
                setIsEditingCash(true);
                setCashAmount(summary?.cashBalance || "");
              }}
              className="bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300"
              size="sm"
            >
              UPDATE
            </Button>
          )}
        </div>
        {isEditingCash ? (
          <div className="flex gap-2">
            <Input
              type="number"
              step="0.001"
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              placeholder="Enter amount"
              className="bg-black/50 border-cyan-500/30 text-white"
            />
            <Button onClick={handleCashUpdate} className="bg-cyan-500 hover:bg-cyan-600 text-black">
              Save
            </Button>
            <Button
              onClick={() => setIsEditingCash(false)}
              className="bg-gray-600 hover:bg-gray-700 text-white"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <div className="text-3xl font-bold text-cyan-300">${summary?.cashBalance || "0.00"}</div>
        )}
      </Card>

      {/* ETF Holdings Section */}
      <Card className="p-6 border-2 border-cyan-500/30 bg-black/30">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-cyan-400">ETF HOLDINGS</h3>
          <div className="flex gap-2">
            <button
              onClick={() => updatePricesMutation.mutate()}
              className="px-4 py-2 border-2 border-cyan-500 text-cyan-400 hover:bg-cyan-500/10 font-mono text-sm"
            >
              Update Prices (Auto)
            </button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-pink-600 hover:bg-pink-700 text-white" onClick={() => setFormData({
                  symbol: "",
                  name: "",
                  quantity: "",
                  purchasePrice: "",
                  purchaseDate: new Date().toISOString().split("T")[0],
                })}>
                  <Plus className="w-4 h-4 mr-2" />
                  ADD ETF
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-black border-2 border-cyan-500/50">
                <DialogHeader>
                  <DialogTitle className="text-cyan-400">ADD NEW ETF</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-cyan-400 text-sm">Symbol</label>
                    <Input
                      value={formData.symbol}
                      onChange={handleSymbolChange}
                      placeholder="e.g., SPY"
                      className="bg-black/50 border-cyan-500/30 text-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-cyan-400 text-sm">
                      Name {isLookingUpName && <span className="text-gray-400">(looking up...)</span>}
                    </label>
                    <Input
                      value={formData.name}
                      onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="ETF Name"
                      className="bg-black/50 border-cyan-500/30 text-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-cyan-400 text-sm">Quantity</label>
                    <Input
                      type="number"
                      step="0.001"
                      value={formData.quantity}
                      onChange={(e) => setFormData((prev) => ({ ...prev, quantity: e.target.value }))}
                      placeholder="0.000"
                      className="bg-black/50 border-cyan-500/30 text-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-cyan-400 text-sm">Purchase Price</label>
                    <Input
                      type="number"
                      step="0.001"
                      value={formData.purchasePrice}
                      onChange={(e) => setFormData((prev) => ({ ...prev, purchasePrice: e.target.value }))}
                      placeholder="0.000"
                      className="bg-black/50 border-cyan-500/30 text-white mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-cyan-400 text-sm">Purchase Date</label>
                    <Input
                      type="date"
                      value={formData.purchaseDate}
                      onChange={(e) => setFormData((prev) => ({ ...prev, purchaseDate: e.target.value }))}
                      className="bg-black/50 border-cyan-500/30 text-white mt-1"
                    />
                  </div>
                  <Button
                    onClick={handleAddHolding}
                    className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-bold"
                  >
                    Add ETF
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Holdings Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cyan-500/30">
                <th className="text-left py-3 px-4 text-cyan-400 font-mono">SYMBOL</th>
                <th className="text-left py-3 px-4 text-cyan-400 font-mono">NAME</th>
                <th className="text-right py-3 px-4 text-cyan-400 font-mono">QUANTITY</th>
                <th className="text-right py-3 px-4 text-cyan-400 font-mono">AVG COST</th>
                <th className="text-right py-3 px-4 text-cyan-400 font-mono">CURRENT PRICE</th>
                <th className="text-right py-3 px-4 text-cyan-400 font-mono">VALUE</th>
                <th className="text-right py-3 px-4 text-cyan-400 font-mono">ALLOCATION %</th>
                <th className="text-right py-3 px-4 text-cyan-400 font-mono">GAIN/LOSS</th>
                <th className="text-center py-3 px-4 text-cyan-400 font-mono">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {summary?.holdings?.map((holding: any) => (
                <tr key={holding.id} className="border-b border-cyan-500/20 hover:bg-cyan-500/5">
                  <td className="py-3 px-4 text-green-400 font-bold">{holding.symbol}</td>
                  <td className="py-3 px-4 text-gray-300">{holding.name}</td>
                  <td className="py-3 px-4 text-right text-white">{parseFloat(holding.quantity).toFixed(3)}</td>
                  <td className="py-3 px-4 text-right text-cyan-300">${parseFloat(holding.averageCost || 0).toFixed(3)}</td>
                  <td className="py-3 px-4 text-right text-white">${holding.currentPrice}</td>
                  <td className="py-3 px-4 text-right text-white">${holding.currentValue}</td>
                  <td className="py-3 px-4 text-right text-cyan-300">
                    {((parseFloat(holding.currentValue) / parseFloat(summary?.investmentValue || "1")) * 100).toFixed(1)}%
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-bold ${
                      parseFloat(holding.gain) >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    ${holding.gain}
                  </td>
                  <td className="py-3 px-4 text-center space-x-2 flex justify-center">
                    <Dialog open={isBuyDialogOpen === holding.id} onOpenChange={(open) => setIsBuyDialogOpen(open ? holding.id : null)}>
                      <DialogTrigger asChild>
                        <button className="p-2 hover:bg-cyan-500/20 rounded">
                          <ShoppingCart className="w-4 h-4 text-cyan-400" />
                        </button>
                      </DialogTrigger>
                      <DialogContent className="bg-black border-2 border-cyan-500/50">
                        <DialogHeader>
                          <DialogTitle className="text-cyan-400">BUY MORE {holding.symbol}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <label className="text-cyan-400 text-sm">Quantity</label>
                            <Input
                              type="number"
                              step="0.001"
                              value={buyData.quantity}
                              onChange={(e) => setBuyData((prev) => ({ ...prev, quantity: e.target.value }))}
                              placeholder="0.000"
                              className="bg-black/50 border-cyan-500/30 text-white mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-cyan-400 text-sm">Purchase Price</label>
                            <Input
                              type="number"
                              step="0.001"
                              value={buyData.price}
                              onChange={(e) => setBuyData((prev) => ({ ...prev, price: e.target.value }))}
                              placeholder="0.000"
                              className="bg-black/50 border-cyan-500/30 text-white mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-cyan-400 text-sm">Purchase Date</label>
                            <Input
                              type="date"
                              value={buyData.purchaseDate}
                              onChange={(e) => setBuyData((prev) => ({ ...prev, purchaseDate: e.target.value }))}
                              className="bg-black/50 border-cyan-500/30 text-white mt-1"
                            />
                          </div>
                          <Button
                            onClick={() => handleBuyMoreShares(holding.id)}
                            className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-bold"
                          >
                            Confirm Purchase
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                    <Dialog open={purchaseHistoryOpen === holding.id} onOpenChange={(open) => setPurchaseHistoryOpen(open ? holding.id : null)}>
                      <DialogTrigger asChild>
                        <button className="p-2 hover:bg-cyan-500/20 rounded">
                          <History className="w-4 h-4 text-cyan-400" />
                        </button>
                      </DialogTrigger>
                      <DialogContent className="bg-black border-2 border-cyan-500/50 max-h-96 overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle className="text-cyan-400">PURCHASE HISTORY - {holding.symbol}</DialogTitle>
                        </DialogHeader>
                        <PurchaseHistoryContent holdingId={holding.id} onDeletePurchase={(purchaseId: number) => handleDeletePurchase(purchaseId, holding.id)} />
                      </DialogContent>
                    </Dialog>
                    <button
                      onClick={() => handleEditHolding(holding)}
                      className="p-2 hover:bg-cyan-500/20 rounded"
                    >
                      <Edit2 className="w-4 h-4 text-cyan-400" />
                    </button>
                    <button
                      onClick={() => handleDeleteHolding(holding.id)}
                      className="p-2 hover:bg-red-500/20 rounded"
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Edit Dialog */}
      {editingId && (
        <Dialog open={!!editingId} onOpenChange={(open) => !open && setEditingId(null)}>
          <DialogContent className="bg-black border-2 border-cyan-500/50">
            <DialogHeader>
              <DialogTitle className="text-cyan-400">EDIT ETF</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-cyan-400 text-sm">Symbol</label>
                <Input
                  value={formData.symbol}
                  onChange={(e) => setFormData((prev) => ({ ...prev, symbol: e.target.value }))}
                  className="bg-black/50 border-cyan-500/30 text-white mt-1"
                />
              </div>
              <div>
                <label className="text-cyan-400 text-sm">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  className="bg-black/50 border-cyan-500/30 text-white mt-1"
                />
              </div>
              <div>
                <label className="text-cyan-400 text-sm">Quantity</label>
                <Input
                  type="number"
                  step="0.001"
                  value={formData.quantity}
                  onChange={(e) => setFormData((prev) => ({ ...prev, quantity: e.target.value }))}
                  className="bg-black/50 border-cyan-500/30 text-white mt-1"
                />
              </div>
              <div>
                <label className="text-cyan-400 text-sm">Purchase Price</label>
                <Input
                  type="number"
                  step="0.001"
                  value={formData.purchasePrice}
                  onChange={(e) => setFormData((prev) => ({ ...prev, purchasePrice: e.target.value }))}
                  className="bg-black/50 border-cyan-500/30 text-white mt-1"
                />
              </div>
              <div>
                <label className="text-cyan-400 text-sm">Purchase Date</label>
                <Input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, purchaseDate: e.target.value }))}
                  className="bg-black/50 border-cyan-500/30 text-white mt-1"
                />
              </div>
              <Button
                onClick={handleUpdateHolding}
                className="w-full bg-cyan-500 hover:bg-cyan-600 text-black font-bold"
              >
                Update ETF
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}


function PurchaseHistoryContent({
  holdingId,
  onDeletePurchase,
}: {
  holdingId: number;
  onDeletePurchase: (purchaseId: number) => void;
}) {
  const { data: purchases } = trpc.etf.getPurchases.useQuery({ holdingId });

  if (!purchases || purchases.length === 0) {
    return <div className="text-gray-400 text-center py-4">No purchases found</div>;
  }

  return (
    <div className="space-y-3">
      {purchases.map((purchase) => (
        <div
          key={purchase.id}
          className="flex justify-between items-center p-3 bg-cyan-500/10 border border-cyan-500/30 rounded"
        >
          <div className="flex-1">
            <div className="text-cyan-400 text-sm">
              {new Date(purchase.purchaseDate).toLocaleDateString()}
            </div>
            <div className="text-white text-sm">
              {parseFloat(purchase.quantity.toString()).toFixed(3)} shares @ ${parseFloat(purchase.price.toString()).toFixed(3)}
            </div>
          </div>
          <button
            onClick={() => onDeletePurchase(purchase.id)}
            className="p-2 hover:bg-red-500/20 rounded ml-2"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      ))}
    </div>
  );
}
