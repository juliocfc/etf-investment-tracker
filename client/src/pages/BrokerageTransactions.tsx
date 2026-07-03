import React, { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate, formatUTCDate, truncateNumber } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  ArrowRightLeft, 
  ExternalLink, 
  RefreshCw, 
  Settings, 
  ShieldCheck, 
  AlertCircle,
  Calendar,
  Wallet,
  Download,
  CheckCircle2,
  ChevronRight,
  ChevronDown
} from "lucide-react";
import { toast } from "sonner";

interface ImportMapping {
  txId: string;
  date: Date;
  symbol: string;
  quantity: string;
  price: string;
  amount: string;
  type: "deposit" | "withdrawal" | "buy" | "sell";
  portfolioId: number;
  accountId: number;
  originAccountName: string;
  description: string;
}

export default function BrokerageTransactions() {
  // Helper to ensure dates from SnapTrade (YYYY-MM-DD) are treated as UTC Noon
  // We use Noon instead of Midnight to be absolutely safe against any rounding or slight shift
  const getUTCDate = (dateStr: string | Date | null | undefined) => {
    if (!dateStr) return new Date();
    
    let d: Date;
    if (typeof dateStr === "string") {
      // If it's YYYY-MM-DD, parse manually to avoid local TZ interference
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-').map(Number);
        d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      } else {
        d = new Date(dateStr);
      }
    } else {
      d = new Date(dateStr);
    }

    // Return a new Date at UTC noon for that same year/month/day
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
  };

  // Helper to safely render symbol string from potential objects
  const renderSymbol = (symbolWrapper: any) => {
    if (!symbolWrapper) return "N/A";
    
    // Check if it's the double-nested structure from the sample
    const s = symbolWrapper.symbol || symbolWrapper;
    
    if (typeof s === "string") return s;
    if (typeof s.raw_symbol === "string") return s.raw_symbol;
    if (typeof s.symbol === "string") return s.symbol;
    return "N/A";
  };

  const renderDescription = (symbolWrapper: any) => {
    if (!symbolWrapper) return "N/A";
    
    const s = symbolWrapper.symbol || symbolWrapper;
    
    if (typeof s === "string") return "";
    return s.description || "N/A";
  };

  // Config state (stored in local storage for persistence)
  const [config, setConfig] = useState({
    clientId: localStorage.getItem("snaptrade_client_id") || "",
    consumerKey: localStorage.getItem("snaptrade_consumer_key") || "",
    userId: localStorage.getItem("snaptrade_user_id") || "",
    userSecret: localStorage.getItem("snaptrade_user_secret") || "",
  });
  const [isConfigOpen, setIsConfigOpen] = useState(!config.userId);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [selectedHoldingsAccountId, setSelectedHoldingsAccountId] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());

  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
  });

  // Selection & Import state
  const [selectedTxIds, setSelectedTxIds] = useState<Set<number>>(new Set());
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importMappings, setImportMappings] = useState<ImportMapping[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  const toggleAccountExpand = (accountId: string) => {
    const next = new Set(expandedAccounts);
    if (next.has(accountId)) next.delete(accountId);
    else next.add(accountId);
    setExpandedAccounts(next);
  };

  const saveConfig = () => {
    localStorage.setItem("snaptrade_client_id", config.clientId);
    localStorage.setItem("snaptrade_consumer_key", config.consumerKey);
    localStorage.setItem("snaptrade_user_id", config.userId);
    localStorage.setItem("snaptrade_user_secret", config.userSecret);
    setIsConfigOpen(false);
    toast.success("SnapTrade configuration saved locally");
  };

  const { data: users, isLoading: isLoadingUsers } = trpc.brokerage.listUsers.useQuery(
    { 
      clientId: config.clientId,
      consumerKey: config.consumerKey,
    },
    { enabled: !!config.clientId && !!config.consumerKey }
  );

  const { data: brokerageAccounts } = trpc.brokerage.getAccounts.useQuery(
    { 
      clientId: config.clientId,
      consumerKey: config.consumerKey,
      userId: config.userId, 
      userSecret: config.userSecret
    },
    { enabled: !!config.userId && !!config.userSecret }
  );

  const { data: transactionsData, isLoading: isLoadingTx, refetch } = trpc.brokerage.getTransactions.useQuery(
    { 
      clientId: config.clientId,
      consumerKey: config.consumerKey,
      userId: config.userId, 
      userSecret: config.userSecret,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate
    },
    { enabled: !!config.userId && !!config.userSecret }
  );

  const transactions = transactionsData?.transactions;
  const lastSyncAt = transactionsData?.lastSyncAt;

  const { data: holdingsData, isLoading: isLoadingHoldings, refetch: refetchHoldings } = trpc.brokerage.getHoldings.useQuery(
    { 
      clientId: config.clientId,
      consumerKey: config.consumerKey,
      userId: config.userId, 
      userSecret: config.userSecret
    },
    { enabled: !!config.userId && !!config.userSecret }
  );

  const holdings = holdingsData?.holdings;
  const lastHoldingsSyncAt = holdingsData?.lastSyncAt;

  const { data: portfolios } = trpc.portfolio.getDetailedAll.useQuery();
  // We keep this for now but will also use importDate from the cache
  const { data: importedIds, refetch: refetchImported } = trpc.brokerage.getImportedTransactionIds.useQuery(
    { source: "snaptrade" },
    { enabled: !!config.userId }
  );

  const importedSet = useMemo(() => new Set(importedIds || []), [importedIds]);

  const addHoldingMutation = trpc.etf.addHolding.useMutation();
  const executeTradeMutation = trpc.etf.executeTrade.useMutation();
  const recordCashMutation = trpc.etf.recordCashTransaction.useMutation();
  const markImportedMutation = trpc.brokerage.markTransactionsAsImported.useMutation();

  const clearCacheMutation = trpc.brokerage.clearCache.useMutation({
    onSuccess: () => {
      toast.info("Cache cleared. Fetching fresh data from broker...");
      refetch();
      refetchHoldings();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to refresh data");
    }
  });

  const syncTransactionsMutation = trpc.brokerage.syncTransactions.useMutation({
    onMutate: () => {
      toast.info("Triggering transaction sync...");
    },
    onSuccess: (data) => {
      const successCount = data.results?.filter(r => r.success).length || 0;
      const totalCount = data.results?.length || 0;
      
      if (successCount > 0) {
        toast.success(`Successfully triggered sync for ${successCount}/${totalCount} brokerage connections!`);
        toast.info("The system is now updating your cache in the background. Please wait a moment and refresh the data.");
      } else {
        toast.error("No active brokerage connections found to sync.");
      }
      
      // Invalidate queries to show new data
      refetch();
      refetchHoldings();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to sync transactions");
    }
  });

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    
    let filtered = [...transactions];
    
    // Filter by account if selected
    if (selectedAccountId !== "all") {
      filtered = filtered.filter((tx: any) => tx.account?.id === selectedAccountId);
    }

    // Filter by type if selected
    if (selectedType !== "all") {
      filtered = filtered.filter((tx: any) => {
        const typeStr = (typeof tx.type === "string" ? tx.type : (tx.type as any)?.name || "transaction").toLowerCase();
        return typeStr === selectedType.toLowerCase();
      });
    }

    // Filter by symbols if any selected
    if (selectedSymbols.size > 0) {
      filtered = filtered.filter((tx: any) => {
        const sym = renderSymbol(tx.symbol);
        return selectedSymbols.has(sym);
      });
    }
    
    // Sort by date DESC
    return filtered.sort((a: any, b: any) => {
      const dateA = new Date(a.settlement_date || a.trade_date || 0).getTime();
      const dateB = new Date(b.settlement_date || b.trade_date || 0).getTime();
      return dateB - dateA;
    });
  }, [transactions, selectedAccountId, selectedType, selectedSymbols]);

  const transactionTypes = useMemo(() => {
    if (!transactions) return [];
    const types = new Set<string>();
    transactions.forEach((tx: any) => {
      const typeStr = (typeof tx.type === "string" ? tx.type : (tx.type as any)?.name || "transaction");
      if (typeStr) types.add(typeStr);
    });
    return Array.from(types).sort();
  }, [transactions]);

  const transactionSymbols = useMemo(() => {
    if (!transactions) return [];
    const symbols = new Set<string>();
    transactions.forEach((tx: any) => {
      const sym = renderSymbol(tx.symbol);
      if (sym) symbols.add(sym);
    });
    return Array.from(symbols).sort();
  }, [transactions]);

  const toggleSelection = (idx: number) => {
    const next = new Set(selectedTxIds);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedTxIds(next);
  };

  const toggleAll = () => {
    if (selectedTxIds.size === filteredTransactions.length && filteredTransactions.length > 0) {
      setSelectedTxIds(new Set());
    } else if (filteredTransactions.length > 0) {
      setSelectedTxIds(new Set(filteredTransactions.map((_: any, i: number) => i)));
    }
  };

  const openImportModal = () => {
    const selectedTxs = Array.from(selectedTxIds).map(idx => filteredTransactions[idx]);
    
    const initialMappings: ImportMapping[] = selectedTxs.map(tx => {
      const snapTradeType = (typeof tx.type === "string" ? tx.type : (tx.type as any)?.name || "transaction").toLowerCase();
      
      // Default type mapping
      let mappedType: "buy" | "sell" | "deposit" | "withdrawal" = "deposit";
      if (snapTradeType.includes("buy") || snapTradeType === "rei") mappedType = "buy";
      else if (snapTradeType.includes("sell")) mappedType = "sell";
      else if (snapTradeType.includes("withdrawal")) mappedType = "withdrawal";
      else if (snapTradeType.includes("deposit")) mappedType = "deposit";

      // Account matching
      let matchedPortfolioId = 0;
      let matchedAccountId = 0;
      
      if (portfolios && tx.account?.name) {
        const snapAccountName = tx.account.name.toLowerCase();
        for (const p of portfolios) {
          const acc = p.accounts.find((a: any) => a.name.toLowerCase() === snapAccountName);
          if (acc) {
            matchedPortfolioId = p.id;
            matchedAccountId = acc.id;
            break;
          }
        }
      }

      const txAmountRaw = tx.amount || tx.net_amount || 0;
      const txUnitsRaw = tx.units || 0;
      const txUnits = Math.abs(txUnitsRaw); // Use absolute value for internal ledger
      
      let txAmountCalculated = txAmountRaw;
      if (txAmountCalculated === 0 && tx.price) {
        if (txUnits !== 0) {
          txAmountCalculated = tx.price * txUnits;
        } else {
          // Cash transactions (dividends, interest, etc.) sometimes have the value in 'price' 
          // and units as 0 or null
          txAmountCalculated = tx.price;
        }
      }
      
      const absAmount = Math.abs(txAmountCalculated);
      
      // For trades, we prefer to calculate the price from the amount if both are present
      // to ensure that (quantity * price) matches the total amount after truncation.
      let initialPrice: string;
      if ((mappedType === "buy" || mappedType === "sell") && txUnits !== 0 && absAmount !== 0) {
        // Calculate price from amount to ensure consistency
        initialPrice = (absAmount / txUnits).toString();
      } else {
        initialPrice = tx.price?.toString() || (txUnits !== 0 && absAmount !== 0 ? (absAmount / txUnits).toString() : "0");
      }
      
      // Auto-adjust price if it's a trade and (qty * price) != absAmount
      if ((mappedType === "buy" || mappedType === "sell") && txUnits !== 0) {
        const calculatedTotal = truncateNumber(txUnits * parseFloat(initialPrice));
        if (Math.abs(calculatedTotal - absAmount) > 0.01) {
          // Force price to be exactly amount / units if it wasn't already (safety fallback)
          initialPrice = (absAmount / txUnits).toString();
        }
      }

      return {
        txId: tx.id || String(Math.random()),
        date: getUTCDate(tx.trade_date || tx.settlement_date),
        symbol: renderSymbol(tx.symbol),
        quantity: txUnits.toString(),
        price: initialPrice,
        amount: absAmount.toString(),
        type: mappedType,
        portfolioId: matchedPortfolioId,
        accountId: matchedAccountId,
        originAccountName: tx.account?.name || "Unknown",
        description: tx.description || ""
      };
    });

    setImportMappings(initialMappings);
    setIsImportModalOpen(true);
  };

  const executeImport = async () => {
    setIsImporting(true);
    let successCount = 0;
    let errorCount = 0;
    const importedExternalIds: string[] = [];

    try {
      for (const mapping of importMappings) {
        if (!mapping.portfolioId || !mapping.accountId) {
          errorCount++;
          continue;
        }

        try {
          if (mapping.type === "buy" || mapping.type === "sell") {
            // For buys and sells, we use the unified executeTrade mutation 
            // which handles both the asset quantity and the cash balance update
            await executeTradeMutation.mutateAsync({
              portfolioId: mapping.portfolioId,
              accountId: mapping.accountId,
              holdingId: -1, // Look up by symbol
              symbol: mapping.symbol,
              quantity: mapping.quantity,
              price: mapping.price,
              purchaseDate: mapping.date,
              type: mapping.type as "buy" | "sell",
              fees: "0"
            });
          } else {
            await recordCashMutation.mutateAsync({
              portfolioId: mapping.portfolioId,
              accountId: mapping.accountId,
              type: mapping.type as "deposit" | "withdrawal",
              amount: mapping.amount,
              description: `Imported: ${mapping.description}`,
              date: mapping.date
            });
          }
          importedExternalIds.push(mapping.txId);
          successCount++;
        } catch (e) {
          console.error("Import error for mapping:", mapping, e);
          errorCount++;
        }
      }

      if (importedExternalIds.length > 0) {
        await markImportedMutation.mutateAsync({
          externalIds: importedExternalIds,
          source: "snaptrade"
        });
        await refetchImported();
      }

      if (successCount > 0) {
        toast.success(`Successfully imported ${successCount} transactions`);
      }
      if (errorCount > 0) {
        toast.error(`Failed to import ${errorCount} transactions`);
      }

      setIsImportModalOpen(false);
      setSelectedTxIds(new Set());
    } finally {
      setIsImporting(false);
    }
  };

  const getSymbolString = (symbolWrapper: any): string => {
    if (!symbolWrapper) return "";
    const s = symbolWrapper.symbol || symbolWrapper;
    if (typeof s === "string") return s;
    if (typeof s.raw_symbol === "string") return s.raw_symbol;
    if (typeof s.symbol === "string") return s.symbol;
    return "";
  };

  const getHoldingName = (symbolWrapper: any): string => {
    if (!symbolWrapper) return "";
    const s = symbolWrapper.symbol || symbolWrapper;
    if (typeof s === "string") return "";
    return s.description || "";
  };

  const classifyHolding = (h: any): "cash" | "treasury" | "equity" => {
    const symbolStr = getSymbolString(h.symbol).toUpperCase();
    const nameStr = getHoldingName(h.symbol).toUpperCase();

    if (["FDRXX", "SPAXX", "FDIC91026"].includes(symbolStr)) {
      return "cash";
    }
    if (nameStr.includes("UNITED STATES TREAS")) {
      return "treasury";
    }
    return "equity";
  };

  const groupedHoldings = useMemo(() => {
    if (!holdings) return [];
    
    const groups: Record<string, { 
      account: any, 
      holdings: any[], 
      totalMarketValue: number,
      totalCash: number,
      totalTreasury: number,
      totalEquity: number
    }> = {};
    
    holdings.forEach((h: any) => {
      // Filter by account if selected
      if (selectedHoldingsAccountId !== "all" && h.account?.id !== selectedHoldingsAccountId) {
        return;
      }

      const accId = h.account?.id || "unknown";
      if (!groups[accId]) {
        groups[accId] = {
          account: h.account,
          holdings: [],
          totalMarketValue: 0,
          totalCash: 0,
          totalTreasury: 0,
          totalEquity: 0
        };
      }
      
      groups[accId].holdings.push(h);
      const mktVal = (h.units || 0) * (h.price || 0);
      groups[accId].totalMarketValue += mktVal;

      const category = classifyHolding(h);
      if (category === "cash") {
        groups[accId].totalCash += mktVal;
      } else if (category === "treasury") {
        groups[accId].totalTreasury += mktVal;
      } else {
        groups[accId].totalEquity += mktVal;
      }
    });
    
    // Sort groups by total market value DESC
    return Object.values(groups).sort((a, b) => b.totalMarketValue - a.totalMarketValue);
  }, [holdings, selectedHoldingsAccountId]);

  const getMaturityDate = (description: string): string => {
    const match = description.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
    if (match) {
      return match[0];
    }
    return "Unknown";
  };

  const parseMaturityDate = (dateStr: string): Date => {
    if (dateStr === "Unknown") return new Date(8640000000000000);
    const [m, d, y] = dateStr.split("/").map(Number);
    return new Date(y, m - 1, d);
  };

  const [expandedMaturities, setExpandedMaturities] = useState<Set<string>>(new Set());

  const toggleMaturityExpand = (maturityDate: string) => {
    setExpandedMaturities((prev) => {
      const next = new Set(prev);
      if (next.has(maturityDate)) {
        next.delete(maturityDate);
      } else {
        next.add(maturityDate);
      }
      return next;
    });
  };

  const treasuryMaturityGroups = useMemo(() => {
    if (!holdings) return [];

    const groups: Record<string, {
      maturityDate: string,
      holdings: any[],
      totalMarketValue: number
    }> = {};

    holdings.forEach((h: any) => {
      if (selectedHoldingsAccountId !== "all" && h.account?.id !== selectedHoldingsAccountId) {
        return;
      }

      const category = classifyHolding(h);
      if (category !== "treasury") return;

      const desc = getHoldingName(h.symbol);
      const maturity = getMaturityDate(desc);

      if (!groups[maturity]) {
        groups[maturity] = {
          maturityDate: maturity,
          holdings: [],
          totalMarketValue: 0
        };
      }

      groups[maturity].holdings.push(h);
      groups[maturity].totalMarketValue += (h.units || 0) * (h.price || 0);
    });

    return Object.values(groups).sort((a, b) => {
      const dateA = parseMaturityDate(a.maturityDate);
      const dateB = parseMaturityDate(b.maturityDate);
      return dateA.getTime() - dateB.getTime();
    });
  }, [holdings, selectedHoldingsAccountId]);

  useEffect(() => {
    if (treasuryMaturityGroups.length > 0 && expandedMaturities.size === 0) {
      //setExpandedMaturities(new Set(treasuryMaturityGroups.map(g => g.maturityDate)));
    }
  }, [treasuryMaturityGroups]);

  const getMaturityMonthYear = (maturityDateStr: string): string => {
    if (maturityDateStr === "Unknown") return "Unknown";
    const [m, d, y] = maturityDateStr.split("/").map(Number);
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    return `${months[m - 1]} ${y}`;
  };

  const parseMonthYear = (myStr: string): Date => {
    if (myStr === "Unknown") return new Date(8640000000000000);
    const [monthName, yearStr] = myStr.split(" ");
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const m = months.indexOf(monthName);
    const y = Number(yearStr);
    return new Date(y, m, 1);
  };

  const [expandedMonthMaturities, setExpandedMonthMaturities] = useState<Set<string>>(new Set());

  const toggleMonthMaturityExpand = (monthYear: string) => {
    setExpandedMonthMaturities((prev) => {
      const next = new Set(prev);
      if (next.has(monthYear)) {
        next.delete(monthYear);
      } else {
        next.add(monthYear);
      }
      return next;
    });
  };

  const treasuryMonthYearGroups = useMemo(() => {
    if (!holdings) return [];

    const groups: Record<string, {
      monthYear: string,
      holdings: any[],
      totalMarketValue: number
    }> = {};

    holdings.forEach((h: any) => {
      if (selectedHoldingsAccountId !== "all" && h.account?.id !== selectedHoldingsAccountId) {
        return;
      }

      const category = classifyHolding(h);
      if (category !== "treasury") return;

      const desc = getHoldingName(h.symbol);
      const maturity = getMaturityDate(desc);
      const monthYear = getMaturityMonthYear(maturity);

      if (!groups[monthYear]) {
        groups[monthYear] = {
          monthYear: monthYear,
          holdings: [],
          totalMarketValue: 0
        };
      }

      groups[monthYear].holdings.push(h);
      groups[monthYear].totalMarketValue += (h.units || 0) * (h.price || 0);
    });

    return Object.values(groups).sort((a, b) => {
      const dateA = parseMonthYear(a.monthYear);
      const dateB = parseMonthYear(b.monthYear);
      return dateA.getTime() - dateB.getTime();
    });
  }, [holdings, selectedHoldingsAccountId]);

  useEffect(() => {
    if (treasuryMonthYearGroups.length > 0 && expandedMonthMaturities.size === 0) {
      //setExpandedMonthMaturities(new Set(treasuryMonthYearGroups.map(g => g.monthYear)));
    }
  }, [treasuryMonthYearGroups]);

  const getLoginUrl = trpc.brokerage.getLoginUrl.useQuery(
    { 
      clientId: config.clientId,
      consumerKey: config.consumerKey,
      userId: config.userId,
      userSecret: config.userSecret,
      redirectURI: window.location.origin
    },
    { enabled: !!config.userId && !!config.userSecret, staleTime: 0 }
  );

  const handleConnect = () => {
    const loginData = getLoginUrl.data as any;
    if (loginData?.redirectURI) {
      window.open(loginData.redirectURI, "_blank");
    } else {
      toast.error("Connect URL not available");
    }
  };

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-lg shadow-sm border border-border">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Brokerage Transactions</h2>
            <p className="text-xs text-slate-500 font-medium">
              Real-time sync via SnapTrade Secure Link
              {lastSyncAt && (
                <span className="ml-2 text-primary font-bold">
                  (Last Sync: {new Date(lastSyncAt).toLocaleString()})
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncTransactionsMutation.mutate({
              clientId: config.clientId,
              consumerKey: config.consumerKey,
              userId: config.userId,
              userSecret: config.userSecret
            })}
            disabled={!config.userId || syncTransactionsMutation.isPending}
            className="text-xs font-bold uppercase"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${syncTransactionsMutation.isPending ? "animate-spin" : ""}`} />
            Sync Transactions
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsConfigOpen(!isConfigOpen)}
            className="text-xs font-bold uppercase"
          >
            <Settings className="w-3.5 h-3.5 mr-2" />
            Config
          </Button>
          <Button 
            onClick={handleConnect}
            disabled={!config.userId || getLoginUrl.isLoading}
            className="bg-[#004a99] hover:bg-[#003d7a] text-xs font-bold uppercase"
          >
            <ExternalLink className="w-3.5 h-3.5 mr-2" />
            Connect Broker
          </Button>
        </div>
      </div>

      {isConfigOpen && (
        <Card className="p-6 bg-slate-50 border-blue-100 shadow-sm">
          <div className="flex items-start gap-4 mb-6">
            <ShieldCheck className="w-5 h-5 text-blue-600 mt-1" />
            <div>
              <h3 className="font-bold text-slate-800">SnapTrade Connection</h3>
              <p className="text-xs text-slate-500">Provide your SnapTrade User ID and User Secret to sync transactions. These are stored only in your browser's local storage.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Client ID</label>
              <Input 
                value={config.clientId} 
                onChange={(e) => setConfig(prev => ({ ...prev, clientId: e.target.value }))}
                placeholder="SnapTrade Client ID"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Consumer Key</label>
              <Input 
                type="password"
                value={config.consumerKey} 
                onChange={(e) => setConfig(prev => ({ ...prev, consumerKey: e.target.value }))}
                placeholder="SnapTrade Consumer Key"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">User ID</label>
              <select 
                className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={config.userId} 
                onChange={(e) => setConfig(prev => ({ ...prev, userId: e.target.value }))}
              >
                <option value="">Select User ID</option>
                {users?.map((userId: string) => (
                  <option key={userId} value={userId}>{userId}</option>
                ))}
              </select>
              {isLoadingUsers && <p className="text-[9px] text-blue-600 font-bold animate-pulse uppercase">Fetching registered users...</p>}
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">User Secret</label>
              <Input 
                type="password"
                value={config.userSecret} 
                onChange={(e) => setConfig(prev => ({ ...prev, userSecret: e.target.value }))}
                placeholder="SnapTrade User Secret"
              />
            </div>
          </div>
          <Button onClick={saveConfig} className="mt-6 w-full md:w-auto px-8">Save Configuration</Button>
        </Card>
      )}

      {config.userId ? (
        <>
          {/* Accounts Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 bg-white shadow-sm border border-border">
              <div className="flex items-center gap-3 mb-4">
                <Wallet className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Connected Accounts</h3>
              </div>
              <div className="text-2xl font-bold text-slate-800">{brokerageAccounts?.length || 0}</div>
            </Card>
            
            <Card className="p-6 bg-white shadow-sm border border-border md:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-orange-500" />
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Timeframe</h3>
                </div>
                <Button variant="ghost" size="sm" onClick={() => clearCacheMutation.mutate()} className="h-6 text-[10px] uppercase font-bold">
                  <RefreshCw className={`w-3 h-3 mr-1 ${isLoadingTx || clearCacheMutation.isPending ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
              <div className="flex items-center gap-4">
                <Input 
                  type="date" 
                  value={dateRange.startDate} 
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                  className="max-w-[200px]"
                />
                <span className="text-slate-400 font-bold">to</span>
                <Input 
                  type="date" 
                  value={dateRange.endDate} 
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                  className="max-w-[200px]"
                />
              </div>
            </Card>
          </div>

          {/* Transactions Table */}
          <Card className="bg-white shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Transaction Ledger</h3>
                <Button 
                  size="sm" 
                  onClick={openImportModal}
                  disabled={selectedTxIds.size === 0}
                  className={`h-7 text-[10px] uppercase font-bold ${selectedTxIds.size > 0 ? "bg-green-600 hover:bg-green-700 text-white" : "bg-slate-100 text-slate-400"}`}
                >
                  <Download className="w-3 h-3 mr-1.5" />
                  Import Selected ({selectedTxIds.size})
                </Button>
              </div>
              
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter Account:</span>
                  <select 
                    className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary h-8 min-w-[160px]"
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                  >
                    <option value="all">All Accounts</option>
                    {brokerageAccounts?.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.number})</option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter Type:</span>
                  <select 
                    className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary h-8 min-w-[120px]"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                  >
                    <option value="all">All Types</option>
                    {transactionTypes.map((type: string) => (
                      <option key={type} value={type}>
                        {type.toLowerCase() === "rei" ? "REINVESTMENT" : type}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter Symbol:</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 text-xs font-bold text-slate-600 min-w-[140px] justify-between">
                        {selectedSymbols.size === 0 ? "All Symbols" : `${selectedSymbols.size} Selected`}
                        <ChevronDown className="ml-2 h-3 w-3 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0 bg-white" align="start">
                      <div className="p-2 border-b border-slate-100">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full justify-start text-[10px] font-bold uppercase h-7"
                          onClick={() => setSelectedSymbols(new Set())}
                        >
                          Clear All
                        </Button>
                      </div>
                      <div className="max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
                        {transactionSymbols.map((symbol) => (
                          <div 
                            key={symbol} 
                            className="flex items-center space-x-2 px-2 py-1.5 hover:bg-slate-50 rounded cursor-pointer"
                            onClick={() => {
                              const next = new Set(selectedSymbols);
                              if (next.has(symbol)) next.delete(symbol);
                              else next.add(symbol);
                              setSelectedSymbols(next);
                            }}
                          >
                            <Checkbox 
                              checked={selectedSymbols.has(symbol)} 
                              onCheckedChange={() => {}} // Handled by div onClick
                            />
                            <span className="text-xs font-bold text-slate-700">{symbol}</span>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-100 border-b border-border">
                    <th className="py-3 px-6 text-left w-12 bg-slate-200/50">
                      <div className="flex flex-col items-center gap-1">
                        <input 
                          type="checkbox"
                          checked={selectedTxIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                          onChange={toggleAll}
                          className="w-4 h-4 rounded border-slate-400 text-primary focus:ring-primary cursor-pointer"
                        />
                        <span className="text-[8px] font-bold text-slate-500">ALL</span>
                      </div>
                    </th>
                    <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Date</th>
                    <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Account</th>
                    <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider w-24">Type</th>
                    <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Description</th>
                    <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Symbol</th>
                    <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Units</th>
                    <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Price</th>
                    <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Amount</th>
                    <th className="text-center py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingTx ? (
                    <tr>
                      <td colSpan={10} className="py-20 text-center">
                        <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-4 opacity-50" />
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Syncing with Broker...</p>
                      </td>
                    </tr>
                  ) : filteredTransactions && filteredTransactions.length > 0 ? (
                    filteredTransactions.map((tx: any, idx: number) => {
                      const isAlreadyImported = !!tx.importDate || importedSet.has(tx.id);
                      return (
                        <tr key={idx} className={`transition-colors ${selectedTxIds.has(idx) ? "bg-blue-50/30" : "hover:bg-slate-50/50"} ${isAlreadyImported ? "opacity-60" : ""}`}>
                          <td className="py-4 px-6 bg-slate-50/30 border-r border-slate-100 text-center">
                            <input 
                              type="checkbox"
                              checked={selectedTxIds.has(idx)}
                              disabled={isAlreadyImported}
                              onChange={() => toggleSelection(idx)}
                              className="w-4 h-4 rounded border-slate-400 text-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="py-4 px-6 font-mono text-xs text-slate-500">{formatUTCDate(tx.settlement_date || tx.trade_date)}</td>
                          <td className="py-4 px-6">
                            <div className="text-sm font-bold text-slate-700">{tx.account?.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{tx.account?.number}</div>
                          </td>
                          <td className="py-4 px-6">
                            <Badge variant="outline" className="capitalize text-[10px] font-bold">
                              {(() => {
                                const rawType = (typeof tx.type === "string" ? tx.type : (tx.type as any)?.name || "transaction").toLowerCase();
                                return rawType === "rei" ? "reinvestment" : rawType;
                              })()}
                            </Badge>
                          </td>
                          <td className="py-4 px-6 text-xs text-slate-600 max-w-[300px] truncate" title={tx.description}>
                            {tx.description}
                          </td>
                          <td className="py-4 px-6 text-right font-bold text-primary">{renderSymbol(tx.symbol)}</td>
                          <td className="py-4 px-6 text-right font-mono text-xs text-slate-600">{tx.units || "-"}</td>
                          <td className="py-4 px-6 text-right font-mono text-xs text-slate-600">{tx.price ? formatCurrency(tx.price) : "-"}</td>
                          <td className={`py-4 px-6 text-right font-mono font-bold ${tx.amount < 0 ? "text-red-600" : "text-green-600"}`}>
                            {formatCurrency(tx.amount)}
                          </td>
                          <td className="py-4 px-6 text-center">
                            {isAlreadyImported ? (
                              <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-[8px] font-bold uppercase">Imported</Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-600 border-green-200 text-[8px] font-bold uppercase bg-green-50/50">Ready</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-20 text-center text-slate-400 italic">
                        No transactions found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
            <DialogContent className="max-w-[95vw] md:max-w-[1200px] max-h-[90vh] overflow-hidden flex flex-col p-0 text-slate-900 bg-white">
              <DialogHeader className="p-6 border-b">
                <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                  <Download className="w-5 h-5 text-green-600" />
                  Confirm Transaction Import
                </DialogTitle>
                <DialogDescription>
                  Review and map your brokerage transactions to your internal portfolios and accounts.
                </DialogDescription>
              </DialogHeader>

              <div className="flex-1 overflow-auto p-6">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="border-b border-slate-100 text-slate-400 uppercase text-[10px] font-bold tracking-widest">
                      <th className="text-left py-2 px-3">Date/Desc</th>
                      <th className="text-left py-2 px-3">Origin</th>
                      <th className="text-left py-2 px-3">Type Mapping</th>
                      <th className="text-left py-2 px-3">Target Account</th>
                      <th className="text-right py-2 px-3">Asset</th>
                      <th className="text-right py-2 px-3">Price</th>
                      <th className="text-right py-2 px-3">Qty</th>
                      <th className="text-right py-2 px-3">Orig. Amt</th>
                      <th className="text-right py-2 px-3">Calc. Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {importMappings.map((mapping, idx) => (
                      <tr key={idx} className="group hover:bg-slate-50/50">
                        <td className="py-3 px-3">
                          <div className="font-mono text-[10px] text-slate-400">{formatUTCDate(mapping.date)}</div>
                          <div className="text-xs font-medium truncate max-w-[150px]" title={mapping.description}>{mapping.description}</div>
                        </td>
                        <td className="py-3 px-3">
                          <Badge variant="secondary" className="text-[9px] h-5">{mapping.originAccountName}</Badge>
                        </td>
                        <td className="py-3 px-3">
                          <Select 
                            value={mapping.type} 
                            onValueChange={(val: any) => {
                              const next = [...importMappings];
                              next[idx].type = val;
                              setImportMappings(next);
                            }}
                          >
                            <SelectTrigger className="h-8 text-[10px] min-w-[100px] bg-white border border-input">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              <SelectItem value="deposit">Deposit</SelectItem>
                              <SelectItem value="withdrawal">Withdraw</SelectItem>
                              <SelectItem value="buy">Purchase</SelectItem>
                              <SelectItem value="sell">Sale</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-3 px-3">
                          <Select 
                            value={mapping.accountId ? `${mapping.portfolioId}-${mapping.accountId}` : "none"} 
                            onValueChange={(val) => {
                              const next = [...importMappings];
                              if (val === "none") {
                                next[idx].portfolioId = 0;
                                next[idx].accountId = 0;
                              } else {
                                const [pid, aid] = val.split("-").map(Number);
                                next[idx].portfolioId = pid;
                                next[idx].accountId = aid;
                              }
                              setImportMappings(next);
                            }}
                          >
                            <SelectTrigger className={`h-8 text-[10px] min-w-[180px] bg-white border ${!mapping.accountId ? "border-orange-200 bg-orange-50 text-orange-700" : "border-input"}`}>
                              <SelectValue placeholder="Select Target Account" />
                            </SelectTrigger>
                            <SelectContent className="bg-white">
                              <SelectItem value="none">-- Skip Transaction --</SelectItem>
                              {portfolios?.map(p => (
                                <React.Fragment key={p.id}>
                                  <div className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-tighter bg-slate-50/50">{p.name}</div>
                                  {p.accounts.map((acc: any) => (
                                    <SelectItem key={`${p.id}-${acc.id}`} value={`${p.id}-${acc.id}`} className="pl-4">
                                      {acc.name}
                                    </SelectItem>
                                  ))}
                                </React.Fragment>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="font-bold text-primary">{mapping.symbol}</div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs">
                          {mapping.type === "buy" || mapping.type === "sell" ? formatCurrency(mapping.price) : "-"}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs">
                          {mapping.type === "buy" || mapping.type === "sell" ? mapping.quantity : "-"}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs text-slate-400">
                          {formatCurrency(mapping.amount)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-xs font-bold">
                          {mapping.type === "buy" || mapping.type === "sell" 
                            ? formatCurrency(truncateNumber(parseFloat(mapping.quantity || "0") * parseFloat(mapping.price || "0")))
                            : formatCurrency(mapping.amount)
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <DialogFooter className="p-6 border-t bg-slate-50/50">
                <Button variant="ghost" onClick={() => setIsImportModalOpen(false)}>Cancel</Button>
                <Button 
                  onClick={executeImport} 
                  disabled={isImporting || importMappings.every(m => !m.accountId)}
                  className="bg-green-600 hover:bg-green-700 text-xs font-bold uppercase min-w-[150px] text-white"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 mr-2" />
                      Execute Import
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Holdings Table */}
          <Card className="bg-white shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-col">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Account Holdings</h3>
                {lastHoldingsSyncAt && (
                  <span className="text-[10px] text-primary font-bold">
                    Last Sync: {new Date(lastHoldingsSyncAt).toLocaleString()}
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter Account:</span>
                <select 
                  className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary h-8 min-w-[160px]"
                  value={selectedHoldingsAccountId}
                  onChange={(e) => setSelectedHoldingsAccountId(e.target.value)}
                >
                  <option value="all">All Accounts</option>
                  {brokerageAccounts?.map((acc: any) => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.number})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-border text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-6 text-left w-10"></th>
                    <th className="text-left py-3 px-6">Account / Asset</th>
                    <th className="text-left py-3 px-6">Details</th>
                    <th className="text-right py-3 px-6">Shares</th>
                    <th className="text-right py-3 px-6">Avg Cost</th>
                    <th className="text-right py-3 px-6">Price</th>
                    <th className="text-right py-3 px-6">Cash</th>
                    <th className="text-right py-3 px-6">US Treasuries</th>
                    <th className="text-right py-3 px-6">Equities</th>
                    <th className="text-right py-3 px-6">Market Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingHoldings ? (
                    <tr>
                      <td colSpan={10} className="py-20 text-center">
                        <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-4 opacity-50" />
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fetching Positions...</p>
                      </td>
                    </tr>
                  ) : groupedHoldings && groupedHoldings.length > 0 ? (
                    groupedHoldings.map((group: any) => {
                      const accId = group.account?.id || "unknown";
                      const isExpanded = expandedAccounts.has(accId);
                      
                      return (
                        <React.Fragment key={accId}>
                          {/* Account Header Row */}
                          <tr 
                            className="bg-slate-50/80 cursor-pointer hover:bg-slate-100 transition-colors"
                            onClick={() => toggleAccountExpand(accId)}
                          >
                            <td className="py-4 px-6 text-center">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            </td>
                            <td className="py-4 px-6" colSpan={2}>
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800">{group.account?.name || "Unknown Account"}</span>
                                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">{group.account?.number}</span>
                              </div>
                            </td>
                            <td className="py-4 px-6 text-right font-mono text-xs text-slate-500">
                              {group.holdings.length} Assets
                            </td>
                            <td className="py-4 px-6" colSpan={2}></td>
                            <td className="py-4 px-6 text-right font-mono font-bold text-slate-700">
                              {formatCurrency(group.totalCash)}
                            </td>
                            <td className="py-4 px-6 text-right font-mono font-bold text-slate-700">
                              {formatCurrency(group.totalTreasury)}
                            </td>
                            <td className="py-4 px-6 text-right font-mono font-bold text-slate-700">
                              {formatCurrency(group.totalEquity)}
                            </td>
                            <td className="py-4 px-6 text-right font-mono font-bold text-slate-900">
                              {formatCurrency(group.totalMarketValue)}
                            </td>
                          </tr>
                          
                          {/* Individual Holdings (Visible if expanded) */}
                          {isExpanded && group.holdings.map((h: any, hIdx: number) => {
                            const category = classifyHolding(h);
                            const mktVal = (h.units || 0) * (h.price || 0);

                            return (
                              <tr key={`${accId}-${hIdx}`} className="bg-white hover:bg-slate-50/30 border-l-4 border-l-primary/20">
                                <td></td>
                                <td className="py-3 px-6 pl-10">
                                  <div className="font-bold text-primary text-sm">{renderSymbol(h.symbol)}</div>
                                </td>
                                <td className="py-3 px-6">
                                  <div className="text-[10px] text-slate-500 truncate max-w-[200px]" title={renderDescription(h.symbol)}>
                                    {renderDescription(h.symbol)}
                                  </div>
                                </td>
                                <td className="py-3 px-6 text-right font-mono text-xs font-medium">
                                  {h.units}
                                </td>
                                <td className="py-3 px-6 text-right font-mono text-xs text-slate-500">
                                  {formatCurrency(h.average_purchase_price)}
                                </td>
                                <td className="py-3 px-6 text-right font-mono text-xs text-slate-500">
                                  {formatCurrency(h.price)}
                                </td>
                                <td className="py-3 px-6 text-right font-mono text-xs text-slate-600">
                                  {category === "cash" ? formatCurrency(mktVal) : "-"}
                                </td>
                                <td className="py-3 px-6 text-right font-mono text-xs text-slate-600">
                                  {category === "treasury" ? formatCurrency(mktVal) : "-"}
                                </td>
                                <td className="py-3 px-6 text-right font-mono text-xs text-slate-600">
                                  {category === "equity" ? formatCurrency(mktVal) : "-"}
                                </td>
                                <td className="py-3 px-6 text-right font-mono font-bold text-slate-700">
                                  {formatCurrency(mktVal)}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-20 text-center text-slate-400 italic">
                        No positions found for these accounts.
                      </td>
                    </tr>
                  )}
                </tbody>
                {groupedHoldings && groupedHoldings.length > 0 && (
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                    <tr className="font-bold text-slate-800">
                      <td className="py-4 px-6"></td>
                      <td className="py-4 px-6 uppercase text-[10px] tracking-widest text-slate-500" colSpan={2}>
                        Overall Total Market Value
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-xs text-slate-500">
                        {groupedHoldings.reduce((sum: number, group: any) => sum + group.holdings.length, 0)} Assets
                      </td>
                      <td className="py-4 px-6" colSpan={2}></td>
                      <td className="py-4 px-6 text-right font-mono font-bold text-slate-700">
                        {formatCurrency(groupedHoldings.reduce((sum: number, group: any) => sum + group.totalCash, 0))}
                      </td>
                      <td className="py-4 px-6 text-right font-mono font-bold text-slate-700">
                        {formatCurrency(groupedHoldings.reduce((sum: number, group: any) => sum + group.totalTreasury, 0))}
                      </td>
                      <td className="py-4 px-6 text-right font-mono font-bold text-slate-700">
                        {formatCurrency(groupedHoldings.reduce((sum: number, group: any) => sum + group.totalEquity, 0))}
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-lg text-primary">
                        {formatCurrency(groupedHoldings.reduce((sum: number, group: any) => sum + group.totalMarketValue, 0))}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

          {/* US Treasuries by Maturity Date */}
          {treasuryMaturityGroups.length > 0 && (
            <Card className="bg-white shadow-sm border border-border overflow-hidden mt-8">
              <div className="px-6 py-4 border-b border-border bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">US Treasuries Maturity Schedule</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-border text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-6 text-left w-10"></th>
                      <th className="text-left py-3 px-6">Maturity Date / Asset</th>
                      <th className="text-left py-3 px-6">Description</th>
                      <th className="text-left py-3 px-6">Account</th>
                      <th className="text-right py-3 px-6">Shares</th>
                      <th className="text-right py-3 px-6">Price</th>
                      <th className="text-right py-3 px-6">Market Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {treasuryMaturityGroups.map((group) => {
                      const key = group.maturityDate;
                      const isExpanded = expandedMaturities.has(key);
                      return (
                        <React.Fragment key={key}>
                          {/* Maturity Group Header Row */}
                          <tr 
                            className="bg-slate-50/80 cursor-pointer hover:bg-slate-100 transition-colors"
                            onClick={() => toggleMaturityExpand(key)}
                          >
                            <td className="py-4 px-6 text-center">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            </td>
                            <td className="py-4 px-6 font-bold text-slate-800" colSpan={3}>
                              Maturity: {group.maturityDate}
                            </td>
                            <td className="py-4 px-6 text-right font-mono text-xs text-slate-500">
                              {group.holdings.length} Positions
                            </td>
                            <td></td>
                            <td className="py-4 px-6 text-right font-mono font-bold text-slate-900">
                              {formatCurrency(group.totalMarketValue)}
                            </td>
                          </tr>

                          {/* Individual Holdings under this Maturity */}
                          {isExpanded && group.holdings.map((h: any, idx: number) => {
                            const mktVal = (h.units || 0) * (h.price || 0);
                            return (
                              <tr key={`${key}-${idx}`} className="bg-white hover:bg-slate-50/30 border-l-4 border-l-orange-500/20">
                                <td></td>
                                <td className="py-3 px-6 pl-10">
                                  <div className="font-bold text-slate-800 text-sm">{renderSymbol(h.symbol)}</div>
                                </td>
                                <td className="py-3 px-6">
                                  <div className="text-xs text-slate-600 truncate max-w-[300px]">
                                    {renderDescription(h.symbol)}
                                  </div>
                                </td>
                                <td className="py-3 px-6">
                                  <div className="text-xs text-slate-500 font-medium">
                                    {h.account?.name} ({h.account?.number})
                                  </div>
                                </td>
                                <td className="py-3 px-6 text-right font-mono text-xs font-medium">
                                  {h.units}
                                </td>
                                <td className="py-3 px-6 text-right font-mono text-xs text-slate-500">
                                  {formatCurrency(h.price)}
                                </td>
                                <td className="py-3 px-6 text-right font-mono font-bold text-slate-700">
                                  {formatCurrency(mktVal)}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                    <tr className="font-bold text-slate-800">
                      <td className="py-4 px-6"></td>
                      <td className="py-4 px-6 uppercase text-[10px] tracking-widest text-slate-500" colSpan={3}>
                        Total US Treasuries Value
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-xs text-slate-500">
                        {treasuryMaturityGroups.reduce((sum: number, group: any) => sum + group.holdings.length, 0)} Positions
                      </td>
                      <td></td>
                      <td className="py-4 px-6 text-right font-mono text-lg text-primary">
                        {formatCurrency(treasuryMaturityGroups.reduce((sum: number, group: any) => sum + group.totalMarketValue, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}

          {/* US Treasuries by Month/Year */}
          {treasuryMonthYearGroups.length > 0 && (
            <Card className="bg-white shadow-sm border border-border overflow-hidden mt-8">
              <div className="px-6 py-4 border-b border-border bg-slate-50/50">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">US Treasuries Monthly Maturity Schedule</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-border text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                      <th className="py-3 px-6 text-left w-10"></th>
                      <th className="text-left py-3 px-6">Maturity Month / Asset</th>
                      <th className="text-left py-3 px-6">Description</th>
                      <th className="text-left py-3 px-6">Account</th>
                      <th className="text-right py-3 px-6">Shares</th>
                      <th className="text-right py-3 px-6">Price</th>
                      <th className="text-right py-3 px-6">Market Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {treasuryMonthYearGroups.map((group) => {
                      const key = group.monthYear;
                      const isExpanded = expandedMonthMaturities.has(key);
                      return (
                        <React.Fragment key={key}>
                          {/* Maturity Group Header Row */}
                          <tr 
                            className="bg-slate-50/80 cursor-pointer hover:bg-slate-100 transition-colors"
                            onClick={() => toggleMonthMaturityExpand(key)}
                          >
                            <td className="py-4 px-6 text-center">
                              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                            </td>
                            <td className="py-4 px-6 font-bold text-slate-800" colSpan={3}>
                              Maturity Month: {group.monthYear}
                            </td>
                            <td className="py-4 px-6 text-right font-mono text-xs text-slate-500">
                              {group.holdings.length} Positions
                            </td>
                            <td colSpan={1}></td>
                            <td className="py-4 px-6 text-right font-mono font-bold text-slate-900">
                              {formatCurrency(group.totalMarketValue)}
                            </td>
                          </tr>

                          {/* Individual Holdings under this Maturity */}
                          {isExpanded && group.holdings.map((h: any, idx: number) => {
                            const mktVal = (h.units || 0) * (h.price || 0);
                            return (
                              <tr key={`${key}-${idx}`} className="bg-white hover:bg-slate-50/30 border-l-4 border-l-orange-500/20">
                                <td></td>
                                <td className="py-3 px-6 pl-10">
                                  <div className="font-bold text-slate-800 text-sm">{renderSymbol(h.symbol)}</div>
                                </td>
                                <td className="py-3 px-6">
                                  <div className="text-xs text-slate-600 truncate max-w-[300px]">
                                    {renderDescription(h.symbol)}
                                  </div>
                                </td>
                                <td className="py-3 px-6">
                                  <div className="text-xs text-slate-500 font-medium">
                                    {h.account?.name} ({h.account?.number})
                                  </div>
                                </td>
                                <td className="py-3 px-6 text-right font-mono text-xs font-medium">
                                  {h.units}
                                </td>
                                <td className="py-3 px-6 text-right font-mono text-xs text-slate-500">
                                  {formatCurrency(h.price)}
                                </td>
                                <td className="py-3 px-6 text-right font-mono font-bold text-slate-700">
                                  {formatCurrency(mktVal)}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                    <tr className="font-bold text-slate-800">
                      <td className="py-4 px-6"></td>
                      <td className="py-4 px-6 uppercase text-[10px] tracking-widest text-slate-500" colSpan={3}>
                        Total US Treasuries Value
                      </td>
                      <td className="py-4 px-6 text-right font-mono text-xs text-slate-500">
                        {treasuryMonthYearGroups.reduce((sum: number, group: any) => sum + group.holdings.length, 0)} Positions
                      </td>
                      <td colSpan={1}></td>
                      <td className="py-4 px-6 text-right font-mono text-lg text-primary">
                        {formatCurrency(treasuryMonthYearGroups.reduce((sum: number, group: any) => sum + group.totalMarketValue, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : (
        <Card className="p-20 text-center border-dashed border-2 border-slate-200 bg-white">
          <AlertCircle className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-800 mb-2">Sync Required</h3>
          <p className="text-slate-500 max-w-sm mx-auto mb-8 text-sm">
            Configure your SnapTrade credentials to automatically sync transactions from your brokerage accounts.
          </p>
          <Button onClick={() => setIsConfigOpen(true)}>Configure SnapTrade</Button>
        </Card>
      )}
    </div>
  );
}
