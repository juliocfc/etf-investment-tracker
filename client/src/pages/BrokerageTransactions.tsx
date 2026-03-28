import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRightLeft, 
  ExternalLink, 
  RefreshCw, 
  Settings, 
  ShieldCheck, 
  AlertCircle,
  Calendar,
  Wallet
} from "lucide-react";
import { toast } from "sonner";

export default function BrokerageTransactions() {
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

  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
  });

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

  const { data: accounts, isLoading: isLoadingAccounts } = trpc.brokerage.getAccounts.useQuery(
    { 
      clientId: config.clientId,
      consumerKey: config.consumerKey,
      userId: config.userId,
      userSecret: config.userSecret
    },
    { enabled: !!config.userId && !!config.userSecret }
  );

  const { data: transactions, isLoading: isLoadingTx, refetch } = trpc.brokerage.getTransactions.useQuery(
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

  const { data: holdings, isLoading: isLoadingHoldings } = trpc.brokerage.getHoldings.useQuery(
    { 
      clientId: config.clientId,
      consumerKey: config.consumerKey,
      userId: config.userId, 
      userSecret: config.userSecret
    },
    { enabled: !!config.userId && !!config.userSecret }
  );

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
        const typeStr = (typeof tx.type === "string" ? tx.type : tx.type?.name || "transaction").toLowerCase();
        return typeStr === selectedType.toLowerCase();
      });
    }
    
    // Sort by date DESC
    return filtered.sort((a: any, b: any) => {
      const dateA = new Date(a.settlement_date || a.trade_date).getTime();
      const dateB = new Date(b.settlement_date || b.trade_date).getTime();
      return dateB - dateA;
    });
  }, [transactions, selectedAccountId, selectedType]);

  const transactionTypes = useMemo(() => {
    if (!transactions) return [];
    const types = new Set<string>();
    transactions.forEach((tx: any) => {
      const typeStr = (typeof tx.type === "string" ? tx.type : tx.type?.name || "transaction");
      if (typeStr) types.add(typeStr);
    });
    return Array.from(types).sort();
  }, [transactions]);

  const filteredHoldings = useMemo(() => {
    if (!holdings) return [];
    
    let filtered = [...holdings];
    
    // Filter by account if selected
    if (selectedHoldingsAccountId !== "all") {
      filtered = filtered.filter((h: any) => h.account?.id === selectedHoldingsAccountId);
    }
    
    // Sort by market value DESC
    return filtered.sort((a: any, b: any) => {
      const valA = (a.units || 0) * (a.price || 0);
      const valB = (b.units || 0) * (b.price || 0);
      return valB - valA;
    });
  }, [holdings, selectedHoldingsAccountId]);

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
    if (getLoginUrl.data?.redirectURI) {
      window.open(getLoginUrl.data.redirectURI, "_blank");
    } else {
      toast.error("Connect URL not available");
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-lg shadow-sm border border-border">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Brokerage Transactions</h2>
            <p className="text-xs text-slate-500 font-medium">Real-time sync via SnapTrade Secure Link</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
              <div className="text-2xl font-bold text-slate-800">{accounts?.length || 0}</div>
            </Card>
            
            <Card className="p-6 bg-white shadow-sm border border-border md:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-orange-500" />
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Timeframe</h3>
                </div>
                <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-6 text-[10px] uppercase font-bold">
                  <RefreshCw className={`w-3 h-3 mr-1 ${isLoadingTx ? "animate-spin" : ""}`} />
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
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Transaction Ledger</h3>
              
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter Account:</span>
                  <select 
                    className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary h-8 min-w-[160px]"
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                  >
                    <option value="all">All Accounts</option>
                    {accounts?.map((acc: any) => (
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
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-border">
                    <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Date</th>
                    <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Account</th>
                    <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Type</th>
                    <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Description</th>
                    <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Symbol</th>
                    <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Units</th>
                    <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Price</th>
                    <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoadingTx ? (
                    <tr>
                      <td colSpan={8} className="py-20 text-center">
                        <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-4 opacity-50" />
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Syncing with Broker...</p>
                      </td>
                    </tr>
                  ) : filteredTransactions && filteredTransactions.length > 0 ? (
                    filteredTransactions.map((tx: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-6 font-mono text-xs text-slate-500">{formatDate(tx.settlement_date || tx.trade_date)}</td>
                        <td className="py-4 px-6">
                          <div className="text-sm font-bold text-slate-700">{tx.account?.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{tx.account?.number}</div>
                        </td>
                        <td className="py-4 px-6">
                          <Badge variant="outline" className="capitalize text-[10px] font-bold">
                            {(typeof tx.type === "string" ? tx.type : tx.type?.name || "transaction").toLowerCase()}
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
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-20 text-center text-slate-400 italic">
                        No transactions found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Holdings Table */}
          <Card className="bg-white shadow-sm border border-border overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Account Holdings</h3>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter Account:</span>
                <select 
                  className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary h-8 min-w-[160px]"
                  value={selectedHoldingsAccountId}
                  onChange={(e) => setSelectedHoldingsAccountId(e.target.value)}
                >
                  <option value="all">All Accounts</option>
                  {accounts?.map((acc: any) => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.number})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-border">
                    <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Symbol</th>
                    <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Name</th>
                    <th className="text-left py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Account</th>
                    <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Shares</th>
                    <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Avg Cost</th>
                    <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Price</th>
                    <th className="text-right py-3 px-6 text-slate-600 font-bold uppercase text-[10px] tracking-wider">Market Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoadingHoldings ? (
                    <tr>
                      <td colSpan={7} className="py-20 text-center">
                        <RefreshCw className="w-8 h-8 animate-spin text-primary mx-auto mb-4 opacity-50" />
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Fetching Positions...</p>
                      </td>
                    </tr>
                  ) : filteredHoldings && filteredHoldings.length > 0 ? (
                    filteredHoldings.map((h: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 px-6 font-bold text-primary">{renderSymbol(h.symbol)}</td>
                        <td className="py-4 px-6 text-xs text-slate-600 max-w-[200px] truncate">{renderDescription(h.symbol)}</td>
                        <td className="py-4 px-6 text-xs font-medium text-slate-700">{h.account?.name}</td>
                        <td className="py-4 px-6 text-right font-mono text-xs font-medium">{h.units}</td>
                        <td className="py-4 px-6 text-right font-mono text-xs text-slate-500">{formatCurrency(h.average_purchase_price)}</td>
                        <td className="py-4 px-6 text-right font-mono text-xs text-slate-500">{formatCurrency(h.price)}</td>
                        <td className="py-4 px-6 text-right font-mono font-bold text-slate-800">
                          {formatCurrency((h.units || 0) * (h.price || 0))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-20 text-center text-slate-400 italic">
                        No positions found for these accounts.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
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
