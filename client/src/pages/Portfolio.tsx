import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Trash2, RefreshCw, ShoppingCart, History, FolderPlus, FileUp, Wallet, TrendingUp, Info, ArrowUpCircle, CheckCircle2, MoreVertical, CalendarPlus, Download } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import React, { useEffect, useRef, useState, useMemo } from "react";

const CHART_COLORS = ["#004a99", "#3d8a3d", "#f2a900", "#cc0000", "#666666", "#94a3b8", "#38bdf8", "#10b981", "#fbbf24"];

// Helper to get the last trading day (today if weekday, Friday if weekend)
const getLastTradingDay = () => {
  const date = new Date();
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  if (day === 0) { // Sunday -> Move to Friday
    date.setDate(date.getDate() - 2);
  } else if (day === 6) { // Saturday -> Move to Friday
    date.setDate(date.getDate() - 1);
  }
  return formatDate(date);
};

export default function Holdings({ selectedPortfolioId }: { selectedPortfolioId: number }) {
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>(undefined);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBuyDialogOpen, setIsBuyDialogOpen] = useState<{ id: number, symbol: string } | null>(null);
  const [purchaseHistoryOpen, setPurchaseHistoryOpen] = useState<{ id: number, symbol: string } | null>(null);
  const [cashHistoryOpen, setCashHistoryOpen] = useState<{ id: number, name: string } | null>(null);
  const [isAccountsDialogOpen, setIsAccountsDialogOpen] = useState(false);
  const [isAdjustCashDialogOpen, setIsAdjustCashDialogOpen] = useState(false);
  const [isHistoricalCashDialogOpen, setIsHistoricalCashDialogOpen] = useState(false);
  const [adjustCashData, setAdjustCashData] = useState({ 
    accountId: "", 
    amount: "", 
    type: "deposit", 
    description: "", 
    date: formatDate(new Date()) 
  });
  const [historicalCashData, setHistoricalCashData] = useState({ accountId: "", amount: "", date: formatDate(new Date()) });
  
  const defaultDate = useMemo(() => getLastTradingDay(), []);

  const [formData, setFormData] = useState({
    symbol: "",
    name: "",
    quantity: "",
    purchasePrice: "",
    purchaseDate: defaultDate,
    accountId: "",
  });

  const [accountFormData, setAccountFormData] = useState({
    name: "",
    number: "",
  });

  const [buyData, setBuyData] = useState({
    quantity: "",
    price: "",
    purchaseDate: defaultDate,
    accountId: "",
  });

  // Automatically fetch price when Buy dialog opens
  useEffect(() => {
    if (isBuyDialogOpen) {
      fetchAndSetPrice(isBuyDialogOpen.symbol, buyData.purchaseDate, true);
      const holding = holdings?.find(h => h.id === isBuyDialogOpen.id);
      if (holding && (holding as any).accountId) {
        setBuyData(prev => ({ ...prev, accountId: (holding as any).accountId.toString() }));
      }
    }
  }, [isBuyDialogOpen]);

  const [isCSVImportOpen, setIsCSVImportOpen] = useState<{ id: number, symbol: string } | null>(null);
  const lookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  // Queries
  const { data: accounts, refetch: refetchAccounts } = trpc.account.getAccounts.useQuery(
    { portfolioId: selectedPortfolioId },
    { enabled: !!selectedPortfolioId }
  );

  // Reset account selection when portfolio changes
  useEffect(() => {
    setSelectedAccountId(undefined);
  }, [selectedPortfolioId]);

  // Initialize account selectors when accounts are loaded or changed
  useEffect(() => {
    if (accounts && accounts.length > 0) {
      const firstAccountId = accounts[0].id.toString();
      // Always reset to the first account of the current portfolio if the current selection
      // doesn't belong to the new accounts list
      const isAccountValid = (id: string) => accounts.some((acc: any) => acc.id.toString() === id);

      if (!formData.accountId || !isAccountValid(formData.accountId)) {
        setFormData(prev => ({ ...prev, accountId: firstAccountId }));
      }
      if (!buyData.accountId || !isAccountValid(buyData.accountId)) {
        setBuyData(prev => ({ ...prev, accountId: firstAccountId }));
      }
      if (!adjustCashData.accountId || !isAccountValid(adjustCashData.accountId)) {
        setAdjustCashData(prev => ({ ...prev, accountId: firstAccountId }));
      }
      if (!historicalCashData.accountId || !isAccountValid(historicalCashData.accountId)) {
        setHistoricalCashData(prev => ({ ...prev, accountId: firstAccountId }));
      }
    } else {
      // Clear if no accounts
      setFormData(prev => ({ ...prev, accountId: "" }));
      setBuyData(prev => ({ ...prev, accountId: "" }));
      setAdjustCashData(prev => ({ ...prev, accountId: "" }));
      setHistoricalCashData(prev => ({ ...prev, accountId: "" }));
    }
  }, [accounts]);

  const { data: summary, refetch: refetchSummary } = trpc.etf.getPortfolioSummary.useQuery(
    { portfolioId: selectedPortfolioId, accountId: selectedAccountId },
    { enabled: !!selectedPortfolioId }
  );

  const { data: holdings, refetch: refetchHoldings } = trpc.etf.getHoldings.useQuery(
    { portfolioId: selectedPortfolioId, accountId: selectedAccountId },
    { enabled: !!selectedPortfolioId }
  );

  // Mutations
  const addAccountMutation = trpc.account.addAccount.useMutation({
    onSuccess: () => {
      toast.success("Account added successfully!");
      refetchAccounts();
      setAccountFormData({ name: "", number: "" });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add account");
    },
  });

  const deleteAccountMutation = trpc.account.deleteAccount.useMutation({
    onSuccess: () => {
      toast.success("Account deleted!");
      refetchAccounts();
      if (selectedAccountId) {
        // Clear selection if current account was deleted
        setSelectedAccountId(undefined);
      }
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete account");
    },
  });

  const updatePricesMutation = trpc.etf.updatePrices.useMutation({
    onSuccess: () => {
      toast.success("Prices updated!");
      refetchHoldings();
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update prices");
    },
  });

  const addHoldingMutation = trpc.etf.addHolding.useMutation({
    onSuccess: () => {
      toast.success("Investment added successfully!");
      refetchHoldings();
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
      setFormData({
        symbol: "",
        name: "",
        quantity: "",
        purchasePrice: "",
        purchaseDate: formatDate(new Date()),
        accountId: accounts?.[0]?.id.toString() || "",
      });
      setIsAddDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add Investment");
    },
  });

  const deleteHoldingMutation = trpc.etf.deleteHolding.useMutation({
    onSuccess: () => {
      toast.success("Investment deleted successfully!");
      refetchHoldings();
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
    },
    onError: () => {
      toast.error("Failed to delete Investment");
    },
  });

  const deleteHoldingBySymbolMutation = trpc.etf.deleteHoldingBySymbol.useMutation({
    onSuccess: () => {
      toast.success("Investment deleted successfully!");
      refetchHoldings();
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
    },
    onError: () => {
      toast.error("Failed to delete Investment");
    },
  });

  const buyMoreSharesMutation = trpc.etf.buyMoreShares.useMutation({
    onSuccess: () => {
      toast.success("Shares purchased successfully!");
      refetchHoldings();
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
      setBuyData({
        quantity: "",
        price: "",
        purchaseDate: defaultDate,
        accountId: "",
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
      utils.portfolio.getConsolidatedSummary.invalidate();
      setIsAdjustCashDialogOpen(false);
      setIsHistoricalCashDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update cash");
    },
  });

  const recordCashTransactionMutation = trpc.etf.recordCashTransaction.useMutation({
    onSuccess: () => {
      toast.success("Transaction recorded!");
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
      setIsAdjustCashDialogOpen(false);
      setAdjustCashData(prev => ({ ...prev, amount: "", description: "" }));
    },
    onError: (error) => {
      toast.error(error.message || "Failed to record transaction");
    },
  });

  const deletePurchaseMutation = trpc.etf.deletePurchase.useMutation({
    onSuccess: (data, variables) => {
      toast.success("Purchase deleted!");
      refetchHoldings();
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
      // Invalidate the specific holding's purchases to update the Audit Trail dialog
      utils.etf.getPurchases.invalidate({ 
        holdingId: variables.holdingId, 
        symbol: variables.symbol, 
        portfolioId: selectedPortfolioId 
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete purchase");
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
        utils.portfolio.getConsolidatedSummary.invalidate();
        setIsCSVImportOpen(null);
      } else {
        toast.error("Failed to import CSV");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Import failed");
    },
  });

  const updateHoldingMutation = trpc.etf.updateHolding.useMutation({
    onSuccess: () => {
      refetchHoldings();
      refetchSummary();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update holding");
    },
  });

  const handleAdjustCashAccountChange = async (accountId: string) => {
    setAdjustCashData(prev => ({ ...prev, accountId }));
  };

  // Helper to format price with automatic decimal point (e.g. 3085 -> 30.85)
  const handlePriceInputChange = (value: string, setter: (val: string) => void) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      setter("");
      return;
    }
    // Convert to number and shift decimal 2 places
    const amount = parseInt(digits, 10) / 100;
    setter(amount.toFixed(2));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  // Helper to fetch and set price based on symbol and date
  const fetchAndSetPrice = async (symbol: string, date: string, isBuyForm: boolean = false) => {
    if (!symbol || !date) return;
    try {
      const history = await utils.etf.getMarketPriceHistory.fetch({
        symbol: symbol.toUpperCase(),
        days: 7,
      });

      if (history && history.length > 0) {
        const selectedTime = new Date(date + "T23:59:59").getTime();
        const closest = history
          .filter(h => new Date(h.timestamp).getTime() <= selectedTime)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];

        if (closest) {
          if (isBuyForm) {
            setBuyData(prev => ({ ...prev, price: closest.price.toFixed(2) }));
          } else {
            setFormData(prev => ({ ...prev, purchasePrice: closest.price.toFixed(2) }));
          }
        }
      }
    } catch (error) {
      console.error("Error fetching historical price:", error);
    }
  };

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
          console.error("Error looking up investment name:", error);
        }
      }, 500);
    }
  };

  const handleDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    setFormData(prev => ({ ...prev, purchaseDate: date }));
    await fetchAndSetPrice(formData.symbol, date);
  };

  const handleBuyDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    setBuyData(prev => ({ ...prev, purchaseDate: date }));

    if (isBuyDialogOpen) {
      await fetchAndSetPrice(isBuyDialogOpen.symbol, date, true);
    }
  };

    const handleAddHolding = async () => {
    if (!selectedPortfolioId) {
      toast.error("Please select a portfolio");
      return;
    }
    if (!formData.accountId) {
      toast.error("Please select an account");
      return;
    }
    if (!formData.symbol || !formData.quantity || !formData.purchasePrice) {
      toast.error("Please fill in all fields");
      return;
    }

    // Check for duplicates in the SELECTED account
    // We already fetch holdings for the selected account if selectedAccountId is set
    const isDuplicate = holdings?.some(h => 
      h.symbol.toUpperCase() === formData.symbol.toUpperCase() && 
      (h as any).accountId === Number(formData.accountId)
    );
    if (isDuplicate) {
      toast.error(`'${formData.symbol.toUpperCase()}' is already in this account. Use 'Add Shares' to increase your position.`);
      return;
    }

    addHoldingMutation.mutate({
      portfolioId: selectedPortfolioId,
      accountId: Number(formData.accountId),
      symbol: formData.symbol,
      name: formData.name,
      quantity: formData.quantity,
      purchasePrice: formData.purchasePrice,
      purchaseDate: new Date(formData.purchaseDate + "T00:00:00"),
    });
  };

  const handleBuyMoreShares = async (holdingId: number, symbol: string, accountId?: number) => {
    if (!selectedPortfolioId) {
      toast.error("Please select a portfolio");
      return;
    }
    if (!accountId) {
      toast.error("Please select an account");
      return;
    }
    if (!buyData.quantity || !buyData.price) {
      toast.error("Please fill in quantity and price");
      return;
    }

    buyMoreSharesMutation.mutate({
      portfolioId: selectedPortfolioId,
      holdingId,
      symbol,
      accountId,
      quantity: buyData.quantity,
      price: buyData.price,
      purchaseDate: new Date(buyData.purchaseDate + "T00:00:00"),
    });
  };

  const handleDeleteHolding = (id: number, symbol: string) => {
    if (confirm("Are you sure you want to delete this investment?")) {
      if (id === -1) {
        deleteHoldingBySymbolMutation.mutate({ portfolioId: selectedPortfolioId, symbol });
      } else {
        deleteHoldingMutation.mutate({ id });
      }
    }
  };

  const handleDeletePurchase = (purchaseId: number, holdingId: number, symbol?: string) => {
    if (confirm("Are you sure you want to delete this purchase record?")) {
      deletePurchaseMutation.mutate({ purchaseId, holdingId, symbol });
    }
  };

  const handleImportCSV = (holdingId: number, symbol: string, csvContent: string, accountId: number) => {
    if (!selectedPortfolioId) return;
    importCSVMutation.mutate({
      portfolioId: selectedPortfolioId,
      holdingId,
      symbol,
      csvContent,
      accountId,
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
      {/* Action Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-lg shadow-sm border border-border">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-slate-100 rounded-lg text-primary">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Portfolio Overview</h2>
            <p className="text-xs text-slate-500 font-medium">Monitor performance and manage your assets across accounts</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Account Filter:</span>
            <select 
              className="bg-transparent border-none p-0 text-xs font-bold text-slate-600 focus:outline-none h-6 flex-1 sm:min-w-[140px]"
              value={selectedAccountId || ""}
              onChange={(e) => setSelectedAccountId(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">All Accounts</option>
              {accounts?.map((acc: any) => (
                <option key={acc.id} value={acc.id}>{acc.name} {acc.number ? `(${acc.number})` : ""}</option>
              ))}
            </select>
          </div>
          
          <Dialog open={isAccountsDialogOpen} onOpenChange={setIsAccountsDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-xs font-bold uppercase tracking-wider border-slate-200 text-slate-600 w-full sm:w-auto">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                NEW ACCOUNT
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Portfolio Accounts</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Account Name</label>
                    <Input 
                      placeholder="e.g. Robinhood" 
                      value={accountFormData.name} 
                      onChange={(e) => setAccountFormData(prev => ({ ...prev, name: e.target.value }))} 
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Number (optional)</label>
                    <Input 
                      placeholder="e.g. 1234" 
                      value={accountFormData.number} 
                      onChange={(e) => setAccountFormData(prev => ({ ...prev, number: e.target.value }))} 
                    />
                  </div>
                </div>
                <Button 
                  className="w-full h-10 font-bold uppercase tracking-wider" 
                  disabled={addAccountMutation.isPending || !accountFormData.name}
                  onClick={() => addAccountMutation.mutate({ 
                    portfolioId: selectedPortfolioId, 
                    name: accountFormData.name, 
                    number: accountFormData.number 
                  })}
                >
                  Add Account
                </Button>

                <div className="border-t pt-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Existing Accounts</h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                    {accounts && accounts.length > 0 ? (
                      accounts.map((acc: any) => (
                        <div key={acc.id} className="flex items-center justify-between p-2 rounded bg-slate-50 border border-slate-100">
                          <div>
                            <p className="text-sm font-bold text-slate-800">{acc.name}</p>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{acc.number || "No number"}</p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                            onClick={() => {
                              if (confirm("Delete this account? Associated holdings will remain but lose their account link.")) {
                                deleteAccountMutation.mutate({ id: acc.id });
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic py-4 text-center">No accounts added yet</p>
                    )}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {selectedAccountId && (
            <button 
              onClick={() => {
                if (confirm("Delete this account? Associated holdings will remain but lose their account link.")) {
                  deleteAccountMutation.mutate({ id: selectedAccountId });
                }
              }}
              className="p-1 text-slate-400 hover:text-red-600 transition-colors rounded-md hover:bg-red-50" 
              title="Delete Selected Account"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {accounts && accounts.length > 0 && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="data-card border-l-4 border-l-primary">
              <div className="data-card-title">Total Portfolio</div>
              <div className="data-card-value">{formatCurrency(summary?.totalValue)}</div>
              <div className="data-card-subtitle flex items-center gap-1 text-slate-500">
                <Info className="w-3 h-3" /> Includes Cash
              </div>
            </div>

            <div className="data-card border-l-4 border-l-green-600">
              <div className="data-card-title">Investment Value</div>
              <div className="data-card-value">{formatCurrency(summary?.investmentValue)}</div>
              <div className="data-card-subtitle flex items-center justify-between text-slate-500">
                <span>Market Assets</span>
                <span className="font-bold text-primary bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                  {summary?.totalValue && parseFloat(summary.totalValue) > 0 
                    ? ((parseFloat(summary.investmentValue) / parseFloat(summary.totalValue)) * 100).toFixed(1) 
                    : "0"}%
                </span>
              </div>
            </div>

            <div className="data-card border-l-4 border-l-slate-400">
              <div className="data-card-title">Cash Reserve</div>
              <div className="data-card-value">{formatCurrency(summary?.cashBalance)}</div>
              <div className="data-card-subtitle flex items-center justify-between text-slate-500">
                <span>Liquid Funds</span>
                <span className="font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">
                  {summary?.totalValue && parseFloat(summary.totalValue) > 0 
                    ? ((parseFloat(summary.cashBalance) / parseFloat(summary.totalValue)) * 100).toFixed(1) 
                    : "0"}%
                </span>
              </div>
            </div>

            <div className="data-card border-l-4 border-l-orange-500">
              <div className="data-card-title">Asset Count</div>
              <div className="data-card-value">{holdings?.length || 0}</div>
              <div className="data-card-subtitle text-slate-500">Diversified Holdings</div>
            </div>
          </div>

          {/* Main Holdings Table */}
          <Card className="bg-white shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Active Holdings
                </h2>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-full uppercase tracking-widest">{summary?.holdings?.length || 0} Assets</span>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedPortfolioId && updatePricesMutation.mutate({ portfolioId: selectedPortfolioId })}
                  disabled={updatePricesMutation.isPending}
                  className="border-slate-200 hover:bg-slate-50 text-xs font-bold uppercase tracking-wider h-9 flex-1 sm:flex-none"
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
                      purchaseDate: defaultDate,
                      accountId: accounts?.[0]?.id.toString() || "",
                    });
                  } else if (accounts && accounts.length > 0 && !formData.accountId) {
                    setFormData(prev => ({ ...prev, accountId: accounts[0].id.toString() }));
                  }
                }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/10 text-xs font-bold uppercase tracking-wider h-9 flex-1 sm:flex-none">
                      <Plus className="mr-2 h-3.5 w-3.5" />
                      Add Investment
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                      <DialogTitle>Add New Investment</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="grid gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Account</label>
                        <select 
                          className="bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary h-10"
                          value={formData.accountId}
                          onChange={(e) => setFormData(prev => ({ ...prev, accountId: e.target.value }))}
                        >
                          {accounts?.map((acc: any) => (
                            <option key={acc.id} value={acc.id}>{acc.name} {acc.number ? `(${acc.number})` : ""}</option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Symbol</label>
                        <Input 
                          placeholder="e.g., VOO, AAPL" 
                          value={formData.symbol} 
                          onChange={handleSymbolChange}
                          onBlur={() => fetchAndSetPrice(formData.symbol, formData.purchaseDate)}
                          onKeyDown={(e) => {
                            if (e.key === "Tab" && !e.shiftKey) {
                              e.preventDefault();
                              quantityInputRef.current?.focus();
                            }
                          }}
                        />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Investment Name</label>
                        <Input placeholder="Vanguard S&P 500 ETF" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} />
                      </div>
                      <div className="grid gap-2">
                        <label className="text-xs font-bold text-slate-500 uppercase">Purchase Date</label>
                        <Input type="date" value={formData.purchaseDate} onChange={handleDateChange} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Quantity</label>
                          <Input ref={quantityInputRef} type="number" step="0.001" value={formData.quantity} onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))} />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Purchase Price</label>
                          <Input 
                            type="text" 
                            inputMode="decimal"
                            value={formData.purchasePrice} 
                            onFocus={handleFocus}
                            onChange={(e) => handlePriceInputChange(e.target.value, (val) => setFormData(prev => ({ ...prev, purchasePrice: val })))} 
                          />
                        </div>
                      </div>
                      <Button onClick={handleAddHolding} className="w-full mt-2" disabled={addHoldingMutation.isPending}>
                        Add Investment
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
                    <th className="text-left py-3 px-3 text-slate-600">Asset</th>
                    <th className="text-right py-3 px-3 text-slate-600">Qty</th>
                    <th className="text-right py-3 px-3 text-slate-600">Avg Cost</th>
                    <th className="text-right py-3 px-3 text-slate-600">Total Cost</th>
                    <th className="text-right py-3 px-3 text-slate-600">Mkt Price</th>
                    <th className="text-right py-3 px-3 text-slate-600">Mkt Value</th>
                    <th className="text-right py-3 px-3 text-slate-600">Gain/Loss</th>
                    <th className="text-right py-3 px-3 text-slate-600">Return</th>
                    <th className="text-right py-3 px-3 text-slate-600">Allocation</th>
                    <th className="text-center py-3 px-3 text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {summary?.holdings?.map((holding: any) => {
                    const allocation = summary?.investmentAllocationBreakdown?.find((a: any) => a.symbol === holding.symbol);
                    const isGain = parseFloat(holding.gain) >= 0;
                    const isUnderWeight = parseFloat(allocation?.percentage || "0") < (parseFloat(holding.desiredAllocation) || 0);
                    const isConsolidated = holding.isConsolidated || holding.id === -1;
                    
                    return (
                      <tr key={isConsolidated ? `consolidated-${holding.symbol}` : holding.id} className="border-b border-border hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-primary text-sm leading-tight">{holding.symbol}</div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="text-slate-500 text-[10px] leading-tight cursor-help whitespace-nowrap">
                                {holding.name.length > 20 ? `${holding.name.substring(0, 20)}...` : holding.name}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              <p className="max-w-[300px]">{holding.name}</p>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="text-right py-3 px-3 font-mono text-xs font-medium">{formatNumber(holding.quantity, 3)}</td>
                        <td className="text-right py-3 px-3 font-mono text-xs text-slate-600">{formatCurrency(holding.averageCost)}</td>
                        <td className="text-right py-3 px-3 font-mono text-xs text-slate-600">{formatCurrency(holding.totalCost)}</td>
                        <td className="text-right py-3 px-3 font-mono text-xs text-slate-600">{formatCurrency(holding.currentPrice)}</td>
                        <td className="text-right py-3 px-3 font-mono text-xs font-bold">{formatCurrency(holding.currentValue)}</td>
                        <td className={`text-right py-3 px-3 font-mono text-xs font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                          {isGain ? "+" : ""}{formatCurrency(holding.gain)}
                        </td>
                        <td className={`text-right py-3 px-3 font-mono text-xs font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                          {isGain ? "+" : ""}{holding.gainPercent}%
                        </td>
                        <td className="text-right py-3 px-3 font-mono">
                          <div className="flex flex-col items-end gap-1">
                            <div className="text-xs font-bold text-slate-700 leading-none">{allocation?.percentage || "0.00"}%</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {isUnderWeight && (
                                <div className="flex items-center text-[8px] font-bold text-green-600 animate-pulse">
                                  <ArrowUpCircle className="w-2.5 h-2.5 mr-0.5" /> BUY
                                </div>
                              )}
                              <div className="flex items-center text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                <span className="mr-1">Target</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  defaultValue={holding.desiredAllocation || "0"}
                                  onBlur={(e) => {
                                    if (e.target.value !== holding.desiredAllocation) {
                                      updateHoldingMutation.mutate({
                                        id: holding.id,
                                        symbol: holding.symbol,
                                        portfolioId: selectedPortfolioId,
                                        desiredAllocation: e.target.value,
                                      });
                                    }
                                  }}
                                  className="w-10 bg-transparent border-none p-0 text-right focus:outline-none focus:ring-0 font-bold text-slate-600"
                                />
                                <span>%</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="text-center py-3 px-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel>Manage Asset</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setIsBuyDialogOpen({ id: holding.id, symbol: holding.symbol })}>
                                <ShoppingCart className="mr-2 h-4 w-4 text-slate-500" />
                                <span>Add Shares</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setIsCSVImportOpen({ id: holding.id, symbol: holding.symbol })}>
                                <FileUp className="mr-2 h-4 w-4 text-slate-500" />
                                <span>Import Purchases</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setPurchaseHistoryOpen({ id: holding.id, symbol: holding.symbol })}>
                                <Download className="mr-2 h-4 w-4 text-slate-500" />
                                <span>Export Purchases</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setPurchaseHistoryOpen({ id: holding.id, symbol: holding.symbol })}>
                                <History className="mr-2 h-4 w-4 text-slate-500" />
                                <span>View History</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleDeleteHolding(holding.id, holding.symbol)}
                                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                <span>Delete Investment</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {summary?.holdings && summary.holdings.length > 0 && (
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                    <tr className="font-bold text-slate-800">
                      <td colSpan={5} className="py-4 px-3 uppercase text-[10px] tracking-widest text-slate-500">Total Portfolio Performance</td>
                      <td className="text-right py-4 px-3 font-mono text-sm">{formatCurrency(summary.investmentValue)}</td>
                      <td className={`text-right py-4 px-3 font-mono text-sm ${
                        (summary?.holdings?.reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0) >= 0 
                          ? "text-green-600" 
                          : "text-red-600"
                      }`}>
                        {(summary?.holdings?.reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0) >= 0 ? "+" : ""}
                        {formatCurrency(summary?.holdings?.reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0)}
                      </td>
                      <td className={`text-right py-4 px-3 font-mono text-sm ${
                        ((summary?.holdings?.reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0) / 
                        (summary?.holdings?.reduce((acc: number, h: any) => acc + (parseFloat(h.averageCost || h.purchasePrice) * parseFloat(h.quantity)), 0) || 1) * 100) >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}>
                        {(
                          ((summary?.holdings?.reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0) / 
                          (summary?.holdings?.reduce((acc: number, h: any) => acc + (parseFloat(h.averageCost || h.purchasePrice) * parseFloat(h.quantity)), 0) || 1)) * 100
                        ).toFixed(2)}%
                      </td>
                      <td className="text-right py-4 px-3 font-mono text-slate-500 text-xs">100%</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

          {/* Cash Accounts Table */}
          <Card className="bg-white shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-primary" />
                  Cash Accounts
                </h2>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-full uppercase tracking-widest">{accounts?.length || 0} Accounts</span>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const defaultAccId = selectedAccountId || accounts?.[0]?.id;
                    if (defaultAccId) {
                      setHistoricalCashData(prev => ({ ...prev, accountId: defaultAccId.toString() }));
                    }
                    setIsHistoricalCashDialogOpen(true);
                  }} 
                  className="text-[10px] uppercase font-bold border-slate-200 hover:bg-slate-50 h-8"
                >
                  <CalendarPlus className="w-3.5 h-3.5 mr-1.5" />
                  Balance History
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-border">
                    <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Account Name</th>
                    <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Cash Balance</th>
                    <th className="text-center py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts?.map((account: any) => {
                    const balance = (summary as any)?.cashBalances?.[account.id] || "0.00";
                    return (
                      <tr key={account.id} className="border-b border-border hover:bg-slate-50 transition-colors">
                        <td className="py-4 px-6">
                          <div className="font-bold text-slate-800">{account.name}</div>
                          {account.number && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{account.number}</div>}
                        </td>
                        <td className="py-4 px-6 text-right font-mono font-bold text-slate-700">
                          {formatCurrency(balance)}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center justify-center gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setAdjustCashData({ 
                                  accountId: account.id.toString(), 
                                  amount: "", 
                                  type: "deposit", 
                                  description: "", 
                                  date: formatDate(new Date()) 
                                });
                                setIsAdjustCashDialogOpen(true);
                              }}
                              className="h-8 text-[10px] font-bold uppercase border-green-200 text-green-700 hover:bg-green-50 hover:text-green-800"
                            >
                              Deposit
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                setAdjustCashData({ 
                                  accountId: account.id.toString(), 
                                  amount: "", 
                                  type: "withdrawal", 
                                  description: "", 
                                  date: formatDate(new Date()) 
                                });
                                setIsAdjustCashDialogOpen(true);
                              }}
                              className="h-8 text-[10px] font-bold uppercase border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                            >
                              Withdraw
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost"
                              onClick={() => setCashHistoryOpen({ id: account.id, name: account.name })}
                              className="h-8 w-8 p-0 text-slate-400 hover:text-primary hover:bg-slate-100"
                            >
                              <History className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {(!accounts || accounts.length === 0) && (
                    <tr>
                      <td colSpan={3} className="py-10 text-center text-slate-400">
                        No accounts found. Add an account to manage cash.
                      </td>
                    </tr>
                  )}
                </tbody>
                {accounts && accounts.length > 0 && (
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                    <tr className="font-bold text-slate-800">
                      <td className="py-4 px-6 uppercase text-[10px] tracking-widest text-slate-500">Total Cash Reserve</td>
                      <td className="text-right py-4 px-6 font-mono text-sm text-primary">
                        {formatCurrency(accounts.reduce((acc: number, account: any) => acc + parseFloat((summary as any)?.cashBalances?.[account.id] || "0"), 0))}
                      </td>
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
          </div>        </>
      )}

      {/* Dialogs */}
      <Dialog open={isHistoricalCashDialogOpen} onOpenChange={setIsHistoricalCashDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Record Historical Cash Balance</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="grid gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Account</label>
              <select 
                className="bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary h-10"
                value={historicalCashData.accountId}
                onChange={(e) => setHistoricalCashData(prev => ({ ...prev, accountId: e.target.value }))}
              >
                {accounts?.map((acc: any) => (
                  <option key={acc.id} value={acc.id}>{acc.name} {acc.number ? `(${acc.number})` : ""}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Date</label>
              <Input 
                type="date" 
                value={historicalCashData.date} 
                onChange={(e) => setHistoricalCashData(prev => ({ ...prev, date: e.target.value }))} 
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Cash Amount</label>
              <Input 
                type="text" 
                inputMode="decimal"
                value={historicalCashData.amount} 
                onFocus={handleFocus}
                onChange={(e) => handlePriceInputChange(e.target.value, (val) => setHistoricalCashData(prev => ({ ...prev, amount: val })))} 
              />
            </div>
            <Button 
              onClick={() => {
                if (historicalCashData.accountId && historicalCashData.amount && historicalCashData.date) {
                  updateCashMutation.mutate({
                    portfolioId: selectedPortfolioId,
                    accountId: Number(historicalCashData.accountId),
                    amount: historicalCashData.amount,
                    date: new Date(historicalCashData.date + "T12:00:00") // Mid-day to avoid TZ issues
                  });
                } else {
                  toast.error("Please fill in all fields");
                }
              }} 
              className="w-full" 
              disabled={updateCashMutation.isPending || !historicalCashData.accountId}
            >
              Save History
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAdjustCashDialogOpen} onOpenChange={setIsAdjustCashDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cash Reserve Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="grid gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account</label>
              <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm font-bold text-slate-700">
                {accounts?.find(a => a.id.toString() === adjustCashData.accountId)?.name || "Selected Account"}
              </div>
            </div>
            
            <div className="grid gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Action</label>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  type="button" 
                  variant={adjustCashData.type === "deposit" ? "default" : "outline"}
                  onClick={() => setAdjustCashData(prev => ({ ...prev, type: "deposit" }))}
                  className="h-10 text-xs font-bold uppercase"
                >
                  Deposit
                </Button>
                <Button 
                  type="button" 
                  variant={adjustCashData.type === "withdrawal" ? "default" : "outline"}
                  onClick={() => setAdjustCashData(prev => ({ ...prev, type: "withdrawal" }))}
                  className="h-10 text-xs font-bold uppercase"
                >
                  Withdrawal
                </Button>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Amount</label>
              <Input 
                type="text" 
                inputMode="decimal"
                placeholder="0.00"
                value={adjustCashData.amount} 
                onFocus={(e) => e.target.select()}
                onChange={(e) => handlePriceInputChange(e.target.value, (val) => setAdjustCashData(prev => ({ ...prev, amount: val })))} 
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Date</label>
              <Input 
                type="date" 
                value={adjustCashData.date} 
                onChange={(e) => setAdjustCashData(prev => ({ ...prev, date: e.target.value }))} 
              />
            </div>

            <div className="grid gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Description (Optional)</label>
              <Input 
                type="text" 
                placeholder="e.g. Monthly Savings, Dividends Transfer"
                value={adjustCashData.description} 
                onChange={(e) => setAdjustCashData(prev => ({ ...prev, description: e.target.value }))} 
              />
            </div>

            <Button 
              onClick={() => {
                if (adjustCashData.accountId && adjustCashData.amount) {
                  recordCashTransactionMutation.mutate({
                    portfolioId: selectedPortfolioId,
                    accountId: Number(adjustCashData.accountId),
                    amount: adjustCashData.amount,
                    type: adjustCashData.type as "deposit" | "withdrawal",
                    description: adjustCashData.description,
                    date: new Date(adjustCashData.date + "T12:00:00")
                  });
                }
              }} 
              className="w-full" 
              disabled={recordCashTransactionMutation.isPending || !adjustCashData.accountId}
            >
              {adjustCashData.type === "deposit" ? "Confirm Deposit" : "Confirm Withdrawal"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isBuyDialogOpen && (
        <Dialog open={!!isBuyDialogOpen} onOpenChange={() => setIsBuyDialogOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Shares for {isBuyDialogOpen.symbol}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="grid gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Target Account</label>
                <select 
                  className="bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary h-10 w-full"
                  value={buyData.accountId}
                  onChange={(e) => setBuyData(prev => ({ ...prev, accountId: e.target.value }))}
                >
                  {accounts?.map((acc: any) => (
                    <option key={acc.id} value={acc.id}>{acc.name} {acc.number ? `(${acc.number})` : ""}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Quantity</label>
                <Input type="number" step="0.001" value={buyData.quantity} onChange={(e) => setBuyData(prev => ({ ...prev, quantity: e.target.value }))} />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Date of Purchase</label>
                <Input type="date" value={buyData.purchaseDate} onChange={handleBuyDateChange} />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Purchase Price</label>
                <Input 
                  type="text" 
                  inputMode="decimal"
                  value={buyData.price} 
                  onFocus={handleFocus}
                  onChange={(e) => handlePriceInputChange(e.target.value, (val) => setBuyData(prev => ({ ...prev, price: val })))} 
                />
              </div>
              <Button onClick={() => handleBuyMoreShares(isBuyDialogOpen.id, isBuyDialogOpen.symbol, Number(buyData.accountId))} className="w-full" disabled={buyMoreSharesMutation.isPending}>
                Add Purchase
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {cashHistoryOpen && (
        <Dialog open={!!cashHistoryOpen} onOpenChange={() => setCashHistoryOpen(null)}>
          <DialogContent className="sm:max-w-[800px]">
            <DialogHeader>
              <DialogTitle>Cash Transaction History: {cashHistoryOpen.name}</DialogTitle>
            </DialogHeader>
            <CashHistoryTable
              accountId={cashHistoryOpen.id}
              portfolioId={selectedPortfolioId}
            />
          </DialogContent>
        </Dialog>
      )}

      {purchaseHistoryOpen && (
        <Dialog open={!!purchaseHistoryOpen} onOpenChange={() => setPurchaseHistoryOpen(null)}>
          <DialogContent className="sm:max-w-[900px]">
            <DialogHeader>
              <DialogTitle>Purchase History for {purchaseHistoryOpen.symbol}</DialogTitle>
            </DialogHeader>
            <PurchaseHistoryTable 
              holdingId={purchaseHistoryOpen.id} 
              symbol={purchaseHistoryOpen.symbol}
              portfolioId={selectedPortfolioId}
              onDelete={handleDeletePurchase} 
              accounts={accounts || []}
            />
          </DialogContent>
        </Dialog>
      )}

      {isCSVImportOpen && (
        <Dialog open={!!isCSVImportOpen} onOpenChange={() => setIsCSVImportOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Purchase History for {isCSVImportOpen.symbol}</DialogTitle>
            </DialogHeader>
            <CSVImportForm 
              holdingId={isCSVImportOpen.id} 
              symbol={isCSVImportOpen.symbol}
              onImport={handleImportCSV} 
              isLoading={importCSVMutation.isPending}
              accounts={accounts || []}
              currentAccountId={(holdings?.find((h: any) => h.id === isCSVImportOpen.id) as any)?.accountId}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PortfolioAllocationChart({ data, cashPercent }: { data: any[], cashPercent: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const totalWithCash = parseFloat(cashPercent) + data.reduce((acc: number, item: any) => acc + parseFloat(item.percentage), 0);
  
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

function PurchaseHistoryTable({ 
  holdingId, 
  symbol,
  portfolioId,
  onDelete,
  accounts
}: { 
  holdingId: number, 
  symbol: string,
  portfolioId: number,
  onDelete: (id: number, holdingId: number, symbol?: string) => void,
  accounts: any[]
}) {
  const { data: purchases } = trpc.etf.getPurchases.useQuery({ holdingId, symbol, portfolioId });
  const [filterAccountId, setFilterAccountId] = useState<string>("");

  const filteredPurchases = useMemo(() => {
    if (!purchases) return [];
    if (!filterAccountId) return purchases;
    return purchases.filter((p: any) => p.accountId === Number(filterAccountId));
  }, [purchases, filterAccountId]);

  const handleExportCSV = () => {
    if (!filteredPurchases || filteredPurchases.length === 0) {
      toast.error("No purchases to export");
      return;
    }

    const headers = "date,account,quantity,cost";
    const rows = filteredPurchases.map(p => {
      const date = new Date(p.purchaseDate).toISOString().split('T')[0];
      const account = accounts.find(a => a.id === p.accountId);
      const accountName = account ? account.name : "Unknown";
      return `${date},"${accountName}",${p.quantity},${p.price}`;
    });

    const csvContent = [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${symbol}_purchases.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredPurchases.length} purchases to CSV`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-3 rounded-lg border border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Filter by Account:</span>
          <select 
            className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-600 focus:outline-none h-8 min-w-[160px]"
            value={filterAccountId}
            onChange={(e) => setFilterAccountId(e.target.value)}
          >
            <option value="">All Accounts</option>
            {accounts?.map((acc: any) => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>

        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleExportCSV}
          className="text-[10px] font-bold uppercase tracking-wider h-8 border-slate-200"
          disabled={!filteredPurchases || filteredPurchases.length === 0}
        >
          <Download className="w-3.5 h-3.5 mr-1.5 text-primary" />
          Export to CSV
        </Button>
      </div>

      <div className="overflow-auto max-h-[60vh] custom-scrollbar border border-border rounded-lg bg-slate-50/30">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4">Date</th>
              <th className="text-left py-3 px-4">Account</th>
              <th className="text-right py-3 px-4">Quantity</th>
              <th className="text-right py-3 px-4">Price</th>
              <th className="text-right py-3 px-4">Total</th>
              <th className="text-center py-3 px-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredPurchases?.map((purchase: any) => {
              const date = new Date(purchase.purchaseDate);
              const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
              const accountName = accounts?.find((a: any) => a.id === purchase.accountId)?.name || "Default";
              const quantity = parseFloat(purchase.quantity);
              const price = parseFloat(purchase.price);
              const totalAmount = quantity * price;
              
              return (
                <tr key={purchase.id} className="border-b border-border hover:bg-white transition-colors">
                  <td className="py-3 px-4 font-mono whitespace-nowrap">{dateStr}</td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      {accountName}
                    </span>
                  </td>
                  <td className="text-right py-3 px-4 font-mono">{formatNumber(purchase.quantity, 3)}</td>
                  <td className="text-right py-3 px-4 font-mono font-medium">{formatCurrency(purchase.price)}</td>
                  <td className="text-right py-3 px-4 font-mono font-bold text-slate-700">{formatCurrency(totalAmount)}</td>
                  <td className="text-center py-3 px-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(purchase.id, holdingId, symbol)}
                      className="text-slate-400 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {filteredPurchases.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                  No purchase records found for this selection.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CSVImportForm({
  holdingId, 
  symbol,
  onImport, 
  isLoading,
  accounts,
  currentAccountId
}: { 
  holdingId: number, 
  symbol: string,
  onImport: (holdingId: number, symbol: string, csv: string, accountId: number) => void,
  isLoading: boolean,
  accounts: any[],
  currentAccountId?: number
}) {
  const [file, setFile] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(currentAccountId?.toString() || "");

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

    if (!selectedAccountId) {
      toast.error("Please select an account for these purchases");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        onImport(holdingId, symbol, content, Number(selectedAccountId));
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read file");
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 pt-4">
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Target Account</label>
        <select 
          className="bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary h-10 w-full"
          value={selectedAccountId}
          onChange={(e) => setSelectedAccountId(e.target.value)}
        >
          {accounts?.map((acc: any) => (
            <option key={acc.id} value={acc.id}>{acc.name} {acc.number ? `(${acc.number})` : ""}</option>
          ))}
        </select>
      </div>

      <div className="bg-slate-50 p-4 rounded-lg border border-border">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Info className="w-3 h-3" /> CSV File Format
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
      
      <Button 
        onClick={handleUpload} 
        className="w-full py-6 text-sm font-bold shadow-lg shadow-primary/10" 
        disabled={!file || isLoading}
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Importing Purchases...
          </div>
        ) : (
          "Import Purchases"
        )}
      </Button>
    </div>
  );
}

function CashHistoryTable({
  accountId,
  portfolioId
}: {
  accountId: number,
  portfolioId: number
}) {
  const utils = trpc.useUtils();
  const { data: history, isLoading, refetch } = trpc.etf.getCashActivities.useQuery(
    { portfolioId, range: "1y" }, // Show last year by default
    { enabled: !!portfolioId }
  );

  const deleteCashTransactionMutation = trpc.etf.deleteCashTransaction.useMutation({
    onSuccess: () => {
      toast.success("Transaction deleted!");
      refetch();
      utils.etf.getPortfolioSummary.invalidate();
      utils.portfolio.getConsolidatedSummary.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete transaction");
    },
  });

  const handleDeleteTransaction = (transactionId: number) => {
    if (confirm("Are you sure you want to delete this cash transaction? Subsequent balances for this account will be recalculated.")) {
      deleteCashTransactionMutation.mutate({
        portfolioId,
        accountId,
        transactionId
      });
    }
  };

  const filteredHistory = useMemo(() => {
    if (!history) return [];
    return history.filter((h: any) => h.accountId === accountId);
  }, [history, accountId]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-primary opacity-50" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fetching history...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="overflow-auto max-h-[60vh] custom-scrollbar border border-border rounded-lg bg-slate-50/30">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Date</th>
              <th className="text-left py-3 px-4 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Type</th>
              <th className="text-left py-3 px-4 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Description</th>
              <th className="text-right py-3 px-4 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Transaction</th>
              <th className="text-right py-3 px-4 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Balance</th>
              <th className="text-center py-3 px-4 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredHistory.map((activity: any, idx: number) => (
              <tr key={idx} className="border-b border-border hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4 font-mono text-xs text-slate-500">
                  {formatDate(activity.date)}
                </td>
                <td className="py-3 px-4">
                  <Badge variant="outline" className="capitalize text-[10px] h-5">
                    {activity.transactionType || "Adjustment"}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-slate-500 italic text-xs max-w-[200px] truncate">
                  {activity.description || "-"}
                </td>
                <td className={`text-right py-3 px-4 font-mono font-bold text-xs ${activity.transactionType === 'withdrawal' ? 'text-red-600' : activity.transactionType === 'deposit' ? 'text-green-600' : 'text-slate-700'}`}>
                  {activity.transactionType === 'withdrawal' ? '-' : activity.transactionType === 'deposit' ? '+' : ''}
                  {formatCurrency(activity.transactionAmount || activity.amount)}
                </td>
                <td className="text-right py-3 px-4 font-mono text-xs text-slate-500">
                  {formatCurrency(activity.amount)}
                </td>
                <td className="py-3 px-4 text-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteTransaction(activity.id)}
                    className="h-7 w-7 p-0 text-slate-300 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {filteredHistory.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-400">
                  No transaction history found for this account.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
