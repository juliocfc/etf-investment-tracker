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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, RefreshCw, ShoppingCart, History, FolderPlus, FileUp, Wallet, TrendingUp, Info, ArrowUpCircle, ArrowDownCircle, CheckCircle2, MoreVertical, CalendarPlus, Download, List, Activity, DollarSign, LayoutDashboard, Edit2, ArrowUpDown, ChevronUp, ChevronDown, ChevronRight, ArrowLeftRight, CheckSquare, Square, Briefcase, PieChart, Landmark } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, formatNumber, formatDate, formatUTCDate, truncateNumber } from "@/lib/utils";
import React, { useEffect, useRef, useState, useMemo } from "react";
import Activities from "./Activities";
import Performance from "./Performance";
import Dividends from "./Dividends";

export const CHART_COLORS = ["#004a99", "#3d8a3d", "#f2a900", "#cc0000", "#666666", "#94a3b8", "#38bdf8", "#10b981", "#fbbf24"];

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
  const [activeSubTab, setActiveSubTab] = useState("overview");
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({
    key: "currentValue",
    direction: "desc"
  });
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>(undefined);
  const [selectedAccountType, setSelectedAccountType] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isTradeDialogOpen, setIsTradeDialogOpen] = useState<{ id: number, symbol: string } | null>(null);
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

  const [expandedHoldings, setExpandedHoldings] = useState<Set<string>>(new Set());
  const [expandedAccounts, setExpandedAccounts] = useState<Set<number>>(new Set());

  const toggleHoldingExpand = (symbol: string) => {
    const next = new Set(expandedHoldings);
    if (next.has(symbol)) next.delete(symbol);
    else next.add(symbol);
    setExpandedHoldings(next);
  };

  const toggleAccountExpand = (accountId: number) => {
    const next = new Set(expandedAccounts);
    if (next.has(accountId)) next.delete(accountId);
    else next.add(accountId);
    setExpandedAccounts(next);
  };

  const defaultDate = useMemo(() => getLastTradingDay(), []);

  const [formData, setFormData] = useState({
    symbol: "",
    name: "",
    quantity: "",
    purchasePrice: "",
    purchaseDate: defaultDate,
    accountId: "",
    fees: "",
    type: "buy" as "buy" | "sell",
  });

  const [accountFormData, setAccountFormData] = useState({
    name: "",
    number: "",
    accountType: "Brokerage" as "Retirement" | "Brokerage" | "Savings" | "Checking" | "Other",
  });

  const [tradeData, setTradeData] = useState({
    quantity: "",
    price: "",
    purchaseDate: defaultDate,
    accountId: "",
    fees: "",
    type: "buy" as "buy" | "sell",
  });

  const [isAddBondDialogOpen, setIsAddBondDialogOpen] = useState(false);
  const [isBondTradeDialogOpen, setIsBondTradeDialogOpen] = useState<{ id: number, symbol: string } | null>(null);
  const [bondPurchaseHistoryOpen, setBondPurchaseHistoryOpen] = useState<{ id: number, symbol: string } | null>(null);
  const [expandedBonds, setExpandedBonds] = useState<Set<string>>(new Set());
  const [bondFormData, setBondFormData] = useState({
    symbol: "",
    name: "",
    quantity: "",
    purchasePrice: "",
    purchaseDate: defaultDate,
    redemptionDate: "",
    couponRate: "",
    accountId: "",
    interest: "",
    fees: "",
    type: "buy" as "buy" | "sell",
  });
  const [bondTradeData, setBondTradeData] = useState({
    quantity: "",
    price: "",
    purchaseDate: defaultDate,
    accountId: "",
    interest: "",
    fees: "",
    type: "buy" as "buy" | "sell",
  });
  const toggleBondExpand = (symbol: string) => {
    const next = new Set(expandedBonds);
    if (next.has(symbol)) next.delete(symbol);
    else next.add(symbol);
    setExpandedBonds(next);
  };

  // Automatically fetch price when Trade dialog opens
  useEffect(() => {
    if (isTradeDialogOpen) {
      fetchAndSetPrice(isTradeDialogOpen.symbol, tradeData.purchaseDate, false);
      const holding = holdings?.find(h => h.id === isTradeDialogOpen.id);
      if (holding && (holding as any).accountId) {
        setTradeData(prev => ({ ...prev, accountId: (holding as any).accountId.toString() }));
      }
    }
  }, [isTradeDialogOpen]);

  useEffect(() => {
    if (isBondTradeDialogOpen) {
      const holding = bondHoldings?.find(h => h.id === isBondTradeDialogOpen.id);
      if (holding && (holding as any).accountId) {
        setBondTradeData(prev => ({ ...prev, accountId: (holding as any).accountId.toString() }));
      }
      // auto-fill current brokerage price for the bond
      (async () => {
        try {
          const res: any = await (utils as any).bond.getPrice.fetch({ symbol: isBondTradeDialogOpen.symbol });
          if (res?.price) setBondTradeData(prev => ({ ...prev, price: res.price }));
          else if (holding?.currentPrice) setBondTradeData(prev => ({ ...prev, price: (holding as any).currentPrice }));
        } catch {}
      })();
    }
  }, [isBondTradeDialogOpen]);

  const [isCSVImportOpen, setIsCSVImportOpen] = useState<{ id: number, symbol: string } | null>(null);
  const [isGeneralCSVImportOpen, setIsGeneralCSVImportOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState<{ id: number, symbol: string, accountId?: number } | null>(null);
  const [transferData, setTransferData] = useState<{
    sourceAccountId: string;
    targetPortfolioId: string;
    targetAccountId: string;
    selectedPurchaseIds: Set<number>;
  }>({
    sourceAccountId: "",
    targetPortfolioId: "",
    targetAccountId: "",
    selectedPurchaseIds: new Set(),
  });
  const lookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  // Reset sub-tab and account filter when portfolio changes
  useEffect(() => {
    setActiveSubTab("overview");
    setSelectedAccountId(undefined);
    setSelectedAccountType("all");
  }, [selectedPortfolioId]);

  // Queries
  const { data: portfolios } = trpc.portfolio.getAll.useQuery();
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
      if (!tradeData.accountId || !isAccountValid(tradeData.accountId)) {
        setTradeData(prev => ({ ...prev, accountId: firstAccountId }));
      }
      if (!bondFormData.accountId || !isAccountValid(bondFormData.accountId)) {
        setBondFormData(prev => ({ ...prev, accountId: firstAccountId }));
      }
      if (!bondTradeData.accountId || !isAccountValid(bondTradeData.accountId)) {
        setBondTradeData(prev => ({ ...prev, accountId: firstAccountId }));
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
      setTradeData(prev => ({ ...prev, accountId: "" }));
      setBondFormData(prev => ({ ...prev, accountId: "" }));
      setBondTradeData(prev => ({ ...prev, accountId: "" }));
      setAdjustCashData(prev => ({ ...prev, accountId: "" }));
      setHistoricalCashData(prev => ({ ...prev, accountId: "" }));
    }
  }, [accounts]);

  const { data: summary, refetch: refetchSummary } = trpc.etf.getPortfolioSummary.useQuery(
    { 
      portfolioId: selectedPortfolioId, 
      accountId: selectedAccountId,
      accountType: selectedAccountType === "all" ? undefined : selectedAccountType
    },
    { enabled: !!selectedPortfolioId }
  );

  const requestSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedHoldings = useMemo(() => {
    if (!summary?.holdings) return [];
    const equityOnly = summary.holdings.filter((h: any) => !h.assetType || h.assetType === "etf" || h.assetType === "equity");
    const sortableItems = [...equityOnly];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];

        // Handle numeric strings
        if (typeof aValue === 'string' && !isNaN(Number(aValue))) aValue = Number(aValue);
        if (typeof bValue === 'string' && !isNaN(Number(bValue))) bValue = Number(bValue);

        if (aValue < bValue) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [summary?.holdings, sortConfig]);

  const { data: holdings, refetch: refetchHoldings } = trpc.etf.getHoldings.useQuery(
    { 
      portfolioId: selectedPortfolioId, 
      accountId: selectedAccountId,
      accountType: selectedAccountType === "all" ? undefined : selectedAccountType
    },
    { enabled: !!selectedPortfolioId }
  );

  const { data: bondHoldings, refetch: refetchBondHoldings } = trpc.bond.getHoldings.useQuery(
    {
      portfolioId: selectedPortfolioId,
      accountId: selectedAccountId,
      accountType: selectedAccountType === "all" ? undefined : selectedAccountType
    },
    { enabled: !!selectedPortfolioId }
  );

  // Bond holdings summary (sorted) - bonds are shown together via summary.holdings but we keep dedicated sorted list for Bonds card
  const sortedBondHoldings = useMemo(() => {
    if (!bondHoldings) return [];
    // Bond holdings are already per-account when filtered, but we display as-is. Sort by symbol.
    const items = [...bondHoldings];
    if (sortConfig !== null) {
      items.sort((a: any, b: any) => {
        let av = a[sortConfig.key]; let bv = b[sortConfig.key];
        if (typeof av === 'string' && !isNaN(Number(av))) av = Number(av);
        if (typeof bv === 'string' && !isNaN(Number(bv))) bv = Number(bv);
        if (av < bv) return sortConfig.direction === "asc" ? -1 : 1;
        if (av > bv) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return items;
  }, [bondHoldings, sortConfig]);

  const [editingAccount, setEditingAccount] = useState<{ id: number, name: string, number?: string, accountType: string } | null>(null);
  const [movingAccount, setMovingAccount] = useState<{ id: number, name: string, portfolioId: number } | null>(null);
  const [targetPortfolioId, setTargetPortfolioId] = useState<string>("");

  // Mutations
  const addAccountMutation = trpc.account.addAccount.useMutation({
    onSuccess: () => {
      toast.success("Account added successfully!");
      refetchAccounts();
      setAccountFormData({ name: "", number: "", accountType: "Brokerage" });
      setIsAccountsDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add account");
    },
  });

  const updateAccountMutation = trpc.account.updateAccount.useMutation({
    onSuccess: () => {
      toast.success("Account updated!");
      refetchAccounts();
      setEditingAccount(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update account");
    }
  });

  const moveAccountMutation = trpc.account.moveAccount.useMutation({
    onSuccess: () => {
      toast.success("Account moved successfully!");
      refetchAccounts();
      refetchHoldings();
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
      setMovingAccount(null);
      setTargetPortfolioId("");
    },
    onError: (error) => {
      toast.error(error.message || "Failed to move account");
    }
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
        fees: "",
        type: "buy",
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

  const executeTradeMutation = trpc.etf.executeTrade.useMutation({
    onSuccess: (data) => {
      toast.success(`${tradeData.type === "buy" ? "Bought" : "Sold"} successfully! New quantity: ${data.newQuantity}`);
      refetchHoldings();
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
      setTradeData({
        quantity: "",
        price: "",
        purchaseDate: defaultDate,
        accountId: "",
        fees: "",
        type: "buy",
      });
      setIsTradeDialogOpen(null);
    },
    onError: (error) => {
      toast.error(error.message || `Failed to ${tradeData.type} shares`);
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
          if (data.errors && data.errors.length > 0) {
            console.error("CSV Import Errors:", data.errors);
            // Show the first 3 errors to the user
            data.errors.slice(0, 3).forEach((err: string) => toast.error(err));
          }
        }
        refetchHoldings();
        refetchSummary();
        utils.portfolio.getConsolidatedSummary.invalidate();
        setIsCSVImportOpen(null);
        setIsGeneralCSVImportOpen(false);
      } else {
        if (data.errors && data.errors.length > 0) {
          data.errors.slice(0, 3).forEach((err: string) => toast.error(err));
        } else {
          toast.error("Failed to import CSV: No valid data found");
        }
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

  // Bond mutations
  const addBondHoldingMutation = trpc.bond.addHolding.useMutation({
    onSuccess: () => {
      toast.success("Bond added successfully!");
      refetchBondHoldings();
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
      setBondFormData({
        symbol: "",
        name: "",
        quantity: "",
        purchasePrice: "",
        purchaseDate: defaultDate,
        redemptionDate: "",
        couponRate: "",
        accountId: accounts?.[0]?.id.toString() || "",
        interest: "",
        fees: "",
        type: "buy",
      });
      setIsAddBondDialogOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add Bond");
    },
  });

  const deleteBondHoldingMutation = trpc.bond.deleteHolding.useMutation({
    onSuccess: () => {
      toast.success("Bond deleted successfully!");
      refetchBondHoldings();
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
    },
    onError: () => {
      toast.error("Failed to delete Bond");
    },
  });

  const deleteBondHoldingBySymbolMutation = trpc.bond.deleteHoldingBySymbol.useMutation({
    onSuccess: () => {
      toast.success("Bond deleted successfully!");
      refetchBondHoldings();
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
    },
    onError: () => {
      toast.error("Failed to delete Bond");
    },
  });

  const executeBondTradeMutation = trpc.bond.executeTrade.useMutation({
    onSuccess: (data) => {
      toast.success(`${bondTradeData.type === "buy" ? "Bought" : "Sold"} successfully! New quantity: ${data.newQuantity}`);
      refetchBondHoldings();
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
      setBondTradeData({
        quantity: "",
        price: "",
        purchaseDate: defaultDate,
        accountId: "",
        interest: "",
        fees: "",
        type: "buy",
      });
      setIsBondTradeDialogOpen(null);
    },
    onError: (error) => {
      toast.error(error.message || `Failed to ${bondTradeData.type} bonds`);
    },
  });

  const deleteBondPurchaseMutation = trpc.bond.deletePurchase.useMutation({
    onSuccess: (data, variables) => {
      toast.success("Bond purchase deleted!");
      refetchBondHoldings();
      refetchSummary();
      utils.portfolio.getConsolidatedSummary.invalidate();
      utils.bond.getPurchases.invalidate({
        holdingId: variables.holdingId,
        symbol: variables.symbol,
        portfolioId: selectedPortfolioId
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete bond purchase");
    },
  });

  const updateBondHoldingMutation = trpc.bond.updateHolding.useMutation({
    onSuccess: () => {
      refetchBondHoldings();
      refetchSummary();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update bond holding");
    },
  });

  const handleAdjustCashAccountChange = async (accountId: string) => {
    setAdjustCashData(prev => ({ ...prev, accountId }));
  };

  // Helper to format price with automatic decimal point (e.g. 3085 -> 30.85)
  const handlePriceInputChange = (value: string, setter: (val: string) => void, decimals: number = 2) => {
    // Remove all non-digits
    const digits = value.replace(/\D/g, "");
    if (!digits) {
      setter("");
      return;
    }
    const divisor = Math.pow(10, decimals);
    const amount = parseInt(digits, 10) / divisor;
    setter(amount.toFixed(decimals));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  // Helper to fetch and set price based on symbol and date
  const fetchAndSetPrice = async (symbol: string, date: string, isTrade: boolean = false) => {
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
          if (isTrade) {
            setTradeData(prev => ({ ...prev, price: closest.price.toFixed(2) }));
          } else {
            setFormData(prev => ({ ...prev, purchasePrice: closest.price.toFixed(2) }));
          }
        }
      }
    } catch (error) {
      console.error("Error fetching historical price:", error);
    }
  };

  const doesHoldingExistInAccount = useMemo(() => {
    if (!formData.symbol || !formData.accountId || !holdings) return false;
    return holdings.some(h =>
      h.symbol.toUpperCase() === formData.symbol.toUpperCase() &&
      (h as any).accountId.toString() === formData.accountId
    );
  }, [formData.symbol, formData.accountId, holdings]);

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

  const bondLookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleBondSymbolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const symbol = e.target.value.toUpperCase();
    setBondFormData(prev => ({ ...prev, symbol }));
    if (bondLookupTimeoutRef.current) clearTimeout(bondLookupTimeoutRef.current);
    if (symbol.length >= 6) {
      bondLookupTimeoutRef.current = setTimeout(async () => {
        try {
          const res: any = await (utils as any).bond.getPrice.fetch({ symbol });
          if (res?.price) {
            setBondFormData(prev => {
              // only auto-fill if price empty or user hasn't typed price yet
              if (!prev.purchasePrice || prev.purchasePrice === "0" || prev.purchasePrice === "0.00" || prev.purchasePrice === "0.0000") {
                return { ...prev, purchasePrice: res.price };
              }
              return prev;
            });
          }
        } catch {}
      }, 400);
    }
  };

  const handleDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    setFormData(prev => ({ ...prev, purchaseDate: date }));
    await fetchAndSetPrice(formData.symbol, date);
  };

  const handleTradeDateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const date = e.target.value;
    setTradeData(prev => ({ ...prev, purchaseDate: date }));

    if (isTradeDialogOpen) {
      await fetchAndSetPrice(isTradeDialogOpen.symbol, date, false);
    }
  };

  const mergeDateWithCurrentTime = (dateStr: string) => {
    // Treat the input YYYY-MM-DD as UTC Noon
    const [year, month, day] = dateStr.split('-').map(Number);
    const selected = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const now = new Date();
    // Preserve the current time components but keep it at the specified UTC date
    selected.setUTCHours(now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds());
    return selected;
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

    addHoldingMutation.mutate({
      portfolioId: selectedPortfolioId,
      accountId: Number(formData.accountId),
      symbol: formData.symbol,
      name: formData.name,
      quantity: formData.quantity,
      purchasePrice: formData.purchasePrice,
      purchaseDate: mergeDateWithCurrentTime(formData.purchaseDate),
      fees: formData.fees,
      type: formData.type,
    });
  };

  const handleExecuteTrade = async (holdingId: number, symbol: string, accountId?: number) => {
    if (!selectedPortfolioId) {
      toast.error("Please select a portfolio");
      return;
    }
    if (!accountId) {
      toast.error("Please select an account");
      return;
    }
    if (!tradeData.quantity || !tradeData.price) {
      toast.error("Please fill in quantity and price");
      return;
    }

    executeTradeMutation.mutate({
      portfolioId: selectedPortfolioId,
      holdingId,
      symbol,
      accountId,
      quantity: tradeData.quantity,
      price: tradeData.price,
      purchaseDate: mergeDateWithCurrentTime(tradeData.purchaseDate),
      fees: tradeData.fees,
      type: tradeData.type,
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

  // Bond handlers
  const doesBondExistInAccount = useMemo(() => {
    if (!bondFormData.symbol || !bondFormData.accountId || !bondHoldings) return false;
    return bondHoldings.some(h => h.symbol.toUpperCase() === bondFormData.symbol.toUpperCase() && (h as any).accountId.toString() === bondFormData.accountId);
  }, [bondFormData.symbol, bondFormData.accountId, bondHoldings]);

  const handleAddBondHolding = async () => {
    if (!selectedPortfolioId) { toast.error("Please select a portfolio"); return; }
    if (!bondFormData.accountId) { toast.error("Please select an account"); return; }
    if (!bondFormData.symbol || !bondFormData.quantity || !bondFormData.purchasePrice) { toast.error("Please fill in all fields"); return; }
    addBondHoldingMutation.mutate({
      portfolioId: selectedPortfolioId,
      accountId: Number(bondFormData.accountId),
      symbol: bondFormData.symbol,
      name: bondFormData.name || bondFormData.symbol,
      quantity: bondFormData.quantity,
      purchasePrice: bondFormData.purchasePrice,
      purchaseDate: mergeDateWithCurrentTime(bondFormData.purchaseDate),
      redemptionDate: bondFormData.redemptionDate ? mergeDateWithCurrentTime(bondFormData.redemptionDate) : undefined,
      couponRate: bondFormData.couponRate || "0",
      interest: bondFormData.interest || "0",
      fees: bondFormData.fees || "0",
      type: bondFormData.type,
    });
  };

  const handleExecuteBondTrade = async (holdingId: number, symbol: string, accountId?: number) => {
    if (!selectedPortfolioId) { toast.error("Please select a portfolio"); return; }
    if (!accountId) { toast.error("Please select an account"); return; }
    if (!bondTradeData.quantity || !bondTradeData.price) { toast.error("Please fill in quantity and price"); return; }
    executeBondTradeMutation.mutate({
      portfolioId: selectedPortfolioId,
      holdingId,
      symbol,
      accountId,
      quantity: bondTradeData.quantity,
      price: bondTradeData.price,
      purchaseDate: mergeDateWithCurrentTime(bondTradeData.purchaseDate),
      interest: bondTradeData.interest || "0",
      fees: bondTradeData.fees || "0",
      type: bondTradeData.type,
    });
  };

  const handleDeleteBondHolding = (id: number, symbol: string) => {
    if (confirm("Are you sure you want to delete this bond?")) {
      if (id === -1) {
        deleteBondHoldingBySymbolMutation.mutate({ portfolioId: selectedPortfolioId, symbol });
      } else {
        deleteBondHoldingMutation.mutate({ id });
      }
    }
  };

  const handleDeleteBondPurchase = (purchaseId: number, holdingId: number, portfolioId: number, symbol?: string) => {
    if (confirm("Are you sure you want to delete this bond purchase record?")) {
      deleteBondPurchaseMutation.mutate({ purchaseId, holdingId, portfolioId, symbol: symbol || "" });
    }
  };

  const handleDeletePurchase = (purchaseId: number, holdingId: number, portfolioId: number, accountId: number, symbol?: string) => {
    if (confirm("Are you sure you want to delete this purchase record?")) {
      deletePurchaseMutation.mutate({ purchaseId, holdingId, portfolioId, accountId, symbol });
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

  if (accounts && accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] gap-8 p-6 text-center max-w-lg mx-auto">
        <div className="relative">
          <div className="absolute inset-0 bg-primary/10 rounded-full animate-ping" />
          <div className="relative p-6 bg-white rounded-full shadow-xl border-2 border-primary/20">
            <Wallet className="w-12 h-12 text-primary" />
          </div>
        </div>
        
        <div className="space-y-3">
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight">Empty Portfolio</h2>
          <p className="text-slate-500 leading-relaxed">
            This portfolio doesn't have any accounts yet. To start tracking your assets, create your first cash or brokerage account within this portfolio.
          </p>
        </div>

        <Dialog open={isAccountsDialogOpen} onOpenChange={setIsAccountsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="px-10 h-14 text-base font-bold bg-[#004a99] hover:bg-[#003d7a] shadow-lg shadow-blue-900/20 active:scale-95 transition-all">
              <Plus className="w-5 h-5 mr-3" />
              Create First Account
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px] bg-white text-slate-900">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-slate-800">New Account</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 pt-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Account Name</label>
                  <Input
                    placeholder="e.g., Fidelity Brokerage, Personal Savings"
                    value={accountFormData.name}
                    onChange={(e) => setAccountFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="h-12 border-slate-200 focus:border-primary focus:ring-primary shadow-sm"
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Account Number (Optional)</label>
                  <Input
                    placeholder="e.g., x-1234"
                    value={accountFormData.number}
                    onChange={(e) => setAccountFormData(prev => ({ ...prev, number: e.target.value }))}
                    className="h-12 border-slate-200 focus:border-primary focus:ring-primary shadow-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Account Type</label>
                  <Select
                    value={accountFormData.accountType}
                    onValueChange={(value: any) => setAccountFormData(prev => ({ ...prev, accountType: value }))}
                  >
                    <SelectTrigger className="h-12 border-slate-200 focus:ring-primary">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Brokerage">Brokerage</SelectItem>
                      <SelectItem value="Retirement">Retirement</SelectItem>
                      <SelectItem value="Savings">Savings</SelectItem>
                      <SelectItem value="Checking">Checking</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button 
                onClick={() => {
                  if (accountFormData.name) {
                    addAccountMutation.mutate({ 
                      portfolioId: selectedPortfolioId, 
                      name: accountFormData.name,
                      number: accountFormData.number,
                      accountType: accountFormData.accountType
                    });
                  }
                }}
                className="w-full h-12 bg-[#004a99] hover:bg-[#003d7a] font-bold uppercase tracking-wider"
                disabled={!accountFormData.name || addAccountMutation.isPending}
              >
                {addAccountMutation.isPending ? "Initializing..." : "Establish Account"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const subTabs = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
    { id: "activities", label: "Activities", icon: <List className="w-3.5 h-3.5" /> },
    { id: "dividends", label: "Income", icon: <DollarSign className="w-3.5 h-3.5" /> },
    { id: "performance", label: "Performance", icon: <Activity className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-px">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 -mb-px ${activeSubTab === tab.id
              ? "border-primary text-primary bg-primary/5"
              : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === "overview" ? (
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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Type:</span>
                <select
                  className="bg-transparent border-none p-0 text-xs font-bold text-slate-600 focus:outline-none h-6 flex-1 sm:min-w-[100px]"
                  value={selectedAccountType}
                  onChange={(e) => {
                    setSelectedAccountType(e.target.value);
                    setSelectedAccountId(undefined); // Reset specific account filter when type changes
                  }}
                >
                  <option value="all">All Types</option>
                  <option value="Brokerage">Brokerage</option>
                  <option value="Retirement">Retirement</option>
                  <option value="Savings">Savings</option>
                  <option value="Checking">Checking</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100 w-full sm:w-auto">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Account Filter:</span>
                <select
                  className="bg-transparent border-none p-0 text-xs font-bold text-slate-600 focus:outline-none h-6 flex-1 sm:min-w-[140px]"
                  value={selectedAccountId || ""}
                  onChange={(e) => setSelectedAccountId(e.target.value ? Number(e.target.value) : undefined)}
                >
                  <option value="">All {selectedAccountType !== "all" ? selectedAccountType : ""} Accounts</option>
                  {accounts
                    ?.filter((acc: any) => selectedAccountType === "all" || acc.accountType === selectedAccountType)
                    ?.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.name} {acc.number ? `(${acc.number})` : ""}</option>
                    ))}
                </select>
              </div>
            </div>
          </div>

          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
              <div className="data-card border-l-4 border-l-primary">
                <div className="data-card-title">Total Portfolio</div>
                <div className="data-card-value">{formatCurrency(summary?.totalValue)}</div>
                <div className="data-card-subtitle flex items-center gap-1 text-slate-500">
                  <Info className="w-3 h-3" /> Includes Cash
                </div>
              </div>

              <div className="data-card border-l-4 border-l-slate-400">
                <div className="data-card-title">Cash</div>
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

              <div className="data-card border-l-4 border-l-blue-600">
                <div className="data-card-title">Equities</div>
                <div className="data-card-value">{formatCurrency((summary as any)?.equityInvestmentValue ?? summary?.investmentValue)}</div>
                <div className="data-card-subtitle flex items-center justify-between text-slate-500">
                  <span>Stocks & ETFs</span>
                  <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded text-[10px]">
                    {summary?.totalValue && parseFloat(summary.totalValue) > 0
                      ? ((parseFloat((summary as any)?.equityInvestmentValue ?? summary?.investmentValue ?? "0") / parseFloat(summary.totalValue)) * 100).toFixed(1)
                      : "0"}%
                  </span>
                </div>
              </div>

              <div className="data-card border-l-4 border-l-purple-600">
                <div className="data-card-title">Fixed Income</div>
                <div className="data-card-value">{formatCurrency((summary as any)?.fixedIncomeInvestmentValue ?? "0.00")}</div>
                <div className="data-card-subtitle flex items-center justify-between text-slate-500">
                  <span>Bonds & Treasuries</span>
                  <span className="font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded text-[10px]">
                    {summary?.totalValue && parseFloat(summary.totalValue) > 0
                      ? ((parseFloat((summary as any)?.fixedIncomeInvestmentValue ?? "0") / parseFloat(summary.totalValue)) * 100).toFixed(1)
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

            {/* Accounts Table */}
            <Card className="bg-white shadow-sm border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-primary" />
                    Accounts
                  </h2>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-full uppercase tracking-widest">
                    {selectedAccountId ? "1 Account Selected" : `${accounts?.length || 0} Accounts`}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                  <Dialog open={isAccountsDialogOpen} onOpenChange={setIsAccountsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="h-9 text-xs font-bold uppercase tracking-wider border-slate-200 text-slate-600 hover:bg-white hover:text-primary hover:border-primary/30 transition-all flex-1 sm:flex-none">
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        New Account
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Add New Account</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid gap-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Account Name</label>
                            <Input
                              placeholder="e.g. Robinhood"
                              value={accountFormData.name}
                              onChange={(e) => setAccountFormData(prev => ({ ...prev, name: e.target.value }))}
                            />
                          </div>
                          <div className="grid gap-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Number (optional)</label>
                            <Input
                              placeholder="e.g. 1234"
                              value={accountFormData.number}
                              onChange={(e) => setAccountFormData(prev => ({ ...prev, number: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Account Type</label>
                          <Select
                            value={accountFormData.accountType}
                            onValueChange={(value: any) => setAccountFormData(prev => ({ ...prev, accountType: value }))}
                          >
                            <SelectTrigger className="h-10 border-slate-200">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Brokerage">Brokerage</SelectItem>
                              <SelectItem value="Retirement">Retirement</SelectItem>
                              <SelectItem value="Savings">Savings</SelectItem>
                              <SelectItem value="Checking">Checking</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          className="w-full h-10 font-bold uppercase tracking-wider"
                          disabled={addAccountMutation.isPending || !accountFormData.name}
                          onClick={() => addAccountMutation.mutate({
                            portfolioId: selectedPortfolioId,
                            name: accountFormData.name,
                            number: accountFormData.number,
                            accountType: accountFormData.accountType
                          })}
                        >
                          {addAccountMutation.isPending ? "Adding..." : "Create Account"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-border">
                      <th className="w-10"></th>
                      <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Account</th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Total Value</th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Cash Balance</th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Investments</th>
                      <th className="text-center py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts
                      ?.filter((a: any) => {
                        if (selectedAccountId) return a.id === selectedAccountId;
                        if (selectedAccountType !== "all") return a.accountType === selectedAccountType;
                        return true;
                      })
                      ?.map((account: any) => {
                      const accDetails = (summary as any)?.accountSummaries?.[account.id] || { investmentValue: "0.00", cashValue: "0.00", totalValue: "0.00", assets: [] };
                      const totalVal = parseFloat(accDetails.totalValue);
                      const invPercent = totalVal > 0 ? ((parseFloat(accDetails.investmentValue) / totalVal) * 100).toFixed(1) : "0";
                      const cashPercent = totalVal > 0 ? ((parseFloat(accDetails.cashValue) / totalVal) * 100).toFixed(1) : "0";
                      const isExpanded = expandedAccounts.has(account.id);

                      return (
                        <React.Fragment key={account.id}>
                          <tr className="border-b border-border hover:bg-slate-50 transition-colors">
                            <td className="text-center">
                              <button 
                                onClick={() => toggleAccountExpand(account.id)}
                                className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-400 hover:text-slate-600"
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                              </button>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2">
                                <div className="font-bold text-slate-800">{account.name}</div>
                                {account.accountType && (
                                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                    {account.accountType}
                                  </span>
                                )}
                              </div>
                              {account.number && <div className="text-[10px] text-slate-500 font-mono mt-0.5">{account.number}</div>}
                            </td>
                            <td className="py-4 px-6 text-right font-mono font-bold text-primary">
                              {formatCurrency(truncateNumber(parseFloat(accDetails.totalValue)))}
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="font-mono font-medium text-slate-600">{formatCurrency(truncateNumber(parseFloat(accDetails.cashValue)))}</div>
                              <div className="text-[9px] font-bold text-slate-400 uppercase">{cashPercent}%</div>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="font-mono font-medium text-green-600">{formatCurrency(truncateNumber(parseFloat(accDetails.investmentValue)))}</div>
                              <div className="text-[9px] font-bold text-slate-400 uppercase">{invPercent}%</div>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center justify-center">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary">
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-56">
                                    <DropdownMenuLabel>Manage Account</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setEditingAccount({ 
                                      id: account.id, 
                                      name: account.name, 
                                      number: account.number || "",
                                      accountType: account.accountType || "Brokerage"
                                    })}>
                                      <Edit2 className="mr-2 h-4 w-4 text-slate-500" />
                                      <span>Edit Account</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                      setMovingAccount({
                                        id: account.id,
                                        name: account.name,
                                        portfolioId: account.portfolioId,
                                      });
                                      setTargetPortfolioId("");
                                    }}>
                                      <ArrowLeftRight className="mr-2 h-4 w-4 text-blue-600" />
                                      <span>Move Account</span>
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => {
                                      setAdjustCashData({
                                        accountId: account.id.toString(),
                                        amount: "",
                                        type: "deposit",
                                        description: "",
                                        date: formatDate(new Date())
                                      });
                                      setIsAdjustCashDialogOpen(true);
                                    }}>
                                      <ArrowUpCircle className="mr-2 h-4 w-4 text-green-600" />
                                      <span>Deposit Cash</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => {
                                      setAdjustCashData({
                                        accountId: account.id.toString(),
                                        amount: "",
                                        type: "withdrawal",
                                        description: "",
                                        date: formatDate(new Date())
                                      });
                                      setIsAdjustCashDialogOpen(true);
                                    }}>
                                      <ArrowDownCircle className="mr-2 h-4 w-4 text-red-600" />
                                      <span>Withdraw Cash</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setCashHistoryOpen({ id: account.id, name: account.name })}>
                                      <History className="mr-2 h-4 w-4 text-slate-500" />
                                      <span>View Cash History</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => {
                                        if (confirm("Delete this account? Associated holdings will remain but lose their account link.")) {
                                          deleteAccountMutation.mutate({ id: account.id });
                                        }
                                      }}
                                      className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      <span>Delete Account</span>
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </td>
                          </tr>

                          {/* Account Assets Breakdown Rows */}
                          {isExpanded && (
                            <tr className="bg-slate-50/50">
                              <td colSpan={7} className="p-0">
                                <div className="p-4 pl-12 bg-slate-100/10">
                                  <table className="w-full text-[11px]">
                                    <thead>
                                      <tr className="border-b border-slate-200">
                                        <th className="text-left py-2 px-3 text-slate-500 font-bold uppercase text-[9px] tracking-widest">Asset</th>
                                        <th className="text-right py-2 px-3 text-slate-500 font-bold uppercase text-[9px] tracking-widest">Qty</th>
                                        <th className="text-right py-2 px-3 text-slate-500 font-bold uppercase text-[9px] tracking-widest">Avg Cost</th>
                                        <th className="text-right py-2 px-3 text-slate-500 font-bold uppercase text-[9px] tracking-widest">Total Cost</th>
                                        <th className="text-right py-2 px-3 text-slate-500 font-bold uppercase text-[9px] tracking-widest">Mkt Price</th>
                                        <th className="text-right py-2 px-3 text-slate-500 font-bold uppercase text-[9px] tracking-widest">Mkt Value</th>
                                        <th className="text-right py-2 px-3 text-slate-500 font-bold uppercase text-[9px] tracking-widest">Gain/Loss</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {accDetails.assets?.map((asset: any) => {
                                        const isGain = parseFloat(asset.gain) >= 0;
                                        return (
                                          <tr key={`${account.id}-${asset.symbol}`} className="hover:bg-slate-50 transition-colors">
                                            <td className="py-2.5 px-3">
                                              <div className="flex flex-col">
                                                <span className="font-bold text-primary">{asset.symbol}</span>
                                                <span className="text-[9px] text-slate-400 truncate max-w-[150px]">{asset.name}</span>
                                              </div>
                                            </td>
                                            <td className="text-right py-2.5 px-3 font-mono">{formatNumber(asset.quantity, 3)}</td>
                                            <td className="text-right py-2.5 px-3 font-mono text-slate-500">{formatCurrency(truncateNumber(parseFloat(asset.averageCost)))}</td>
                                            <td className="text-right py-2.5 px-3 font-mono text-slate-500">{formatCurrency(truncateNumber(parseFloat(asset.totalCost)))}</td>
                                            <td className="text-right py-2.5 px-3 font-mono text-slate-500">{formatCurrency(truncateNumber(parseFloat(asset.currentPrice)))}</td>
                                            <td className="text-right py-2.5 px-3 font-mono font-bold text-slate-700">{formatCurrency(truncateNumber(parseFloat(asset.currentValue)))}</td>
                                            <td className={`text-right py-2.5 px-3 font-mono font-bold ${isGain ? "text-green-600/80" : "text-red-600/80"}`}>
                                              <div>{isGain ? "+" : ""}{formatCurrency(truncateNumber(parseFloat(asset.gain)))}</div>
                                              <div className="text-[9px]">{isGain ? "+" : ""}{asset.gainPercent}%</div>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                      {(!accDetails.assets || accDetails.assets.length === 0) && (
                                        <tr>
                                          <td colSpan={7} className="py-6 text-center text-slate-400 italic bg-white/50">
                                            No assets tracked in this account.
                                          </td>
                                        </tr>
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {(!accounts || accounts.length === 0) && (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-slate-400 italic">
                          No accounts found for this portfolio.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {accounts && accounts.length > 0 && !selectedAccountId && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr className="font-bold text-slate-800">
                        <td colSpan={2} className="py-4 px-6 uppercase text-[10px] tracking-widest text-slate-500">Portfolio Totals</td>
                        <td className="text-right py-4 px-6 font-mono text-sm text-primary">
                          {formatCurrency(truncateNumber(parseFloat(summary?.totalValue || "0")))}
                        </td>
                        <td className="text-right py-4 px-6">
                          <div className="font-mono text-sm text-slate-700">{formatCurrency(truncateNumber(parseFloat(summary?.cashBalance || "0")))}</div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase">
                            {summary?.totalValue && parseFloat(summary.totalValue) > 0 ? ((parseFloat(summary.cashBalance) / parseFloat(summary.totalValue)) * 100).toFixed(1) : "0"}%
                          </div>
                        </td>
                        <td className="text-right py-4 px-6">
                          <div className="font-mono text-sm text-green-700">{formatCurrency(truncateNumber(parseFloat(summary?.investmentValue || "0")))}</div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase">
                            {summary?.totalValue && parseFloat(summary.totalValue) > 0 ? ((parseFloat(summary.investmentValue) / parseFloat(summary.totalValue)) * 100).toFixed(1) : "0"}%
                          </div>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>

            {/* Edit Account Dialog */}
            <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Edit Account</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Account Name</label>
                    <Input
                      value={editingAccount?.name || ""}
                      onChange={(e) => setEditingAccount(prev => prev ? { ...prev, name: e.target.value } : null)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Account Number</label>
                    <Input
                      value={editingAccount?.number || ""}
                      onChange={(e) => setEditingAccount(prev => prev ? { ...prev, number: e.target.value } : null)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Account Type</label>
                    <Select
                      value={editingAccount?.accountType}
                      onValueChange={(value: any) => setEditingAccount(prev => prev ? { ...prev, accountType: value } : null)}
                    >
                      <SelectTrigger className="h-10 border-slate-200">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Brokerage">Brokerage</SelectItem>
                        <SelectItem value="Retirement">Retirement</SelectItem>
                        <SelectItem value="Savings">Savings</SelectItem>
                        <SelectItem value="Checking">Checking</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    className="w-full h-10 font-bold uppercase tracking-wider"
                    disabled={updateAccountMutation.isPending || !editingAccount?.name}
                    onClick={() => editingAccount && updateAccountMutation.mutate({
                      id: editingAccount.id,
                      name: editingAccount.name,
                      number: editingAccount.number,
                      accountType: editingAccount.accountType as any
                    })}
                  >
                    Save Changes
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Move Account Dialog */}
            <Dialog open={!!movingAccount} onOpenChange={(open) => !open && setMovingAccount(null)}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Move Account: {movingAccount?.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Destination Portfolio</label>
                    <Select
                      value={targetPortfolioId}
                      onValueChange={setTargetPortfolioId}
                    >
                      <SelectTrigger className="h-10 border-slate-200">
                        <SelectValue placeholder="Select Destination Portfolio" />
                      </SelectTrigger>
                      <SelectContent>
                        {portfolios
                          ?.filter((p: any) => p.id !== movingAccount?.portfolioId)
                          ?.map((p: any) => (
                            <SelectItem key={p.id} value={p.id.toString()}>
                              {p.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 justify-end pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setMovingAccount(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={moveAccountMutation.isPending || !targetPortfolioId}
                      onClick={() => {
                        if (movingAccount && targetPortfolioId) {
                          moveAccountMutation.mutate({
                            accountId: movingAccount.id,
                            targetPortfolioId: parseInt(targetPortfolioId, 10),
                          });
                        }
                      }}
                    >
                      {moveAccountMutation.isPending ? "Moving..." : "Save"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>


            {/* Main Holdings Table */}
            <Card className="bg-white shadow-sm border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    Equities
                  </h2>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-full uppercase tracking-widest">{summary?.holdings?.filter((h:any)=> !h.assetType || h.assetType==="etf").length || 0} Assets</span>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
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
                        fees: "",
                        type: "buy",
                      });

                    } else if (accounts && accounts.length > 0 && !formData.accountId) {
                      setFormData(prev => ({ ...prev, accountId: accounts[0].id.toString() }));
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/10 text-xs font-bold uppercase tracking-wider h-9 flex-1 sm:flex-none">
                        <TrendingUp className="mr-2 h-3.5 w-3.5" />
                        Add Trade
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Add Trade</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="grid gap-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Trade Type</label>
                          <div className="flex bg-slate-100 p-1 rounded-md">
                            <button
                              onClick={() => setFormData(prev => ({ ...prev, type: "buy" }))}
                              className={`flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-all ${formData.type === "buy" ? "bg-white text-primary" : "text-slate-500 hover:text-slate-700"}`}
                            >
                              BUY
                            </button>
                            <button
                              onClick={() => setFormData(prev => ({ ...prev, type: "sell" }))}
                              className={`flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-all ${formData.type === "sell" ? "bg-white text-destructive" : "text-slate-500 hover:text-slate-700"}`}
                            >
                              SELL
                            </button>
                          </div>
                        </div>
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
                        {formData.type === "buy" && !doesHoldingExistInAccount && (
                          <div className="grid gap-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Investment Name</label>
                            <Input placeholder="Vanguard S&P 500 ETF" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} />
                          </div>
                        )}
                        <div className="grid gap-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Trade Date</label>
                          <Input type="date" value={formData.purchaseDate} onChange={handleDateChange} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Quantity</label>
                            <Input ref={quantityInputRef} type="number" step="0.001" value={formData.quantity} onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))} />
                          </div>
                          <div className="grid gap-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Price per Share</label>
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={formData.purchasePrice}
                              onFocus={handleFocus}
                              onChange={(e) => handlePriceInputChange(e.target.value, (val) => setFormData(prev => ({ ...prev, purchasePrice: val })))}
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Fees</label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={formData.fees}
                            onFocus={handleFocus}
                            onChange={(e) => handlePriceInputChange(e.target.value, (val) => setFormData(prev => ({ ...prev, fees: val })))}
                          />
                        </div>
                        <div className="grid gap-2 p-3 bg-slate-50 rounded-md border border-slate-100">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            Estimated Transaction Total
                          </label>
                          <div className="text-lg font-mono font-bold text-slate-700">
                            {formatCurrency(
                              (parseFloat(formData.quantity || "0") * parseFloat(formData.purchasePrice || "0")) +
                              (formData.type === "buy" ? parseFloat(formData.fees || "0") : -parseFloat(formData.fees || "0"))
                            )}
                          </div>
                        </div>
                        <Button
                          onClick={handleAddHolding}
                          className={`w-full mt-2 ${formData.type === "sell" ? "bg-destructive hover:bg-destructive/90" : ""}`}
                          disabled={addHoldingMutation.isPending}
                        >
                          Confirm {formData.type === "buy" ? "Purchase" : "Sale"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Button 
                    size="sm" 
                    onClick={() => setIsGeneralCSVImportOpen(true)}
                    className="bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/10 text-xs font-bold uppercase tracking-wider h-9 flex-1 sm:flex-none"
                  >
                    <FileUp className="mr-2 h-3.5 w-3.5" />
                    Import Trades
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-border">
                      <th className="w-8"></th>
                      <th
                        className="text-left py-3 px-3 text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => requestSort("symbol")}
                      >
                        <div className="flex items-center gap-1">
                          Asset
                          {sortConfig?.key === "symbol" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th
                        className="text-right py-3 px-3 text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => requestSort("quantity")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Qty
                          {sortConfig?.key === "quantity" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th
                        className="text-right py-3 px-3 text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => requestSort("averageCost")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Avg Cost
                          {sortConfig?.key === "averageCost" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th
                        className="text-right py-3 px-3 text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => requestSort("totalCost")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Total Cost
                          {sortConfig?.key === "totalCost" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th
                        className="text-right py-3 px-3 text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => requestSort("currentPrice")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Mkt Price
                          {sortConfig?.key === "currentPrice" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th
                        className="text-right py-3 px-3 text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => requestSort("currentValue")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Mkt Value
                          {sortConfig?.key === "currentValue" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th
                        className="text-right py-3 px-3 text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => requestSort("gain")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Gain/Loss
                          {sortConfig?.key === "gain" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th
                        className="text-right py-3 px-3 text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => requestSort("gainPercent")}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Gain/Loss %
                          {sortConfig?.key === "gainPercent" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th className="text-right py-3 px-3 text-slate-600">Allocation</th>
                      <th className="text-center py-3 px-3 text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHoldings.map((holding: any) => {
                      const allocation = summary?.investmentAllocationBreakdown?.find((a: any) => a.symbol === holding.symbol);
                      const isGain = parseFloat(holding.gain) >= 0;
                      const isUnderWeight = parseFloat(allocation?.percentage || "0") < (parseFloat(holding.desiredAllocation) || 0);
                      const isConsolidated = holding.isConsolidated || holding.id === -1;
                      const isExpanded = expandedHoldings.has(holding.symbol);

                      return (
                        <React.Fragment key={isConsolidated ? `consolidated-${holding.symbol}` : holding.id}>
                          <tr className="border-b border-border hover:bg-slate-50 transition-colors group text-sm">
                            <td className="text-center">
                              {isConsolidated && (
                                <button 
                                  onClick={() => toggleHoldingExpand(holding.symbol)}
                                  className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-400 hover:text-slate-600"
                                >
                                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                              )}
                            </td>
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
                                  <DropdownMenuItem onClick={() => setIsTradeDialogOpen({ id: holding.id, symbol: holding.symbol })}>
                                    <TrendingUp className="mr-2 h-4 w-4 text-slate-500" />
                                    <span>Add Trade</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => {
                                    setIsTransferDialogOpen({ id: holding.id, symbol: holding.symbol, accountId: holding.accountId });
                                    setTransferData({
                                      sourceAccountId: (holding as any).accountId?.toString() || "",
                                      targetPortfolioId: "",
                                      targetAccountId: "",
                                      selectedPurchaseIds: new Set(),
                                    });
                                  }}>
                                    <ArrowLeftRight className="mr-2 h-4 w-4 text-slate-500" />
                                    <span>Transfer Asset</span>
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
                                    <span>Delete {isConsolidated ? "All Records" : "Investment"}</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </td>
                          </tr>

                          {/* Account Breakdown Rows */}
                          {isExpanded && holding.accountBreakdown?.map((breakdown: any) => {
                            const bdIsGain = parseFloat(breakdown.gain) >= 0;
                            return (
                              <tr key={breakdown.id} className="bg-slate-50/30 border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td></td>
                                <td className="py-2 px-3 pl-6">
                                  <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight truncate max-w-[120px]">
                                      {breakdown.accountName}
                                    </span>
                                  </div>
                                </td>
                                <td className="text-right py-2 px-3 font-mono text-[10px] text-slate-500">{formatNumber(breakdown.quantity, 3)}</td>
                                <td className="text-right py-2 px-3 font-mono text-[10px] text-slate-400">{formatCurrency(breakdown.averageCost)}</td>
                                <td className="text-right py-2 px-3 font-mono text-[10px] text-slate-400">{formatCurrency(breakdown.totalCost)}</td>
                                <td className="text-right py-2 px-3 font-mono text-[10px] text-slate-400">{formatCurrency(breakdown.currentPrice)}</td>
                                <td className="text-right py-2 px-3 font-mono text-[10px] text-slate-600 font-bold">{formatCurrency(breakdown.currentValue)}</td>
                                <td className={`text-right py-2 px-3 font-mono text-[10px] font-bold ${bdIsGain ? "text-green-600/80" : "text-red-600/80"}`}>
                                  {bdIsGain ? "+" : ""}{formatCurrency(breakdown.gain)}
                                </td>
                                <td className={`text-right py-2 px-3 font-mono text-[10px] font-bold ${bdIsGain ? "text-green-600/80" : "text-red-600/80"}`}>
                                  {bdIsGain ? "+" : ""}{breakdown.gainPercent}%
                                </td>
                                <td></td>
                                <td className="py-2 px-3">
                                  <div className="flex items-center justify-center">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-primary">
                                          <MoreVertical className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-48">
                                        <DropdownMenuItem onClick={() => setIsTradeDialogOpen({ id: breakdown.id, symbol: holding.symbol })}>
                                          <TrendingUp className="mr-2 h-3.5 w-3.5 text-slate-500" />
                                          <span className="text-xs">Add Trade</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => {
                                          setIsTransferDialogOpen({ id: breakdown.id, symbol: holding.symbol, accountId: breakdown.accountId });
                                          setTransferData({
                                            sourceAccountId: breakdown.accountId.toString(),
                                            targetPortfolioId: "",
                                            targetAccountId: "",
                                            selectedPurchaseIds: new Set(),
                                          });
                                        }}>
                                          <ArrowLeftRight className="mr-2 h-3.5 w-3.5 text-slate-500" />
                                          <span className="text-xs">Transfer Asset</span>
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setIsCSVImportOpen({ id: breakdown.id, symbol: holding.symbol })}>
                                          <FileUp className="mr-2 h-3.5 w-3.5 text-slate-500" />
                                          <span className="text-xs">Import Purchases</span>
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  {summary?.holdings && summary.holdings.filter((h:any)=> !h.assetType || h.assetType==="etf").length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr className="font-bold text-slate-800">
                        <td colSpan={6} className="py-4 px-3 uppercase text-[10px] tracking-widest text-slate-500">Total Equities Performance</td>
                        <td className="text-right py-4 px-3 font-mono text-sm">{formatCurrency((summary as any).equityInvestmentValue ?? summary.investmentValue)}</td>
                        <td className={`text-right py-4 px-3 font-mono text-sm ${(summary?.holdings?.filter((h:any)=> !h.assetType || h.assetType==="etf").reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0) >= 0
                          ? "text-green-600"
                          : "text-red-600"
                          }`}>
                          {(summary?.holdings?.filter((h:any)=> !h.assetType || h.assetType==="etf").reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0) >= 0 ? "+" : ""}
                          {formatCurrency(summary?.holdings?.filter((h:any)=> !h.assetType || h.assetType==="etf").reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0)}
                        </td>
                        <td className={`text-right py-4 px-3 font-mono text-sm ${((summary?.holdings?.filter((h:any)=> !h.assetType || h.assetType==="etf").reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0) /
                          (summary?.holdings?.filter((h:any)=> !h.assetType || h.assetType==="etf").reduce((acc: number, h: any) => acc + (parseFloat(h.averageCost || h.purchasePrice) * parseFloat(h.quantity)), 0) || 1) * 100) >= 0
                          ? "text-green-600"
                          : "text-red-600"
                          }`}>
                          {(
                            ((summary?.holdings?.filter((h:any)=> !h.assetType || h.assetType==="etf").reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0) /
                              (summary?.holdings?.filter((h:any)=> !h.assetType || h.assetType==="etf").reduce((acc: number, h: any) => acc + (parseFloat(h.averageCost || h.purchasePrice) * parseFloat(h.quantity)), 0) || 1)) * 100
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

            {/* Bonds / Treasuries Section */}
            <Card className="bg-white shadow-sm border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-primary" />
                    Fixed Income
                  </h2>
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-full uppercase tracking-widest">{bondHoldings?.length || 0} Issues</span>
                </div>
                <div className="flex items-center gap-3">
                  <Dialog open={isAddBondDialogOpen} onOpenChange={(open) => {
                    setIsAddBondDialogOpen(open);
                    if (!open) {
                      setBondFormData({
                        symbol: "",
                        name: "",
                        quantity: "",
                        purchasePrice: "",
                        purchaseDate: defaultDate,
                        redemptionDate: "",
                        couponRate: "",
                        accountId: accounts?.[0]?.id.toString() || "",
                        interest: "",
                        fees: "",
                        type: "buy",
                      });
                    } else if (accounts && accounts.length > 0 && !bondFormData.accountId) {
                      setBondFormData(prev => ({ ...prev, accountId: accounts[0].id.toString() }));
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/10 text-xs font-bold uppercase tracking-wider h-9">
                        <Plus className="mr-2 h-3.5 w-3.5" />
                        Add Bond
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>Add Bond / Treasury</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="grid gap-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Trade Type</label>
                          <div className="flex bg-slate-100 p-1 rounded-md">
                            <button onClick={() => setBondFormData(prev => ({ ...prev, type: "buy" }))} className={`flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-all ${bondFormData.type === "buy" ? "bg-white text-primary" : "text-slate-500 hover:text-slate-700"}`}>BUY</button>
                            <button onClick={() => setBondFormData(prev => ({ ...prev, type: "sell" }))} className={`flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-all ${bondFormData.type === "sell" ? "bg-white text-destructive" : "text-slate-500 hover:text-slate-700"}`}>SELL / REDEEM</button>
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Account</label>
                          <select className="bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary h-10" value={bondFormData.accountId} onChange={(e) => setBondFormData(prev => ({ ...prev, accountId: e.target.value }))}>
                            {accounts?.map((acc: any) => (<option key={acc.id} value={acc.id}>{acc.name} {acc.number ? `(${acc.number})` : ""}</option>))}
                          </select>
                        </div>
                        <div className="grid gap-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">CUSIP (Symbol)</label>
                          <Input placeholder="e.g., 91282CAZ4" value={bondFormData.symbol} onChange={handleBondSymbolChange} className="uppercase" />
                        </div>
                        {bondFormData.type === "buy" && !doesBondExistInAccount && (
                          <div className="grid gap-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Bond Name</label>
                            <Input placeholder="US Treasury Note 1.5% 2028" value={bondFormData.name} onChange={(e) => setBondFormData(prev => ({ ...prev, name: e.target.value }))} />
                          </div>
                        )}
                        <div className="grid gap-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Purchase Date</label>
                          <Input type="date" value={bondFormData.purchaseDate} onChange={(e) => setBondFormData(prev => ({ ...prev, purchaseDate: e.target.value }))} />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Redemption Date (Maturity)</label>
                          <Input type="date" value={bondFormData.redemptionDate} onChange={(e) => setBondFormData(prev => ({ ...prev, redemptionDate: e.target.value }))} />
                        </div>
                        <div className="grid gap-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Yearly Interest Rate (%)</label>
                          <Input type="number" step="0.001" placeholder="4.125" value={bondFormData.couponRate} onChange={(e) => setBondFormData(prev => ({ ...prev, couponRate: e.target.value }))} />
                          {bondFormData.redemptionDate && bondFormData.couponRate && parseFloat(bondFormData.couponRate) > 0 && bondFormData.quantity && (
                            <div className="text-[10px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100">
                              Coupon {formatCurrency(parseFloat(bondFormData.quantity || "0") * parseFloat(bondFormData.couponRate) / 2)} every {new Date(bondFormData.redemptionDate).toLocaleDateString(undefined,{month:"2-digit",day:"2-digit"})} & {(() => { const d=new Date(bondFormData.redemptionDate); const nd=new Date(d); nd.setMonth(d.getMonth()+6); return nd.toLocaleDateString(undefined,{month:"2-digit",day:"2-digit"}); })()} until {new Date(bondFormData.redemptionDate).toLocaleDateString()}
                            </div>
                          )}
                          {bondFormData.redemptionDate && bondFormData.couponRate && (
                            <div className="text-[9px] text-slate-400">Paid twice a year on redemption anniversary (e.g. 02/15 & 08/15)</div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Quantity</label>
                            <Input type="number" step="0.001" value={bondFormData.quantity} onChange={(e) => setBondFormData(prev => ({ ...prev, quantity: e.target.value }))} />
                          </div>
                          <div className="grid gap-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Price per Bond</label>
                            <Input type="text" inputMode="decimal" value={bondFormData.purchasePrice} onFocus={handleFocus} onChange={(e) => handlePriceInputChange(e.target.value, (val) => setBondFormData(prev => ({ ...prev, purchasePrice: val })), 4)} placeholder="0.0000" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Accrued Interest (optional)</label>
                            <Input type="text" inputMode="decimal" placeholder="0.00" value={bondFormData.interest} onFocus={handleFocus} onChange={(e) => handlePriceInputChange(e.target.value, (val) => setBondFormData(prev => ({ ...prev, interest: val })))} />
                          </div>
                          <div className="grid gap-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Fees</label>
                            <Input type="text" inputMode="decimal" placeholder="0.00" value={bondFormData.fees} onFocus={handleFocus} onChange={(e) => handlePriceInputChange(e.target.value, (val) => setBondFormData(prev => ({ ...prev, fees: val })))} />
                          </div>
                        </div>
                        <div className="text-[10px] text-slate-400">Interest is added to total cost: quantity × price + interest + fees</div>
                        <div className="grid gap-2 p-3 bg-slate-50 rounded-md border border-slate-100">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estimated Transaction Total</label>
                          <div className="text-lg font-mono font-bold text-slate-700">
                            {formatCurrency((parseFloat(bondFormData.quantity || "0") * parseFloat(bondFormData.purchasePrice || "0")) + parseFloat(bondFormData.interest || "0") + (bondFormData.type === "buy" ? parseFloat(bondFormData.fees || "0") : -parseFloat(bondFormData.fees || "0")))}
                          </div>
                        </div>
                        <Button onClick={handleAddBondHolding} className={`w-full mt-2 ${bondFormData.type === "sell" ? "bg-destructive hover:bg-destructive/90" : ""}`} disabled={addBondHoldingMutation.isPending}>
                          Confirm {bondFormData.type === "buy" ? "Purchase" : "Sale / Redemption"}
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
                      <th className="text-left py-3 px-3 text-slate-600 text-xs font-bold uppercase">CUSIP</th>
                      <th className="text-right py-3 px-3 text-slate-600 text-xs font-bold uppercase">Qty</th>
                      <th className="text-right py-3 px-3 text-slate-600 text-xs font-bold uppercase">Avg Cost</th>
                      <th className="text-right py-3 px-3 text-slate-600 text-xs font-bold uppercase">Total Cost</th>
                      <th className="text-right py-3 px-3 text-slate-600 text-xs font-bold uppercase">Price</th>
                      <th className="text-right py-3 px-3 text-slate-600 text-xs font-bold uppercase">Market Value</th>
                      <th className="text-right py-3 px-3 text-slate-600 text-xs font-bold uppercase">Gain/Loss</th>
                      <th className="text-right py-3 px-3 text-slate-600 text-xs font-bold uppercase">Gain/Loss %</th>
                      <th className="text-right py-3 px-3 text-slate-600 text-xs font-bold uppercase">Coupon</th>
                      <th className="text-right py-3 px-3 text-slate-600 text-xs font-bold uppercase">Annual Interest</th>
                      <th className="text-left py-3 px-3 text-slate-600 text-xs font-bold uppercase">Redemption</th>
                      <th className="text-center py-3 px-3 text-slate-600 text-xs font-bold uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBondHoldings.length === 0 ? (
                      <tr><td colSpan={12} className="py-10 text-center text-slate-400 text-sm">No bonds yet. Use Add Bond to buy a Treasury.</td></tr>
                    ) : sortedBondHoldings.map((holding: any) => (
                      <tr key={holding.id} className="border-b border-border hover:bg-slate-50 transition-colors text-sm">
                        <td className="py-3 px-3">
                          <div className="font-bold text-primary text-sm leading-tight">{holding.symbol}</div>
                          <div className="text-slate-500 text-[10px] leading-tight">{holding.name}</div>
                          {holding.redemptionDate && <div className="text-[10px] text-slate-400">Matures {new Date(holding.redemptionDate).toLocaleDateString()}</div>}
                        </td>
                        <td className="text-right py-3 px-3 font-mono text-xs">{formatNumber(holding.quantity, 3)}</td>
                        <td className="text-right py-3 px-3 font-mono text-xs text-slate-600">{formatCurrency(holding.averageCost || holding.purchasePrice, 4)}</td>
                        <td className="text-right py-3 px-3 font-mono text-xs text-slate-600">{formatCurrency((parseFloat(holding.quantity) * parseFloat(holding.averageCost || holding.purchasePrice)).toFixed(2))}</td>
                        <td className="text-right py-3 px-3 font-mono text-xs text-slate-600">{formatCurrency(holding.currentPrice, 4)}</td>
                        <td className="text-right py-3 px-3 font-mono text-xs font-bold">{formatCurrency((parseFloat(holding.quantity) * parseFloat(holding.currentPrice)).toFixed(2))}</td>
                        <td className={`text-right py-3 px-3 font-mono text-xs font-bold ${(parseFloat(holding.quantity) * parseFloat(holding.currentPrice) - parseFloat(holding.quantity) * parseFloat(holding.averageCost || holding.purchasePrice)) >= 0 ? "text-green-600" : "text-red-600"}`}>{(parseFloat(holding.quantity) * parseFloat(holding.currentPrice) - parseFloat(holding.quantity) * parseFloat(holding.averageCost || holding.purchasePrice)) >= 0 ? "+" : ""}{formatCurrency((parseFloat(holding.quantity) * parseFloat(holding.currentPrice) - parseFloat(holding.quantity) * parseFloat(holding.averageCost || holding.purchasePrice)).toFixed(2))}</td>
                        <td className={`text-right py-3 px-3 font-mono text-xs font-bold ${(parseFloat(holding.quantity) * parseFloat(holding.averageCost || holding.purchasePrice)) > 0 ? ((parseFloat(holding.quantity) * parseFloat(holding.currentPrice) - parseFloat(holding.quantity) * parseFloat(holding.averageCost || holding.purchasePrice)) / (parseFloat(holding.quantity) * parseFloat(holding.averageCost || holding.purchasePrice)) * 100) >= 0 ? "text-green-600" : "text-red-600" : "text-slate-400"}`}>{(parseFloat(holding.quantity) * parseFloat(holding.averageCost || holding.purchasePrice)) > 0 ? (((parseFloat(holding.quantity) * parseFloat(holding.currentPrice) - parseFloat(holding.quantity) * parseFloat(holding.averageCost || holding.purchasePrice)) / (parseFloat(holding.quantity) * parseFloat(holding.averageCost || holding.purchasePrice)) * 100).toFixed(2) + "%") : "-"}</td>
                        <td className="text-right py-3 px-3 font-mono text-xs text-slate-600">{holding.couponRate && parseFloat(holding.couponRate) > 0 ? `${parseFloat(holding.couponRate).toFixed(3)}%` : "-"}</td>
                        <td className="text-right py-3 px-3 font-mono text-xs font-bold text-green-600">{holding.couponRate && parseFloat(holding.couponRate) > 0 ? formatCurrency(parseFloat(holding.quantity) * parseFloat(holding.couponRate)) : "-"}</td>
                        <td className="py-3 px-3 text-xs text-slate-600">{holding.redemptionDate ? formatUTCDate(new Date(holding.redemptionDate)) : "-"}</td>
                        <td className="text-center py-3 px-3">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsBondTradeDialogOpen({ id: holding.id, symbol: holding.symbol })}>Trade</Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setBondPurchaseHistoryOpen({ id: holding.id, symbol: holding.symbol })}><History className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => handleDeleteBondHolding(holding.id, holding.symbol)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {sortedBondHoldings.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr className="font-bold text-slate-800">
                        <td colSpan={3} className="py-4 px-3 uppercase text-[10px] tracking-widest text-slate-500">Total Bonds Performance</td>
                        <td className="text-right py-4 px-3 font-mono text-sm">{formatCurrency(sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.averageCost || h.purchasePrice), 0).toFixed(2))}</td>
                        <td className="text-right py-4 px-3"></td>
                        <td className="text-right py-4 px-3 font-mono text-sm">{formatCurrency(sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.currentPrice), 0).toFixed(2))}</td>
                        <td className={`text-right py-4 px-3 font-mono text-sm ${(sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.currentPrice), 0) - sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.averageCost || h.purchasePrice), 0)) >= 0 ? "text-green-600" : "text-red-600"}`}>{(sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.currentPrice), 0) - sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.averageCost || h.purchasePrice), 0)) >= 0 ? "+" : ""}{formatCurrency((sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.currentPrice), 0) - sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.averageCost || h.purchasePrice), 0)).toFixed(2))}</td>
                        <td className={`text-right py-4 px-3 font-mono text-sm ${(sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.averageCost || h.purchasePrice), 0) > 0 ? ((sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.currentPrice), 0) - sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.averageCost || h.purchasePrice), 0)) / sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.averageCost || h.purchasePrice), 0) * 100) >= 0 ? "text-green-600" : "text-red-600" : "text-slate-400")}`}>{sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.averageCost || h.purchasePrice), 0) > 0 ? (((sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.currentPrice), 0) - sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.averageCost || h.purchasePrice), 0)) / sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.averageCost || h.purchasePrice), 0) * 100).toFixed(2) + "%") : "-"}</td>
                        <td className="text-right py-4 px-3"></td>
                        <td className="text-right py-4 px-3 font-mono text-sm text-green-600">{formatCurrency(sortedBondHoldings.reduce((acc: number, h: any) => acc + parseFloat(h.quantity) * parseFloat(h.couponRate || "0"), 0).toFixed(2))}</td>
                        <td className="py-4 px-3"></td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>

            {/* Allocation & Management Grid */}
            <div className="grid grid-cols-1 gap-8">
              {/* Account Type Allocation Pie Chart */}
              {(summary as any)?.accountTypeBreakdown && (
                <Card className="p-6 bg-white shadow-sm border border-border">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="p-1.5 bg-slate-100 rounded text-slate-600">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800">Account Type Distribution</h2>
                  </div>
                  <div className="flex flex-col md:flex-row items-center justify-center gap-16">
                    <div className="shrink-0 flex items-center justify-center">
                      <AccountTypeAllocationChart data={(summary as any).accountTypeBreakdown} />
                    </div>
                    <div className="flex-1 w-full max-w-2xl">
                      <div className="space-y-3">
                        {(summary as any).accountTypeBreakdown.map((item: any, index: number) => {
                          const TYPE_COLORS: Record<string, string> = {
                            "Brokerage": "#004a99",
                            "Retirement": "#3d8a3d",
                            "Savings": "#f2a900",
                            "Checking": "#cc0000",
                            "Other": "#666666"
                          };
                          return (
                            <div key={item.type} className="flex justify-between items-center text-sm p-3 hover:bg-slate-50 rounded transition-colors">
                              <div className="flex items-center gap-4">
                                <div
                                  className="w-4 h-4 rounded-full shrink-0"
                                  style={{ backgroundColor: TYPE_COLORS[item.type] || CHART_COLORS[index % CHART_COLORS.length] }}
                                />
                                <span className="font-bold text-slate-700">{item.type}</span>
                              </div>
                              <div className="flex items-center gap-6">
                                <span className="font-mono font-bold text-slate-600 text-sm">{formatCurrency(item.value)}</span>
                                <span className="font-mono font-bold text-slate-700 text-base w-16 text-right">{item.percentage}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Portfolio Allocation Pie Chart */}
              {summary && (
                <Card className="p-6 bg-white shadow-sm border border-border">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="p-1.5 bg-slate-100 rounded text-slate-600">
                      <FolderPlus className="w-4 h-4" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800">Portfolio Allocation</h2>
                  </div>
                  <div className="flex flex-col md:flex-row items-center justify-center gap-16">
                    <div className="shrink-0 flex items-center justify-center">
                      <PortfolioAllocationChart data={summary.allocationBreakdown} cashPercent={summary.cashAllocationPercent} />
                    </div>
                    <div className="flex-1 w-full max-w-2xl">
                      <div className="space-y-3">
                        {summary.allocationBreakdown.map((item: any, index: number) => (
                          <div key={item.symbol} className="flex justify-between items-center text-sm p-3 hover:bg-slate-50 rounded transition-colors">
                            <div className="flex items-center gap-4">
                              <div
                                className="w-4 h-4 rounded-full shrink-0"
                                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                              />
                              <span className="font-bold text-primary w-16">{item.symbol}</span>
                              <span className="text-slate-500 text-xs truncate max-w-[250px] md:max-w-[400px]">{item.name}</span>
                            </div>
                            <div className="flex items-center gap-6">
                              <span className="font-mono font-bold text-slate-600 text-sm">{formatCurrency(item.currentValue)}</span>
                              <span className="font-mono font-bold text-slate-700 text-base w-16 text-right">{item.percentage}%</span>
                            </div>
                          </div>
                        ))}
                        <div className="border-t border-slate-100 pt-3 mt-3 flex justify-between items-center text-sm p-3 bg-slate-50 rounded">
                          <div className="flex items-center gap-4">
                            <div className="w-4 h-4 rounded-full shrink-0 bg-slate-200" />
                            <span className="font-bold text-slate-600 w-16">CASH</span>
                            <span className="text-slate-500 text-xs">Cash Reserve</span>
                          </div>
                          <div className="flex items-center gap-6">
                            <span className="font-mono font-bold text-slate-600 text-sm">{formatCurrency(summary.cashBalance)}</span>
                            <span className="font-mono font-bold text-slate-700 text-base w-16 text-right">{summary.cashAllocationPercent}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </>

          {/* Dialogs */}
          <Dialog open={isHistoricalCashDialogOpen} onOpenChange={setIsHistoricalCashDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Record Historical Cash Balance</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account</label>
                  <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm font-bold text-slate-700">
                    {accounts?.find((a: any) => a.id.toString() === historicalCashData.accountId)?.name || "Selected Account"}
                  </div>
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
                        date: mergeDateWithCurrentTime(historicalCashData.date)
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
                <DialogTitle>Cash Transaction</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Account</label>
                  <div className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-sm font-bold text-slate-700">
                    {accounts?.find((a: any) => a.id.toString() === adjustCashData.accountId)?.name || "Selected Account"}
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
                        date: mergeDateWithCurrentTime(adjustCashData.date)
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

          {isTradeDialogOpen && (
            <Dialog open={!!isTradeDialogOpen} onOpenChange={() => setIsTradeDialogOpen(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Trade for {isTradeDialogOpen.symbol}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Trade Type</label>
                    <div className="flex bg-slate-100 p-1 rounded-md">
                      <button
                        onClick={() => setTradeData(prev => ({ ...prev, type: "buy" }))}
                        className={`flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-all ${tradeData.type === "buy" ? "bg-white text-primary" : "text-slate-500 hover:text-slate-700"}`}
                      >
                        BUY
                      </button>
                      <button
                        onClick={() => setTradeData(prev => ({ ...prev, type: "sell" }))}
                        className={`flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-all ${tradeData.type === "sell" ? "bg-white text-destructive" : "text-slate-500 hover:text-slate-700"}`}
                      >
                        SELL
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Account</label>
                    <select
                      className="bg-white border border-input rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary h-10 w-full"
                      value={tradeData.accountId}
                      onChange={(e) => setTradeData(prev => ({ ...prev, accountId: e.target.value }))}
                    >
                      {accounts?.map((acc: any) => (
                        <option key={acc.id} value={acc.id}>{acc.name} {acc.number ? `(${acc.number})` : ""}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Quantity</label>
                    <Input type="number" step="0.001" value={tradeData.quantity} onChange={(e) => setTradeData(prev => ({ ...prev, quantity: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Trade Date</label>
                    <Input type="date" value={tradeData.purchaseDate} onChange={(e) => setTradeData(prev => ({ ...prev, purchaseDate: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Price per Share</label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={tradeData.price}
                        onFocus={handleFocus}
                        onChange={(e) => handlePriceInputChange(e.target.value, (val) => setTradeData(prev => ({ ...prev, price: val })))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Fees</label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={tradeData.fees}
                        onFocus={handleFocus}
                        onChange={(e) => handlePriceInputChange(e.target.value, (val) => setTradeData(prev => ({ ...prev, fees: val })))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2 p-3 bg-slate-50 rounded-md border border-slate-100">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Estimated Transaction Total
                    </label>
                    <div className="text-lg font-mono font-bold text-slate-700">
                      {formatCurrency(
                        (parseFloat(tradeData.quantity || "0") * parseFloat(tradeData.price || "0")) +
                        (tradeData.type === "buy" ? parseFloat(tradeData.fees || "0") : -parseFloat(tradeData.fees || "0"))
                      )}
                    </div>
                  </div>
                  <Button
                    onClick={() => handleExecuteTrade(isTradeDialogOpen.id, isTradeDialogOpen.symbol, Number(tradeData.accountId))}
                    className={`w-full ${tradeData.type === "sell" ? "bg-destructive hover:bg-destructive/90" : ""}`}
                    disabled={executeTradeMutation.isPending}
                  >
                    Confirm {tradeData.type === "buy" ? "Purchase" : "Sale"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {isTransferDialogOpen && (
            <TransferAssetDialog
              isOpen={!!isTransferDialogOpen}
              onClose={() => setIsTransferDialogOpen(null)}
              holdingId={isTransferDialogOpen.id}
              symbol={isTransferDialogOpen.symbol}
              sourceAccountId={isTransferDialogOpen.accountId}
              portfolios={portfolios || []}
              currentPortfolioId={selectedPortfolioId}
            />
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
              <DialogContent className="sm:max-w-[1100px]">
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

          {isBondTradeDialogOpen && (
            <Dialog open={!!isBondTradeDialogOpen} onOpenChange={() => setIsBondTradeDialogOpen(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bond Trade for {isBondTradeDialogOpen.symbol}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Trade Type</label>
                    <div className="flex bg-slate-100 p-1 rounded-md">
                      <button onClick={() => setBondTradeData(prev => ({ ...prev, type: "buy" }))} className={`flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-all ${bondTradeData.type === "buy" ? "bg-white text-primary" : "text-slate-500"}`}>BUY</button>
                      <button onClick={() => setBondTradeData(prev => ({ ...prev, type: "sell" }))} className={`flex-1 py-1.5 text-xs font-bold rounded shadow-sm transition-all ${bondTradeData.type === "sell" ? "bg-white text-destructive" : "text-slate-500"}`}>SELL / REDEEM</button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Account</label>
                    <select className="bg-white border border-input rounded px-3 py-2 text-sm h-10 w-full" value={bondTradeData.accountId} onChange={(e) => setBondTradeData(prev => ({ ...prev, accountId: e.target.value }))}>
                      {accounts?.map((acc: any) => (<option key={acc.id} value={acc.id}>{acc.name} {acc.number ? `(${acc.number})` : ""}</option>))}
                    </select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Quantity</label>
                    <Input type="number" step="0.001" value={bondTradeData.quantity} onChange={(e) => setBondTradeData(prev => ({ ...prev, quantity: e.target.value }))} />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Trade Date</label>
                    <Input type="date" value={bondTradeData.purchaseDate} onChange={(e) => setBondTradeData(prev => ({ ...prev, purchaseDate: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Price per Bond</label>
                      <Input type="text" inputMode="decimal" value={bondTradeData.price} onFocus={handleFocus} onChange={(e) => handlePriceInputChange(e.target.value, (val) => setBondTradeData(prev => ({ ...prev, price: val })), 4)} placeholder="0.0000" />
                    </div>
                    <div className="grid gap-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Accrued Interest</label>
                      <Input type="text" inputMode="decimal" placeholder="0.00" value={bondTradeData.interest} onFocus={handleFocus} onChange={(e) => handlePriceInputChange(e.target.value, (val) => setBondTradeData(prev => ({ ...prev, interest: val })))} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Fees</label>
                    <Input type="text" inputMode="decimal" placeholder="0.00" value={bondTradeData.fees} onFocus={handleFocus} onChange={(e) => handlePriceInputChange(e.target.value, (val) => setBondTradeData(prev => ({ ...prev, fees: val })))} />
                  </div>
                  <div className="grid gap-2 p-3 bg-slate-50 rounded-md border border-slate-100">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estimated Transaction Total</label>
                    <div className="text-lg font-mono font-bold text-slate-700">
                      {formatCurrency((parseFloat(bondTradeData.quantity || "0") * parseFloat(bondTradeData.price || "0")) + parseFloat(bondTradeData.interest || "0") + (bondTradeData.type === "buy" ? parseFloat(bondTradeData.fees || "0") : -parseFloat(bondTradeData.fees || "0")))}
                    </div>
                  </div>
                  <Button onClick={() => handleExecuteBondTrade(isBondTradeDialogOpen.id, isBondTradeDialogOpen.symbol, Number(bondTradeData.accountId))} className={`w-full ${bondTradeData.type === "sell" ? "bg-destructive hover:bg-destructive/90" : ""}`} disabled={executeBondTradeMutation.isPending}>
                    Confirm {bondTradeData.type === "buy" ? "Purchase" : "Sale / Redemption"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {bondPurchaseHistoryOpen && (
            <Dialog open={!!bondPurchaseHistoryOpen} onOpenChange={() => setBondPurchaseHistoryOpen(null)}>
              <DialogContent className="sm:max-w-[1100px]">
                <DialogHeader>
                  <DialogTitle>Bond Purchase History for {bondPurchaseHistoryOpen.symbol}</DialogTitle>
                </DialogHeader>
                <BondPurchaseHistoryTable holdingId={bondPurchaseHistoryOpen.id} symbol={bondPurchaseHistoryOpen.symbol} portfolioId={selectedPortfolioId} onDelete={handleDeleteBondPurchase} accounts={accounts || []} />
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

          {isGeneralCSVImportOpen && (
            <Dialog open={isGeneralCSVImportOpen} onOpenChange={() => setIsGeneralCSVImportOpen(false)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Trade History</DialogTitle>
                </DialogHeader>
                <CSVImportForm
                  holdingId={-1}
                  symbol=""
                  onImport={handleImportCSV}
                  isLoading={importCSVMutation.isPending}
                  accounts={accounts || []}
                />
              </DialogContent>
            </Dialog>
          )}        </div>
      ) : activeSubTab === "activities" ? (
        <Activities selectedPortfolioId={selectedPortfolioId} selectedAccountType={selectedAccountType} />
      ) : activeSubTab === "performance" ? (
        <Performance selectedPortfolioId={selectedPortfolioId} selectedAccountType={selectedAccountType} />
      ) : activeSubTab === "dividends" ? (
        <Dividends selectedPortfolioId={selectedPortfolioId} selectedAccountType={selectedAccountType} />
      ) : (
        <div className="space-y-8">
          {/* Main Portfolio Summary Stats */}
          {summary ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="p-6 bg-white shadow-sm border border-border border-t-4 border-t-primary">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Total Portfolio Value</div>
                    <div className="text-3xl font-bold text-slate-800 font-mono">
                      {formatCurrency(summary.totalValue)}
                    </div>
                  </div>
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <Briefcase className="w-5 h-5 text-primary" />
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-slate-500">Investments:</span>
                    <span className="font-bold text-slate-700">{summary.investmentPercent}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-slate-200" />
                    <span className="text-slate-500">Cash:</span>
                    <span className="font-bold text-slate-700">{summary.cashPercent}%</span>
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-white shadow-sm border border-border border-t-4 border-t-green-600">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Cash Balance</div>
                    <div className="text-3xl font-bold text-slate-800 font-mono">
                      {formatCurrency(summary.cashBalance)}
                    </div>
                  </div>
                  <div className="p-2 bg-green-50 rounded-lg">
                    <Wallet className="w-5 h-5 text-green-600" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Available across {summary.accountSummaries ? Object.keys(summary.accountSummaries).length : 0} accounts</span>
                </div>
              </Card>

              <Card className="p-6 bg-white shadow-sm border border-border border-t-4 border-t-blue-600">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Equities</div>
                    <div className="text-2xl font-bold text-slate-800 font-mono">
                      {formatCurrency((summary as any).equityInvestmentValue ?? summary.investmentValue)}
                    </div>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Stocks & ETFs</span>
                  <span className="font-bold text-slate-700">{(summary as any).equityInvestmentValue ? ((parseFloat((summary as any).equityInvestmentValue)/parseFloat(summary.totalValue)*100).toFixed(1)) : "0"}%</span>
                </div>
              </Card>

              <Card className="p-6 bg-white shadow-sm border border-border border-t-4 border-t-purple-600">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Fixed Income</div>
                    <div className="text-2xl font-bold text-slate-800 font-mono">
                      {formatCurrency((summary as any).fixedIncomeInvestmentValue ?? "0.00")}
                    </div>
                  </div>
                  <div className="p-2 bg-purple-50 rounded-lg">
                    <Landmark className="w-5 h-5 text-purple-600" />
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Bonds & Treasuries</span>
                  <span className="font-bold text-slate-700">{(summary as any).fixedIncomeInvestmentValue ? ((parseFloat((summary as any).fixedIncomeInvestmentValue)/parseFloat(summary.totalValue)*100).toFixed(1)) : "0"}%</span>
                </div>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="h-32 bg-slate-50 border-slate-100" />
              ))}
            </div>
          )}

          {/* Accounts & Holdings Content */}
          <div className="grid grid-cols-1 gap-8">
            {/* Accounts Table */}
            <Card className="bg-white shadow-sm border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Account Breakdown</h3>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => setIsAccountsDialogOpen(true)}
                  className="h-8 text-[10px] uppercase font-bold"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  New Account
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-border">
                      <th className="w-10"></th>
                      <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Account Name</th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Allocation</th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Cash</th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Investments</th>
                      <th className="text-center py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts
                      ?.filter((a: any) => {
                        if (selectedAccountId) return a.id === selectedAccountId;
                        if (selectedAccountType !== "all") return a.accountType === selectedAccountType;
                        return true;
                      })
                      ?.map((account: any) => {
                      const accDetails = (summary as any)?.accountSummaries?.[account.id] || { investmentValue: "0.00", cashValue: "0.00", totalValue: "0.00", assets: [] };
                      const totalVal = parseFloat(accDetails.totalValue);
                      const invPercent = totalVal > 0 ? ((parseFloat(accDetails.investmentValue) / totalVal) * 100).toFixed(1) : "0";
                      const cashPercent = totalVal > 0 ? ((parseFloat(accDetails.cashValue) / totalVal) * 100).toFixed(1) : "0";
                      const isExpanded = expandedAccounts.has(account.id);

                      return (
                        <React.Fragment key={account.id}>
                          <tr className="border-b border-border hover:bg-slate-50 transition-colors">
                            <td className="text-center">
                              <button 
                                onClick={() => toggleAccount(account.id)}
                                className="p-1 hover:bg-slate-100 rounded"
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                              </button>
                            </td>
                            <td className="py-4 px-6">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-700">{account.name}</span>
                                {account.number && <span className="text-[10px] font-mono text-slate-400">({account.number})</span>}
                                {selectedAccountType === "all" && (
                                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                    {account.accountType}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-6 text-right">
                              <div className="flex items-center justify-end gap-3 text-[10px]">
                                <div className="flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                  <span className="text-slate-500">{invPercent}%</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                  <span className="text-slate-500">{cashPercent}%</span>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-right font-mono font-medium text-slate-600">{formatCurrency(accDetails.cashValue)}</td>
                            <td className="py-4 px-6 text-right font-mono font-bold text-primary">{formatCurrency(accDetails.investmentValue)}</td>
                            <td className="py-4 px-6 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-400 hover:text-green-600 hover:bg-green-50"
                                  onClick={() => setCashHistoryOpen({ id: account.id, name: account.name })}
                                  title="Cash History"
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                  onClick={() => setEditingAccount(account)}
                                  title="Edit Account"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                  onClick={() => {
                                    if (confirm(`Are you sure you want to delete account "${account.name}"? This will also remove its cash history and purchase assignments.`)) {
                                      deleteAccountMutation.mutate({ id: account.id });
                                    }
                                  }}
                                  title="Delete Account"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          
                          {/* Expanded Assets for this account */}
                          <AnimatePresence>
                            {isExpanded && accDetails.assets && accDetails.assets.length > 0 && (
                              <motion.tr
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                              >
                                <td colSpan={6} className="p-0 bg-slate-50/30">
                                  <div className="px-6 py-3 border-l-4 border-l-primary/20 ml-10 my-2">
                                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Allocated Assets</h4>
                                    <div className="grid grid-cols-4 gap-4">
                                      {accDetails.assets.map((asset: any) => (
                                        <div key={asset.symbol} className="bg-white p-3 rounded border border-slate-100 shadow-sm flex justify-between items-center">
                                          <div>
                                            <div className="font-bold text-primary text-sm">{asset.symbol}</div>
                                            <div className="text-[10px] text-slate-500 font-mono">{formatNumber(asset.quantity, 3)} units</div>
                                          </div>
                                          <div className="text-right">
                                            <div className="font-bold text-slate-700 text-sm">{formatCurrency(asset.currentValue)}</div>
                                            <div className={`text-[10px] font-bold font-mono ${parseFloat(asset.gain) >= 0 ? "text-green-600" : "text-red-600"}`}>
                                              {parseFloat(asset.gain) >= 0 ? "+" : ""}{asset.gainPercent}%
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </td>
                              </motion.tr>
                            )}
                          </AnimatePresence>
                        </React.Fragment>
                      );
                    })}
                    {(!accounts || accounts.length === 0) && (
                      <tr>
                        <td colSpan={6} className="py-12 text-center">
                          <div className="flex flex-col items-center gap-2 text-slate-400 italic">
                            <Wallet className="w-8 h-8 opacity-20" />
                            <p>No accounts added to this portfolio yet.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Active Holdings Table */}
            <Card className="bg-white shadow-sm border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Equities</h3>
                </div>
                {summary?.holdings && summary.holdings.length > 0 && (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {summary.holdings.length} Assets Tracked
                  </Badge>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-border">
                      <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => requestSort("symbol")}>
                        <div className="flex items-center gap-1">
                          Asset
                          {sortConfig?.key === "symbol" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => requestSort("quantity")}>
                        <div className="flex items-center justify-end gap-1">
                          Qty
                          {sortConfig?.key === "quantity" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => requestSort("averageCost")}>
                        <div className="flex items-center justify-end gap-1">
                          Avg Cost
                          {sortConfig?.key === "averageCost" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => requestSort("totalCost")}>
                        <div className="flex items-center justify-end gap-1">
                          Total Cost
                          {sortConfig?.key === "totalCost" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => requestSort("currentPrice")}>
                        <div className="flex items-center justify-end gap-1">
                          Mkt Price
                          {sortConfig?.key === "currentPrice" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => requestSort("currentValue")}>
                        <div className="flex items-center justify-end gap-1">
                          Mkt Value
                          {sortConfig?.key === "currentValue" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => requestSort("gain")}>
                        <div className="flex items-center justify-end gap-1">
                          Gain/Loss
                          {sortConfig?.key === "gain" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group" onClick={() => requestSort("gainPercent")}>
                        <div className="flex items-center justify-end gap-1">
                          Gain/Loss %
                          {sortConfig?.key === "gainPercent" ? (
                            sortConfig.direction === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                          )}
                        </div>
                      </th>
                      <th className="text-right py-3 px-6 text-slate-600">Allocation</th>
                      <th className="text-center py-3 px-6 text-slate-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHoldings.map((h: any) => {
                      const allocation = (summary as any)?.investmentAllocationBreakdown?.find((en: any) => en.symbol === h.symbol);
                      const isGain = parseFloat(h.gain) >= 0;
                      const isUnderallocated = parseFloat(allocation?.percentage || "0") < (parseFloat(h.desiredAllocation) || 0);
                      const isConsolidated = h.isConsolidated || h.id === -1;

                      return (
                        <tr key={isConsolidated ? `consolidated-${h.symbol}` : h.id} className="border-b border-border hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-6">
                            <div className="font-bold text-primary text-sm leading-tight">{h.symbol}</div>
                            <TooltipProvider>
                              <TooltipBase>
                                <TooltipTrigger asChild>
                                  <div className="text-slate-500 text-[10px] leading-tight cursor-help whitespace-nowrap">
                                    {h.name.length > 20 ? `${h.name.substring(0, 20)}...` : h.name}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                  <p className="max-w-[300px]">{h.name}</p>
                                </TooltipContent>
                              </TooltipBase>
                            </TooltipProvider>
                          </td>
                          <td className="text-right py-3 px-6 font-mono text-xs font-medium">
                            {formatNumber(h.quantity, 3)}
                          </td>
                          <td className="text-right py-3 px-6 font-mono text-xs text-slate-600">
                            {formatCurrency(h.averageCost)}
                          </td>
                          <td className="text-right py-3 px-6 font-mono text-xs text-slate-600">
                            {formatCurrency(h.totalCost)}
                          </td>
                          <td className="text-right py-3 px-6 font-mono text-xs text-slate-600">
                            {formatCurrency(h.currentPrice)}
                          </td>
                          <td className="text-right py-3 px-6 font-mono text-xs font-bold">
                            {formatCurrency(h.currentValue)}
                          </td>
                          <td className={`text-right py-3 px-6 font-mono text-xs font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                            {isGain ? "+" : ""}{formatCurrency(h.gain)}
                          </td>
                          <td className={`text-right py-3 px-6 font-mono text-xs font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                            {isGain ? "+" : ""}{h.gainPercent}%
                          </td>
                          <td className="text-right py-3 px-6 font-mono">
                            <div className="flex flex-col items-end gap-1">
                              <div className="text-xs font-bold text-slate-700 leading-none">
                                {allocation?.percentage || "0.00"}%
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {isUnderallocated && (
                                  <div className="flex items-center text-[8px] font-bold text-green-600 animate-pulse">
                                    <PlusCircle className="w-2.5 h-2.5 mr-0.5" /> BUY
                                  </div>
                                )}
                                <div className="flex items-center text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  <span className="mr-1">Target</span>
                                  <input 
                                    type="number"
                                    step="0.1"
                                    defaultValue={h.desiredAllocation || "0"}
                                    onBlur={(e) => {
                                      if (e.target.value !== h.desiredAllocation) {
                                        updateDesiredAllocationMutation.mutate({ 
                                          id: h.id, 
                                          symbol: h.symbol,
                                          portfolioId: selectedPortfolioId, 
                                          desiredAllocation: e.target.value 
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
                          <td className="text-center py-3 px-6">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-primary">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>Manage Asset</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setIsTradeDialogOpen({ id: h.id, symbol: h.symbol })}>
                                  <ArrowLeftRight className="mr-2 h-4 w-4 text-slate-500" />
                                  <span>Add Trade</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setIsCSVImportOpen({ id: h.id, symbol: h.symbol })}>
                                  <RefreshCw className="mr-2 h-4 w-4 text-slate-500" />
                                  <span>Import Purchases</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleExportPurchases(h.id, h.symbol)}>
                                  <Download className="mr-2 h-4 w-4 text-slate-500" />
                                  <span>Export Purchases</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setViewingHistoryOpen({ id: h.id, symbol: h.symbol })}>
                                  <History className="mr-2 h-4 w-4 text-slate-500" />
                                  <span>View History</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  onClick={() => handleDeleteInvestment(h.id, h.symbol)}
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
                  {(summary?.holdings) && summary.holdings.length > 0 && (
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                      <tr className="font-bold text-slate-800">
                        <td colSpan={5} className="py-4 px-6 uppercase text-[10px] tracking-widest text-slate-500">Total Portfolio Performance</td>
                        <td className="text-right py-4 px-6 font-mono text-sm">{formatCurrency(summary.investmentValue)}</td>
                        <td className={`text-right py-4 px-6 font-mono text-sm ${(summary?.holdings?.filter((h:any)=> !h.assetType || h.assetType==="etf").reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {(summary?.holdings?.filter((h:any)=> !h.assetType || h.assetType==="etf").reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0) >= 0 ? "+" : ""}{formatCurrency(summary.holdings?.reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0)}
                        </td>
                        <td className={`text-right py-4 px-6 font-mono text-sm ${((summary?.holdings?.filter((h:any)=> !h.assetType || h.assetType==="etf").reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0) / (summary?.holdings?.reduce((acc: number, h: any) => acc + parseFloat(h.averageCost || h.purchasePrice) * parseFloat(h.quantity), 0) || 1) * 100) >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {(((summary?.holdings?.filter((h:any)=> !h.assetType || h.assetType==="etf").reduce((acc: number, h: any) => acc + parseFloat(h.gain), 0) || 0) / (summary?.holdings?.reduce((acc: number, h: any) => acc + parseFloat(h.averageCost || h.purchasePrice) * parseFloat(h.quantity), 0) || 1) * 100)).toFixed(2)}%
                        </td>
                        <td className="text-right py-4 px-6 font-mono text-slate-500 text-xs">100%</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>

            {/* Allocation Visuals */}
            <div className="grid grid-cols-1 gap-8">
              {summary && (
                <Card className="p-6 bg-white shadow-sm border border-border">
                  <div className="flex items-center gap-2 mb-6">
                    <div className="p-1.5 bg-slate-100 rounded text-slate-600">
                      <PieChart className="w-4 h-4" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800">Portfolio Allocation</h2>
                  </div>
                  <div className="flex flex-col md:flex-row items-center justify-center gap-16">
                    <div className="shrink-0 flex items-center justify-center">
                      <PortfolioAllocationChart data={summary.allocationBreakdown} cashPercent={summary.cashAllocationPercent} />
                    </div>
                    <div className="flex-1 w-full max-w-2xl">
                      <div className="space-y-3">
                        {summary.allocationBreakdown.map((item: any, index: number) => (
                          <div key={item.symbol} className="flex justify-between items-center text-sm p-3 hover:bg-slate-50 rounded transition-colors">
                            <div className="flex items-center gap-4">
                              <div
                                className="w-4 h-4 rounded-full shrink-0"
                                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                              />
                              <span className="font-bold text-primary w-16">{item.symbol}</span>
                              <span className="text-slate-500 text-xs truncate max-w-[250px] md:max-w-[400px]">{item.name}</span>
                            </div>
                            <div className="flex items-center gap-6">
                              <span className="font-mono font-bold text-slate-600 text-sm">{formatCurrency(item.currentValue)}</span>
                              <span className="font-mono font-bold text-slate-700 text-base w-16 text-right">{item.percentage}%</span>
                            </div>
                          </div>
                        ))}
                        <div className="border-t border-slate-100 pt-3 mt-3 flex justify-between items-center text-sm p-3 bg-slate-50 rounded">
                          <div className="flex items-center gap-4">
                            <div className="w-4 h-4 rounded-full shrink-0 bg-slate-200" />
                            <span className="font-bold text-slate-600 w-16">CASH</span>
                            <span className="text-slate-500 text-xs">Cash Reserve</span>
                          </div>
                          <div className="flex items-center gap-6">
                            <span className="font-mono font-bold text-slate-600 text-sm">{formatCurrency(summary.cashBalance)}</span>
                            <span className="font-mono font-bold text-slate-700 text-base w-16 text-right">{summary.cashAllocationPercent}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
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

      const size = 400;
      const centerX = size / 2;
      const centerY = size / 2;
      const radius = size * 0.44;
      let startAngle = 0;

      ctx.clearRect(0, 0, size, size);

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
        ctx.lineWidth = 4;
        ctx.stroke();
        startAngle += sliceAngle;
      });

      // Draw center hole for donut look
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius * 0.68, 0, 2 * Math.PI);
      ctx.fillStyle = "white";
      ctx.fill();
    }
  }, [data, cashPercent]);

  return (
    <div className="flex flex-col items-center">
      <canvas ref={canvasRef} width="400" height="400" className="drop-shadow-lg" />
    </div>
  );
}

export function AccountTypeAllocationChart({ data }: { data: any[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const total = data.reduce((acc: number, item: any) => acc + parseFloat(item.percentage), 0);

  useEffect(() => {
    if (canvasRef.current && data.length > 0) {
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;

      const size = 400;
      const centerX = size / 2;
      const centerY = size / 2;
      const radius = size * 0.44;
      let startAngle = 0;

      ctx.clearRect(0, 0, size, size);

      const TYPE_COLORS: Record<string, string> = {
        "Brokerage": "#004a99",
        "Retirement": "#3d8a3d",
        "Savings": "#f2a900",
        "Checking": "#cc0000",
        "Other": "#666666"
      };

      data.forEach((item, index) => {
        const sliceAngle = (parseFloat(item.percentage) / total) * 2 * Math.PI;
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = TYPE_COLORS[item.type] || CHART_COLORS[index % CHART_COLORS.length];
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 4;
        ctx.stroke();
        startAngle += sliceAngle;
      });

      // Draw center hole for donut look
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius * 0.68, 0, 2 * Math.PI);
      ctx.fillStyle = "white";
      ctx.fill();
    }
  }, [data]);

  return (
    <div className="flex flex-col items-center">
      <canvas ref={canvasRef} width="400" height="400" className="drop-shadow-lg" />
    </div>
  );
}

function TransferAssetDialog({
  isOpen,
  onClose,
  holdingId,
  symbol,
  sourceAccountId: initialSourceAccountId,
  portfolios,
  currentPortfolioId
}: {
  isOpen: boolean;
  onClose: () => void;
  holdingId: number;
  symbol: string;
  sourceAccountId?: number;
  portfolios: any[];
  currentPortfolioId: number;
}) {
  const utils = trpc.useUtils();
  const [sourceAccountId, setSourceAccountId] = useState<string>(initialSourceAccountId?.toString() || "");
  const [targetPortfolioId, setTargetPortfolioId] = useState<string>(currentPortfolioId.toString());
  const [targetAccountId, setTargetAccountId] = useState<string>("");
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<Set<number>>(new Set());

  const { data: currentPortfolioAccounts } = trpc.account.getAccounts.useQuery(
    { portfolioId: currentPortfolioId },
    { enabled: isOpen }
  );

  const { data: targetAccounts } = trpc.account.getAccounts.useQuery(
    { portfolioId: Number(targetPortfolioId) },
    { enabled: !!targetPortfolioId }
  );

  const { data: purchases } = trpc.etf.getPurchases.useQuery(
    { holdingId: sourceAccountId ? -1 : holdingId, symbol, portfolioId: currentPortfolioId },
    { enabled: isOpen }
  );

  const activePurchases = useMemo(() => {
    if (!purchases) return [];
    return purchases.filter((p: any) => !p.isSold && (sourceAccountId ? p.accountId === Number(sourceAccountId) : true));
  }, [purchases, sourceAccountId]);

  // Reset selection when source account changes
  useEffect(() => {
    setSelectedPurchaseIds(new Set());
  }, [sourceAccountId]);

  const transferMutation = trpc.etf.transferPurchases.useMutation({
    onSuccess: () => {
      toast.success("Assets transferred successfully!");
      utils.etf.getPortfolioSummary.invalidate();
      utils.etf.getHoldings.invalidate();
      utils.portfolio.getConsolidatedSummary.invalidate();
      onClose();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to transfer assets");
    }
  });

  const togglePurchase = (id: number) => {
    const next = new Set(selectedPurchaseIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPurchaseIds(next);
  };

  const toggleAll = () => {
    if (selectedPurchaseIds.size === activePurchases.length) {
      setSelectedPurchaseIds(new Set());
    } else {
      setSelectedPurchaseIds(new Set(activePurchases.map((p: any) => p.id)));
    }
  };

  const handleTransfer = () => {
    if (!targetAccountId) {
      toast.error("Please select a target account");
      return;
    }
    if (selectedPurchaseIds.size === 0) {
      toast.error("Please select at least one purchase to transfer");
      return;
    }

    transferMutation.mutate({
      purchaseIds: Array.from(selectedPurchaseIds),
      targetPortfolioId: Number(targetPortfolioId),
      targetAccountId: Number(targetAccountId),
      symbol
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
            Transfer {symbol}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 pt-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Source Account</label>
              <Select value={sourceAccountId} onValueChange={setSourceAccountId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select Source Account" />
                </SelectTrigger>
                <SelectContent>
                  {currentPortfolioAccounts?.map(a => (
                    <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target Portfolio</label>
              <Select value={targetPortfolioId} onValueChange={(val) => {
                setTargetPortfolioId(val);
                setTargetAccountId("");
              }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select Portfolio" />
                </SelectTrigger>
                <SelectContent>
                  {portfolios.map(p => (
                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target Account</label>
              <Select value={targetAccountId} onValueChange={setTargetAccountId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select Account" />
                </SelectTrigger>
                <SelectContent>
                  {targetAccounts?.filter((a: any) => a.id.toString() !== sourceAccountId || targetPortfolioId !== currentPortfolioId.toString()).map((a: any) => (
                    <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Purchases to Transfer</label>
              <Button variant="ghost" size="sm" className="h-7 text-[10px] uppercase font-bold" onClick={toggleAll}>
                {selectedPurchaseIds.size === activePurchases.length ? "Deselect All" : "Select All"}
              </Button>
            </div>
            
            <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="w-10 p-2"></th>
                    <th className="text-left p-2">Date</th>
                    <th className="text-right p-2">Quantity</th>
                    <th className="text-right p-2">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activePurchases.map((p: any) => (
                    <tr 
                      key={p.id} 
                      className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedPurchaseIds.has(p.id) ? "bg-primary/5" : ""}`}
                      onClick={() => togglePurchase(p.id)}
                    >
                      <td className="p-2 text-center">
                        {selectedPurchaseIds.has(p.id) ? (
                          <CheckSquare className="w-4 h-4 text-primary mx-auto" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300 mx-auto" />
                        )}
                      </td>
                      <td className="p-2 font-mono text-slate-500">{formatUTCDate(p.purchaseDate)}</td>
                      <td className="p-2 text-right font-mono font-bold">{formatNumber(p.quantity, 3)}</td>
                      <td className="p-2 text-right font-mono">{formatCurrency(p.price)}</td>
                    </tr>
                  ))}
                  {activePurchases.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-400 italic">No active purchases found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex justify-between items-center">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total to Transfer</div>
              <div className="text-lg font-mono font-bold text-primary">
                {formatNumber(activePurchases.filter((p: any) => selectedPurchaseIds.has(p.id)).reduce((acc: number, p: any) => acc + parseFloat(p.quantity), 0), 3)} shares
              </div>
            </div>
            <Button 
              onClick={handleTransfer} 
              disabled={transferMutation.isPending || selectedPurchaseIds.size === 0 || !targetAccountId}
              className="px-8"
            >
              {transferMutation.isPending ? "Transferring..." : "Confirm Transfer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  onDelete: (purchaseId: number, holdingId: number, portfolioId: number, accountId: number, symbol?: string) => void,
  accounts: any[]
}) {
  const utils = trpc.useUtils();
  const { data: purchases, refetch: refetchPurchases } = trpc.etf.getPurchases.useQuery({ holdingId, symbol, portfolioId });
  const [filterAccountId, setFilterAccountId] = useState<string>("");
  const [editingPurchase, setEditingPurchase] = useState<any | null>(null);

  const { data: marketHistory } = trpc.etf.getMarketPriceHistory.useQuery(
    { symbol, days: 1 },
    { enabled: !!symbol }
  );

  const currentPrice = marketHistory?.[0]?.price || 0;

  const editPurchaseMutation = trpc.etf.editPurchase.useMutation({
    onSuccess: () => {
      toast.success("Purchase updated successfully!");
      refetchPurchases();
      utils.etf.getPortfolioSummary.invalidate({ portfolioId });
      utils.etf.getHoldings.invalidate({ portfolioId });
      utils.portfolio.getConsolidatedSummary.invalidate();
      setEditingPurchase(null);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update purchase");
    },
  });

  const filteredPurchases = useMemo(() => {
    if (!purchases) return [];
    if (!filterAccountId) return purchases;
    return purchases.filter((p: any) => p.accountId === Number(filterAccountId));
  }, [purchases, filterAccountId]);

  const handleEditSubmit = (data: any) => {
    editPurchaseMutation.mutate({
      purchaseId: editingPurchase.id,
      holdingId,
      portfolioId,
      accountId: editingPurchase.accountId,
      quantity: data.quantity,
      price: data.price,
      fees: data.fees,
      purchaseDate: new Date(data.purchaseDate + "T12:00:00"),
    });
  };

  const handleExportCSV = () => {
    if (!filteredPurchases || filteredPurchases.length === 0) {
      toast.error("No purchases to export");
      return;
    }

    const headers = "date,account,quantity,cost";
    const rows = filteredPurchases.map((p: any) => {
      const date = new Date(p.purchaseDate).toISOString().split('T')[0];
      const account = accounts.find((a: any) => a.id === p.accountId);
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
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Filter by Account:</span>
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
          {currentPrice > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-primary/5 rounded-full border border-primary/10">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mkt Price:</span>
              <span className="text-xs font-mono font-bold text-primary">{formatCurrency(currentPrice)}</span>
            </div>
          )}
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
              <th className="text-left py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Date</th>
              <th className="text-left py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Account</th>
              <th className="text-right py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Qty</th>
              <th className="text-right py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Price</th>
              <th className="text-right py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Cost</th>
              <th className="text-right py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Value</th>
              <th className="text-right py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Gain/Loss</th>
              <th className="text-center py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-slate-500">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredPurchases?.map((purchase: any) => {
              const dateStr = formatUTCDate(purchase.isSold && purchase.soldDate ? purchase.soldDate : purchase.purchaseDate);
              const accountName = accounts?.find((a: any) => a.id === purchase.accountId)?.name || "Default";
              const quantity = parseFloat(purchase.quantity);
              const isSale = !!purchase.isSold;
              const price = parseFloat(isSale ? (purchase.soldPrice || purchase.price) : purchase.price);
              const totalCost = truncateNumber(quantity * price);
              
              const currentValue = isSale ? 0 : truncateNumber(quantity * currentPrice);
              const gainLoss = isSale ? 0 : (currentValue - totalCost);
              const gainLossPercent = isSale ? 0 : (totalCost > 0 ? (gainLoss / totalCost) * 100 : 0);
              const isGain = gainLoss >= 0;

              return (
                <tr key={purchase.id} className={`border-b border-border hover:bg-white transition-colors ${isSale ? "bg-slate-50/50 italic text-slate-500 opacity-60" : ""}`}>
                  <td className="py-3 px-4 font-mono whitespace-nowrap text-xs text-slate-500">{dateStr}</td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                      {accountName}
                    </span>
                  </td>
                  <td className={`text-right py-3 px-4 font-mono ${isSale ? "text-red-500" : ""}`}>
                    {isSale ? "-" : ""}{formatNumber(purchase.quantity, 3)}
                  </td>
                  <td className="text-right py-3 px-4 font-mono font-medium">{formatCurrency(price)}</td>
                  <td className={`text-right py-3 px-4 font-mono font-bold ${isSale ? "text-red-600" : "text-slate-700"}`}>
                    {isSale ? "-" : ""}{formatCurrency(totalCost)}
                  </td>
                  <td className="text-right py-3 px-4 font-mono font-bold text-slate-700">
                    {!isSale && formatCurrency(currentValue)}
                  </td>
                  <td className={`text-right py-3 px-4 font-mono whitespace-nowrap`}>
                    {!isSale && (
                      <div className="flex flex-col items-end">
                        <span className={`font-bold ${isGain ? "text-green-600" : "text-red-600"}`}>
                          {isGain ? "+" : ""}{formatCurrency(gainLoss)}
                        </span>
                        <span className={`text-[10px] font-bold ${isGain ? "text-green-500" : "text-red-500"}`}>
                          {isGain ? "+" : ""}{gainLossPercent.toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="text-center py-3 px-4">
                    <div className="flex items-center justify-center gap-1">
                      {isSale ? (
                        <Badge variant="outline" className="text-[8px] font-bold uppercase bg-red-50 text-red-600 border-red-100">Sale</Badge>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingPurchase(purchase)}
                            className="text-slate-400 hover:text-primary"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onDelete(purchase.id, holdingId, portfolioId, purchase.accountId, symbol)}
                            className="text-slate-400 hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredPurchases.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                  No purchase records found for this selection.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingPurchase && (
        <Dialog open={!!editingPurchase} onOpenChange={() => setEditingPurchase(null)}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Purchase: {symbol}</DialogTitle>
            </DialogHeader>
            <PurchaseEditForm 
              purchase={editingPurchase} 
              onSubmit={handleEditSubmit} 
              onCancel={() => setEditingPurchase(null)}
              isLoading={editPurchaseMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function BondPurchaseHistoryTable({
  holdingId,
  symbol,
  portfolioId,
  onDelete,
  accounts
}: {
  holdingId: number,
  symbol: string,
  portfolioId: number,
  onDelete: (purchaseId: number, holdingId: number, portfolioId: number, symbol?: string) => void,
  accounts: any[]
}) {
  const { data: purchases } = trpc.bond.getPurchases.useQuery({ holdingId, symbol, portfolioId });
  const filtered = purchases || [];
  return (
    <div className="space-y-4">
      <div className="overflow-auto max-h-[60vh] custom-scrollbar border border-border rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-[10px] font-bold uppercase text-slate-500">Date</th>
              <th className="text-left py-3 px-4 text-[10px] font-bold uppercase text-slate-500">Account</th>
              <th className="text-right py-3 px-4 text-[10px] font-bold uppercase text-slate-500">Qty</th>
              <th className="text-right py-3 px-4 text-[10px] font-bold uppercase text-slate-500">Price</th>
              <th className="text-right py-3 px-4 text-[10px] font-bold uppercase text-slate-500">Interest</th>
              <th className="text-right py-3 px-4 text-[10px] font-bold uppercase text-slate-500">Total Cost</th>
              <th className="text-center py-3 px-4 text-[10px] font-bold uppercase text-slate-500">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered?.map((purchase: any) => {
              const dateStr = formatUTCDate(purchase.isSold && purchase.soldDate ? purchase.soldDate : purchase.purchaseDate);
              const accountName = accounts?.find((a: any) => a.id === purchase.accountId)?.name || "Default";
              const isSale = !!purchase.isSold;
              const qty = parseFloat(purchase.quantity);
              const price = parseFloat(isSale ? (purchase.soldPrice || purchase.price) : purchase.price);
              const interest = parseFloat(purchase.interest || "0");
              const totalCost = truncateNumber(qty * price + (isSale ? 0 : interest));
              return (
                <tr key={purchase.id} className={`border-b hover:bg-white ${isSale ? "bg-slate-50/50 italic opacity-60" : ""}`}>
                  <td className="py-3 px-4 font-mono text-xs text-slate-500">{dateStr}</td>
                  <td className="py-3 px-4"><span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border">{accountName}</span></td>
                  <td className="text-right py-3 px-4 font-mono">{isSale ? "-" : ""}{formatNumber(purchase.quantity, 3)}</td>
                  <td className="text-right py-3 px-4 font-mono">{formatCurrency(price, 4)}</td>
                  <td className="text-right py-3 px-4 font-mono text-slate-500">{formatCurrency(interest)}</td>
                  <td className="text-right py-3 px-4 font-mono font-bold">{isSale ? "-" : ""}{formatCurrency(totalCost)}</td>
                  <td className="text-center py-3 px-4">
                    {isSale ? <Badge variant="outline" className="text-[8px] bg-red-50 text-red-600 border-red-100">Sale</Badge> : (
                      <Button size="sm" variant="ghost" onClick={() => onDelete(purchase.id, holdingId, portfolioId, symbol)} className="text-slate-400 hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-slate-400 italic">No bond purchases found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PurchaseEditForm({ purchase, onSubmit, onCancel, isLoading }: { purchase: any, onSubmit: (data: any) => void, onCancel: () => void, isLoading: boolean }) {
  const [formData, setFormData] = useState({
    quantity: purchase.quantity,
    price: purchase.price,
    fees: purchase.fees || "0",
    purchaseDate: formatUTCDate(purchase.purchaseDate),
  });

  return (
    <div className="space-y-4 pt-4">
      <div className="grid gap-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Quantity</label>
        <Input 
          type="number" 
          step="0.001" 
          value={formData.quantity} 
          onChange={(e) => setFormData(prev => ({ ...prev, quantity: e.target.value }))} 
        />
      </div>
      <div className="grid gap-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Price per Share</label>
        <Input 
          type="text" 
          value={formData.price} 
          onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))} 
        />
      </div>
      <div className="grid gap-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Fees</label>
        <Input 
          type="text" 
          value={formData.fees} 
          onChange={(e) => setFormData(prev => ({ ...prev, fees: e.target.value }))} 
        />
      </div>
      <div className="grid gap-2">
        <label className="text-xs font-bold text-slate-500 uppercase">Trade Date</label>
        <Input 
          type="date" 
          value={formData.purchaseDate} 
          onChange={(e) => setFormData(prev => ({ ...prev, purchaseDate: e.target.value }))} 
        />
      </div>
      <div className="grid gap-2 p-3 bg-slate-50 rounded-md border border-slate-100">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Transaction Value</label>
        <div className="text-lg font-mono font-bold text-slate-700">
          {formatCurrency(truncateNumber(
            (parseFloat(formData.quantity || "0") * parseFloat(formData.price || "0")) + 
            parseFloat(formData.fees || "0")
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>Cancel</Button>
        <Button onClick={() => onSubmit(formData)} disabled={isLoading}>
          {isLoading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

function CSVImportForm({
  holdingId,
  symbol: initialSymbol,
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
  const utils = trpc.useUtils();
  const [file, setFile] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(currentAccountId?.toString() || (accounts && accounts.length > 0 ? accounts[0].id.toString() : ""));
  const [symbol, setSymbol] = useState(initialSymbol);
  const [assetName, setAssetName] = useState<string>("");
  const lookupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const symbolToLookup = symbol || initialSymbol;
    if (symbolToLookup && symbolToLookup.length >= 2) {
      if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
      lookupTimeoutRef.current = setTimeout(async () => {
        try {
          const name = await utils.etf.lookupETFName.fetch({ symbol: symbolToLookup });
          if (name) setAssetName(name);
          else setAssetName("");
        } catch (e) {
          setAssetName("");
        }
      }, initialSymbol ? 0 : 500); // Immediate if initialSymbol
    } else {
      setAssetName("");
    }
    return () => {
      if (lookupTimeoutRef.current) clearTimeout(lookupTimeoutRef.current);
    };
  }, [symbol, initialSymbol, utils.etf.lookupETFName]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!symbol && !initialSymbol) {
      toast.error("Please enter an asset symbol");
      return;
    }

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
        onImport(holdingId, symbol || initialSymbol, content, Number(selectedAccountId));
      }
    };
    reader.onerror = () => {
      toast.error("Failed to read file");
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6 pt-4">
      {initialSymbol && assetName && (
        <div className="text-xs font-bold text-primary uppercase animate-in fade-in slide-in-from-top-1 duration-300">
          {assetName}
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        {!initialSymbol && (
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">Asset Symbol</label>
            <Input 
              placeholder="e.g. VOO, QQQ" 
              value={symbol} 
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              className="uppercase"
            />
            {assetName && (
              <div className="text-[10px] font-bold text-primary uppercase truncate animate-in fade-in slide-in-from-top-1 duration-300">
                {assetName}
              </div>
            )}
          </div>
        )}
        <div className={`space-y-2 ${!initialSymbol ? "col-span-1" : "col-span-2"}`}>
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
      </div>

      <div className="bg-slate-50 p-4 rounded-lg border border-border">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
          <Info className="w-3 h-3" /> CSV File Format
        </h4>
        <div className="text-xs text-slate-600 space-y-2">
          <p>File should include a header: <code>date,quantity,cost</code></p>
          <div className="p-2 bg-white rounded border border-slate-200 font-mono text-[10px]">
            date,quantity,cost<br />
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
  const [editingTransaction, setEditingTransaction] = useState<any | null>(null);
  const [editFormData, setEditFormData] = useState({ amount: "", description: "" });
  
  const { data: history, isLoading, refetch } = trpc.etf.getCashActivities.useQuery(
    { portfolioId, range: "1y" }, // Show last year by default
    { enabled: !!portfolioId }
  );

  const editCashTransactionMutation = trpc.etf.editCashTransaction.useMutation({
    onSuccess: () => {
      toast.success("Transaction updated!");
      setEditingTransaction(null);
      refetch();
      utils.etf.getPortfolioSummary.invalidate();
      utils.portfolio.getConsolidatedSummary.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update transaction");
    },
  });

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
    return history
      .filter((h: any) => h.accountId === accountId)
      .sort((a: any, b: any) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return b.id - a.id; // DESC: newest ID first for same timestamp
      });
  }, [history, accountId]);

  const handleEditClick = (activity: any) => {
    setEditingTransaction(activity);
    setEditFormData({
      amount: activity.transactionAmount || activity.amount,
      description: activity.description || ""
    });
  };

  const handleEditSubmit = () => {
    if (!editingTransaction) return;
    editCashTransactionMutation.mutate({
      portfolioId,
      accountId,
      transactionId: editingTransaction.id,
      amount: editFormData.amount,
      description: editFormData.description
    });
  };

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
                  {formatUTCDate(activity.date)}
                </td>                <td className="py-3 px-4">
                  <Badge variant="outline" className="capitalize text-[10px] h-5">
                    {activity.transactionType || "Adjustment"}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-slate-500 italic text-xs max-w-[200px] truncate">
                  {activity.description || "-"}
                </td>
                <td className={`text-right py-3 px-4 font-mono font-bold text-xs ${activity.transactionType === 'withdrawal' ? 'text-red-600' : activity.transactionType === 'deposit' ? 'text-green-600' : 'text-slate-700'}`}>
                  {activity.transactionType === 'withdrawal' ? '-' : activity.transactionType === 'deposit' ? '+' : ''}
                  {formatCurrency(truncateNumber(parseFloat(activity.transactionAmount || activity.amount || "0")))}
                </td>
                <td className="text-right py-3 px-4 font-mono text-xs text-slate-500">
                  {formatCurrency(truncateNumber(parseFloat(activity.amount || "0")))}
                </td>
                <td className="py-3 px-4 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEditClick(activity)}
                      className="h-7 w-7 p-0 text-slate-300 hover:text-blue-600 hover:bg-blue-50"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteTransaction(activity.id)}
                      className="h-7 w-7 p-0 text-slate-300 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
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

      <Dialog open={!!editingTransaction} onOpenChange={() => setEditingTransaction(null)}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Cash Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="grid gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Amount</label>
              <Input 
                type="number" 
                step="0.01"
                value={editFormData.amount} 
                onChange={(e) => setEditFormData(prev => ({ ...prev, amount: e.target.value }))} 
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
              <Input 
                value={editFormData.description} 
                onChange={(e) => setEditFormData(prev => ({ ...prev, description: e.target.value }))} 
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setEditingTransaction(null)}>Cancel</Button>
              <Button onClick={handleEditSubmit} disabled={editCashTransactionMutation.isPending}>
                {editCashTransactionMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
