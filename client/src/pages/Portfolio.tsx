import React, { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Edit2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function Portfolio() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    symbol: "",
    name: "",
    quantity: "",
    purchasePrice: "",
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
    console.log("Portfolio page loaded, auto-fetching prices");
    updatePricesMutation.mutate();
  }, []);



  const updateCashMutation = trpc.etf.updateCashBalance.useMutation({
    onSuccess: () => {
      toast.success("Cash balance updated!");
      setCashAmount("");
      setIsEditingCash(false);
      refetchSummary();
    },
    onError: () => {
      toast.error("Failed to update cash balance");
    },
  });

  // Fetch ETF name using tRPC
  const fetchETFName = useCallback(async (symbol: string) => {
    if (!symbol || symbol.length < 2) return;
    
    setIsLookingUpName(true);
    try {
      const result = await refetchETFName();
      const name = result.data;
      
      if (name && typeof name === 'string' && name.length > 0) {
        setFormData(prev => ({ ...prev, name }));
        toast.success(`Found: ${name}`);
      } else {
        console.log("No name found for symbol:", symbol);
      }
    } catch (error) {
      console.error("Error fetching ETF name:", error);
    } finally {
      setIsLookingUpName(false);
    }
  }, [refetchETFName]);

  // Auto-fetch ETF name when symbol changes (with debouncing)
  useEffect(() => {
    if (lookupTimeout) {
      clearTimeout(lookupTimeout);
    }
    
    if (formData.symbol && formData.symbol.length >= 2 && !formData.name) {
      const timeout = setTimeout(() => {
        fetchETFName(formData.symbol);
      }, 500); // Debounce for 500ms
      
      setLookupTimeout(timeout);
    }
    
    return () => {
      if (lookupTimeout) clearTimeout(lookupTimeout);
    };
  }, [formData.symbol, formData.name, fetchETFName]);

  const handleAddOrUpdate = async () => {
    if (!formData.symbol || !formData.name || !formData.quantity || !formData.purchasePrice) {
      toast.error("Please fill in all fields");
      return;
    }

    if (editingId) {
      updateHoldingMutation.mutate({
        id: editingId,
        symbol: formData.symbol,
        name: formData.name,
        quantity: formData.quantity,
        purchasePrice: formData.purchasePrice,
        purchaseDate: new Date(formData.purchaseDate),
      });
    } else {
      addHoldingMutation.mutate({
        symbol: formData.symbol,
        name: formData.name,
        quantity: formData.quantity,
        purchasePrice: formData.purchasePrice,
        purchaseDate: new Date(formData.purchaseDate),
      });
    }
  };

  const handleEdit = (holding: any) => {
    setFormData({
      symbol: holding.symbol,
      name: holding.name,
      quantity: holding.quantity.toString(),
      purchasePrice: holding.purchasePrice.toString(),
      purchaseDate: new Date(holding.purchaseDate).toISOString().split("T")[0],
    });
    setEditingId(holding.id);
    setIsAddDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="data-card">
          <div className="data-card-title">Total Value</div>
          <div className="data-card-value">${(parseFloat(summary?.totalValue || "0")).toFixed(2)}</div>
          <div className="data-card-subtitle">Portfolio worth</div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Investment Value</div>
          <div className="data-card-value">${(parseFloat(summary?.investmentValue || "0")).toFixed(2)}</div>
          <div className="data-card-subtitle">ETF holdings</div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Cash Balance</div>
          <div className="data-card-value">${(parseFloat(summary?.cashBalance || "0")).toFixed(2)}</div>
          <div className="data-card-subtitle">Available cash</div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Allocation</div>
          <div className="data-card-value">{summary?.allocationBreakdown?.length || 0}</div>
          <div className="data-card-subtitle">Holdings count</div>
        </div>
      </div>

      {/* Cash Balance Management */}
      <Card className="p-4" style={{ background: 'linear-gradient(135deg, rgba(0, 217, 255, 0.05) 0%, rgba(255, 0, 110, 0.05) 100%)', border: '1px solid rgba(0, 217, 255, 0.2)' }}>
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Cash Available
            </h3>
            <div className="text-2xl font-bold" style={{ color: '#00ff00' }}>
              ${(parseFloat(cashBalance || "0")).toFixed(2)}
            </div>
          </div>
          <button
            onClick={() => setIsEditingCash(!isEditingCash)}
            className="px-4 py-2 rounded text-sm font-bold uppercase"
            style={{ color: '#00d9ff', border: '2px solid #00d9ff' }}
          >
            {isEditingCash ? "Cancel" : "Update"}
          </button>
        </div>

        {isEditingCash && (
          <div className="mt-4 flex gap-2">
            <Input
              type="number"
              placeholder="Enter cash amount"
              value={cashAmount}
              onChange={(e) => setCashAmount(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={() => {
                if (cashAmount) {
                  updateCashMutation.mutate({ amount: cashAmount });
                }
              }}
            >
              Save
            </Button>
          </div>
        )}
      </Card>

      {/* ETF Holdings */}
      <Card className="p-4" style={{ background: 'linear-gradient(135deg, rgba(0, 217, 255, 0.05) 0%, rgba(255, 0, 110, 0.05) 100%)', border: '1px solid rgba(0, 217, 255, 0.2)' }}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold" style={{ color: '#00ff00' }}>ETF Holdings</h2>
          <div className="flex gap-2">
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                console.log("Update Prices mousedown, calling mutation");
                updatePricesMutation.mutate();
              }}
              disabled={updatePricesMutation.isPending}
              style={{
                padding: '8px 16px',
                border: '1px solid #00d9ff',
                background: 'transparent',
                color: '#00d9ff',
                cursor: updatePricesMutation.isPending ? 'not-allowed' : 'pointer',
                opacity: updatePricesMutation.isPending ? 0.5 : 1,
                borderRadius: '4px',
                zIndex: 50
              }}
              title="Prices auto-update on page load"
            >
              {updatePricesMutation.isPending ? "Updating..." : "Update Prices (Auto)"}
            </button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <button
                  onClick={() => {
                    setEditingId(null);
                    setFormData({
                      symbol: "",
                      name: "",
                      quantity: "",
                      purchasePrice: "",
                      purchaseDate: new Date().toISOString().split("T")[0],
                    });
                  }}
                  className="px-4 py-2 rounded text-sm font-bold uppercase"
                  style={{ background: '#ff006e', color: '#000' }}
                >
                  <Plus className="w-4 h-4 inline mr-2" /> ADD ETF
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingId ? "Edit ETF" : "Add New ETF"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Symbol</label>
                    <Input
                      placeholder="e.g., SPY"
                      value={formData.symbol}
                      onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Name</label>
                    <Input
                      placeholder="e.g., S&P 500 ETF"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      disabled={isLookingUpName}
                    />
                    {isLookingUpName && <div className="text-xs text-yellow-400 mt-1">🔍 Looking up ETF name...</div>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Quantity</label>
                      <Input
                        type="number"
                        step="0.001"
                        placeholder="e.g., 100.000"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Purchase Price</label>
                      <Input
                        type="number"
                        step="0.001"
                        placeholder="e.g., 150.500"
                        value={formData.purchasePrice}
                        onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Purchase Date</label>
                    <Input
                      type="date"
                      value={formData.purchaseDate}
                      onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    />
                  </div>
                  <Button onClick={handleAddOrUpdate} className="w-full">
                    {editingId ? "Update" : "Add"} ETF
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {holdings && holdings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="p-3 text-left font-bold uppercase text-muted-foreground">Symbol</th>
                  <th className="p-3 text-left font-bold uppercase text-muted-foreground">Name</th>
                  <th className="p-3 text-right font-bold uppercase text-muted-foreground">Quantity</th>
                  <th className="p-3 text-right font-bold uppercase text-muted-foreground">Current Price</th>
                  <th className="p-3 text-right font-bold uppercase text-muted-foreground">Value</th>
                  <th className="p-3 text-right font-bold uppercase text-muted-foreground">Gain/Loss</th>
                  <th className="p-3 text-center font-bold uppercase text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding) => {
                  const quantity = parseFloat(holding.quantity.toString());
                  const currentPrice = parseFloat(holding.currentPrice?.toString() || "0");
                  const purchasePrice = parseFloat(holding.purchasePrice.toString());
                  const value = quantity * currentPrice;
                  const gain = quantity * (currentPrice - purchasePrice);
                  const isGain = gain >= 0;

                  return (
                    <tr key={holding.id} className="border-b border-border/50 hover:bg-card/50">
                      <td className="p-3 font-bold">{holding.symbol}</td>
                      <td className="p-3 text-sm">{holding.name}</td>
                      <td className="p-3 text-right">{quantity.toFixed(3)}</td>
                      <td className="p-3 text-right">${currentPrice.toFixed(3)}</td>
                      <td className="p-3 text-right" style={{ color: '#00ff00' }}>
                        ${value.toFixed(2)}
                      </td>
                      <td className={`p-3 text-right font-bold ${isGain ? "text-green-400" : "text-red-400"}`}>
                        ${gain.toFixed(2)}
                      </td>
                      <td className="p-3 text-center space-x-2">
                        <button
                          onClick={() => handleEdit(holding)}
                          className="p-1 hover:bg-card rounded inline-block"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteHoldingMutation.mutate({ id: holding.id })}
                          className="p-1 hover:bg-card rounded inline-block text-red-400"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No ETF holdings yet. Click "ADD ETF" to get started!
          </div>
        )}
      </Card>
    </div>
  );
}
