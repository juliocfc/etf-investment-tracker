import React, { useState } from "react";
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

  // Queries
  const { data: holdings, refetch: refetchHoldings } = trpc.etf.getHoldings.useQuery();
  const { data: summary } = trpc.etf.getPortfolioSummary.useQuery();
  const { data: cashBalance } = trpc.etf.getCashBalance.useQuery();

  // Mutations
  const addHoldingMutation = trpc.etf.addHolding.useMutation({
    onSuccess: () => {
      toast.success("ETF added successfully!");
      refetchHoldings();
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
    },
    onError: () => {
      toast.error("Failed to delete ETF");
    },
  });

  const updatePricesMutation = trpc.etf.updatePrices.useMutation({
    onSuccess: () => {
      toast.success("Prices updated!");
      refetchHoldings();
    },
    onError: () => {
      toast.error("Failed to update prices");
    },
  });

  const updateCashMutation = trpc.etf.updateCashBalance.useMutation({
    onSuccess: () => {
      toast.success("Cash balance updated!");
      setIsEditingCash(false);
      setCashAmount("");
    },
    onError: () => {
      toast.error("Failed to update cash balance");
    },
  });

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
          <div className="data-card-value">${summary?.totalValue || "0.00"}</div>
          <div className="data-card-subtitle">Portfolio worth</div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Investment Value</div>
          <div className="data-card-value">${summary?.investmentValue || "0.00"}</div>
          <div className="data-card-subtitle">ETF holdings</div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Cash Balance</div>
          <div className="data-card-value">${summary?.cashBalance || "0.00"}</div>
          <div className="data-card-subtitle">Available cash</div>
        </div>

        <div className="data-card">
          <div className="data-card-title">Allocation</div>
          <div className="data-card-value">{summary?.allocationBreakdown?.length || 0}</div>
          <div className="data-card-subtitle">Holdings count</div>
        </div>
      </div>

      {/* Cash Balance Management */}
      <Card className="hud-panel p-4">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Cash Available
            </h3>
            <div className="text-2xl font-bold ">
              ${cashBalance || "0.00"}
            </div>
          </div>
          <button
            onClick={() => setIsEditingCash(!isEditingCash)}
            className="btn-neon-cyan"
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
              className="btn-neon"
            >
              Save
            </Button>
          </div>
        )}
      </Card>

      {/* Holdings Section */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold ">ETF Holdings</h2>
          <div className="flex gap-2">
            <Button
              onClick={() => updatePricesMutation.mutate()}
              variant="outline"
              size="sm"
              className="btn-neon-cyan"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Update Prices
            </Button>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button
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
                  className="btn-neon"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add ETF
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-dark-bg border-border">
                <DialogHeader>
                  <DialogTitle className="">
                    {editingId ? "Edit ETF" : "Add New ETF"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Symbol</label>
                    <Input
                      placeholder="e.g., SPY"
                      value={formData.symbol}
                      onChange={(e) =>
                        setFormData({ ...formData, symbol: e.target.value.toUpperCase() })
                      }
                      disabled={!!editingId}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Name</label>
                    <Input
                      placeholder="e.g., S&P 500 ETF"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Quantity</label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        step="0.01"
                        value={formData.quantity}
                        onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">
                        Purchase Price
                      </label>
                      <Input
                        type="number"
                        placeholder="0.00"
                        step="0.01"
                        value={formData.purchasePrice}
                        onChange={(e) =>
                          setFormData({ ...formData, purchasePrice: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">
                      Purchase Date
                    </label>
                    <Input
                      type="date"
                      value={formData.purchaseDate}
                      onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                    />
                  </div>
                  <Button onClick={handleAddOrUpdate} className="w-full btn-neon">
                    {editingId ? "Update" : "Add"} ETF
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
              <tr className="border-b border-border">
                <th className="text-left p-3 text-muted-foreground font-bold uppercase text-xs">
                  Symbol
                </th>
                <th className="text-left p-3 text-muted-foreground font-bold uppercase text-xs">
                  Name
                </th>
                <th className="text-right p-3 text-muted-foreground font-bold uppercase text-xs">
                  Quantity
                </th>
                <th className="text-right p-3 text-muted-foreground font-bold uppercase text-xs">
                  Current Price
                </th>
                <th className="text-right p-3 text-muted-foreground font-bold uppercase text-xs">
                  Value
                </th>
                <th className="text-right p-3 text-muted-foreground font-bold uppercase text-xs">
                  Gain/Loss
                </th>
                <th className="text-center p-3 text-muted-foreground font-bold uppercase text-xs">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {holdings?.map((holding) => (
                <tr key={holding.id} className="border-b border-border/50 hover:bg-card/50">
                  <td className="p-3 font-bold ">{holding.symbol}</td>
                  <td className="p-3 text-sm">{holding.name}</td>
                  <td className="p-3 text-right">{holding.quantity.toString()}</td>
                  <td className="p-3 text-right">${holding.currentPrice?.toString() || "N/A"}</td>
                  <td className="p-3 text-right ">
                    ${(parseFloat(holding.quantity.toString()) * (parseFloat(holding.currentPrice?.toString() || "0"))).toFixed(2)}
                  </td>
                  <td className={`p-3 text-right ${parseFloat(holding.purchasePrice.toString()) < parseFloat(holding.currentPrice?.toString() || "0") ? "text-green-400" : "text-red-400"}`}>
                    ${(parseFloat(holding.currentPrice?.toString() || "0") - parseFloat(holding.purchasePrice.toString())).toFixed(2)}
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
