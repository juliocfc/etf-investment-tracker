import React, { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Edit, Calculator, Wallet, ReceiptText } from "lucide-react";
import { toast } from "sonner";

const FinanceIndependence: React.FC = () => {
  const utils = trpc.useUtils();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<{ id: number; description: string; amount: string } | null>(null);
  const [newExpense, setNewExpense] = useState({ description: "", amount: "" });

  // Data fetching
  console.log("FI Page: Fetching data...");
  const { data: holdings, isPending: isHoldingsPending, error: holdingsError } = trpc.portfolio.getAllHoldings.useQuery();
  const { data: expenses, isPending: isExpensesPending, error: expensesError } = trpc.fi.getExpenses.useQuery();

  if (holdingsError) console.error("FI Page: Holdings Error", holdingsError);
  if (expensesError) console.error("FI Page: Expenses Error", expensesError);

  console.log("FI Page Status:", { isHoldingsPending, isExpensesPending });
  if (holdings) console.log("FI Page: Received holdings", holdings.length);
  if (expenses) console.log("FI Page: Received expenses", expenses.length);

  // Mutations
  const addExpenseMutation = trpc.fi.addExpense.useMutation({
    onSuccess: () => {
      toast.success("Expense added");
      utils.fi.getExpenses.invalidate();
      setIsAddDialogOpen(false);
      setNewExpense({ description: "", amount: "" });
    },
  });

  const updateExpenseMutation = trpc.fi.updateExpense.useMutation({
    onSuccess: () => {
      toast.success("Expense updated");
      utils.fi.getExpenses.invalidate();
      setEditingExpense(null);
    },
  });

  const deleteExpenseMutation = trpc.fi.deleteExpense.useMutation({
    onSuccess: () => {
      toast.success("Expense deleted");
      utils.fi.getExpenses.invalidate();
    },
  });

  // Calculations
  const monthlyIncome = useMemo(() => {
    if (!holdings) return 0;
    const totalAnnual = holdings.reduce((sum, h) => {
      const qty = parseFloat(h.quantity.toString());
      const dps = h.annualDividendPerShare || 0;
      return sum + (qty * dps);
    }, 0);
    return totalAnnual / 12;
  }, [holdings]);

  const distributedExpenses = useMemo(() => {
    const expensesList = expenses || [];
    if (expensesList.length === 0) return [];

    // Sort by amount ascending
    const sorted = [...expensesList].sort((a, b) => parseFloat(a.amount) - parseFloat(b.amount));
    
    let remainingIncome = monthlyIncome;

    return sorted.map(exp => {
      const amount = parseFloat(exp.amount);
      const covered = Math.min(amount, remainingIncome);
      remainingIncome = Math.max(0, remainingIncome - covered);
      
      const coveredPercent = amount > 0 ? (covered / amount) * 100 : 0;
      const remainingAmount = amount - covered;
      const remainingPercent = amount > 0 ? (remainingAmount / amount) * 100 : 0;

      return {
        ...exp,
        amount,
        covered,
        coveredPercent,
        remainingAmount,
        remainingPercent
      };
    });
  }, [expenses, monthlyIncome]);

  const totals = useMemo(() => {
    return distributedExpenses.reduce((acc, curr) => ({
      amount: acc.amount + curr.amount,
      covered: acc.covered + curr.covered,
      remaining: acc.remaining + curr.remainingAmount,
    }), { amount: 0, covered: 0, remaining: 0 });
  }, [distributedExpenses]);

  const handleAddExpense = () => {
    if (!newExpense.description || !newExpense.amount) return;
    addExpenseMutation.mutate(newExpense);
  };

  const handleUpdateExpense = () => {
    if (!editingExpense) return;
    updateExpenseMutation.mutate({
      id: editingExpense.id,
      description: editingExpense.description,
      amount: editingExpense.amount,
    });
  };

  if (holdingsError || expensesError) {
    return (
      <div className="flex items-center justify-center h-64 flex-col gap-4 text-center">
        <div className="p-4 bg-red-50 rounded-full text-red-600">
          <Trash2 className="w-8 h-8" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800">Failed to load financial data</h3>
          <p className="text-sm text-slate-500 max-w-sm">
            {(holdingsError?.message || expensesError?.message || "An unexpected error occurred.")}
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-4"
            onClick={() => {
              if (holdingsError) utils.portfolio.getAllHoldings.refetch();
              if (expensesError) utils.fi.getExpenses.refetch();
            }}
          >
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }

  if (isHoldingsPending || isExpensesPending) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] flex-col gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#004a99]"></div>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-700 uppercase tracking-widest animate-pulse">Establishing Secure Connection...</p>
          <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-tight">Fetching Portfolio Dividends & Expenses</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-lg shadow-sm border border-border">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">Financial Independence</h2>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-widest">Track your path to dividend-funded living</p>
          </div>
        </div>
      </div>

      {/* Income Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white border-none shadow-md shadow-slate-200/50 overflow-hidden group">
          <div className="absolute top-0 left-0 w-1 h-full bg-green-500" />
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Est. Monthly Dividend Income</CardTitle>
              <Wallet className="w-4 h-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-800 tracking-tighter">
              {formatCurrency(monthlyIncome)}
            </div>
            <p className="text-[10px] text-slate-500 font-medium mt-1 uppercase tracking-tight">Average based on annual projections</p>
          </CardContent>
        </Card>
      </div>

      {/* Expenses Table */}
      <Card className="bg-white border-none shadow-md shadow-slate-200/50">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50 pb-4">
          <div className="flex items-center gap-2">
            <ReceiptText className="w-5 h-5 text-blue-600" />
            <CardTitle className="text-sm font-bold uppercase tracking-wider">Monthly Expenses & Coverage</CardTitle>
          </div>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-[#004a99] hover:bg-[#003d7a] h-8 font-bold uppercase text-[10px] tracking-widest">
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                Add Expense
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Monthly Expense</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                  <Input 
                    placeholder="e.g., Rent, Grocery, Utilities" 
                    value={newExpense.description}
                    onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Amount ($)</label>
                  <Input 
                    type="number" 
                    placeholder="0.00" 
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddExpense} className="bg-[#004a99]">Add Expense</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 hover:bg-slate-50/50">
                  <TableHead className="font-bold text-[10px] uppercase tracking-widest h-10">Description</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Monthly Amount</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Annual Amount</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Covered</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Covered %</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Remaining</TableHead>
                  <TableHead className="text-right font-bold text-[10px] uppercase tracking-widest h-10">Remaining %</TableHead>
                  <TableHead className="text-center font-bold text-[10px] uppercase tracking-widest h-10">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {distributedExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-slate-400 italic text-sm">
                      No expenses defined yet. Add your first monthly expense to see coverage.
                    </TableCell>
                  </TableRow>
                ) : (
                  distributedExpenses.map((exp) => (
                    <TableRow key={exp.id} className="hover:bg-slate-50/50">
                      <TableCell className="font-bold text-slate-700">{exp.description}</TableCell>
                      <TableCell className="text-right font-mono font-bold text-slate-900">{formatCurrency(exp.amount)}</TableCell>
                      <TableCell className="text-right font-mono text-slate-500">{formatCurrency(exp.amount * 12)}</TableCell>
                      <TableCell className="text-right font-mono text-green-600 font-bold">{formatCurrency(exp.covered)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end">
                          <span className={`text-[11px] font-black ${exp.coveredPercent >= 100 ? "text-green-600" : "text-orange-600"}`}>
                            {exp.coveredPercent.toFixed(1)}%
                          </span>
                          <div className="w-16 h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div 
                              className={`h-full transition-all ${exp.coveredPercent >= 100 ? "bg-green-500" : "bg-orange-500"}`}
                              style={{ width: `${Math.min(100, exp.coveredPercent)}%` }}
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-500">{formatCurrency(exp.remainingAmount)}</TableCell>
                      <TableCell className="text-right text-[11px] font-bold text-slate-400">
                        {exp.remainingPercent.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-blue-600"
                            onClick={() => setEditingExpense({ id: exp.id, description: exp.description, amount: exp.amount.toString() })}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-slate-400 hover:text-red-600"
                            onClick={() => {
                              if (confirm("Delete this expense?")) deleteExpenseMutation.mutate({ id: exp.id });
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {distributedExpenses.length > 0 && (
                <TableFooter className="bg-slate-50/50 border-t-2 border-slate-100">
                  <TableRow className="hover:bg-transparent">
                    <TableCell className="font-bold text-slate-600 uppercase text-[10px] tracking-widest">Total</TableCell>
                    <TableCell className="text-right font-mono font-black text-slate-900">{formatCurrency(totals.amount)}</TableCell>
                    <TableCell className="text-right font-mono text-slate-500">{formatCurrency(totals.amount * 12)}</TableCell>
                    <TableCell className="text-right font-mono font-black text-green-700">{formatCurrency(totals.covered)}</TableCell>
                    <TableCell className="text-right font-black text-green-700">
                      {(totals.amount > 0 ? (totals.covered / totals.amount) * 100 : 0).toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right font-mono font-black text-red-700">{formatCurrency(totals.remaining)}</TableCell>
                    <TableCell className="text-right font-black text-red-700">
                      {(totals.amount > 0 ? (totals.remaining / totals.amount) * 100 : 0).toFixed(1)}%
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Summary FI Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-white border-none shadow-md shadow-slate-200/50">
          <CardHeader>
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-400">Financial Independence Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <div className="text-4xl font-black text-slate-800 tracking-tighter">
                    {(totals.amount > 0 ? (monthlyIncome / totals.amount) * 100 : 0).toFixed(1)}%
                  </div>
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">FI Score (Income / Total Expenses)</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-slate-700">
                    {formatCurrency(Math.max(0, totals.amount - monthlyIncome))}
                  </div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gap to Full FI</div>
                </div>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-1000"
                  style={{ width: `${Math.min(100, (totals.amount > 0 ? (monthlyIncome / totals.amount) * 100 : 0))}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingExpense} onOpenChange={(open) => !open && setEditingExpense(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
          </DialogHeader>
          {editingExpense && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Description</label>
                <Input 
                  value={editingExpense.description}
                  onChange={(e) => setEditingExpense({ ...editingExpense, description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase">Amount ($)</label>
                <Input 
                  type="number" 
                  value={editingExpense.amount}
                  onChange={(e) => setEditingExpense({ ...editingExpense, amount: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleUpdateExpense} className="bg-[#004a99]">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinanceIndependence;
