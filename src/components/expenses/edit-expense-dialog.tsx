"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { updateExpense } from "@/app/actions";
import { expensesQueryKey } from "@/lib/expenses-query";
import { NEED_WANT, INCOME_TYPES } from "@/lib/categories";
import { centsToDecimalString, dollarsToCents } from "@/lib/money";
import type { ExpenseDTO, CategoryDTO } from "@/lib/types";

export function EditExpenseDialog({
  expense,
  categories,
  open,
  onOpenChange,
}: {
  expense: ExpenseDTO;
  categories: CategoryDTO[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);

  const [description, setDescription] = React.useState(expense.description);
  const [amount, setAmount] = React.useState(
    centsToDecimalString(expense.amountCents),
  );
  const [effectiveAmount, setEffectiveAmount] = React.useState(
    expense.effectiveCents != null
      ? centsToDecimalString(expense.effectiveCents)
      : "",
  );
  const [date, setDate] = React.useState(expense.date);
  const [categoryId, setCategoryId] = React.useState(
    expense.categoryId ?? "none",
  );
  const [needWant, setNeedWant] = React.useState(expense.needWant ?? "none");
  const [incomeType, setIncomeType] = React.useState(
    expense.incomeType ?? "none",
  );
  const [recurring, setRecurring] = React.useState(expense.recurring);
  const [notes, setNotes] = React.useState(expense.notes ?? "");

  // A negative amount is incoming money (income), which carries an income type
  // instead of a need/want flag. Derived live so flipping the sign switches it.
  const isIncome = dollarsToCents(amount) < 0;

  async function save() {
    setPending(true);
    try {
      await updateExpense(expense.id, {
        description,
        amount,
        effectiveAmount,
        date,
        categoryId,
        ...(isIncome ? { incomeType, needWant: null } : { needWant }),
        recurring,
        notes,
      });
      toast({ title: "Saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: expensesQueryKey });
      router.refresh();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Could not save",
        description: e instanceof Error ? e.message : undefined,
        variant: "error",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                className="w-28 text-right tabular"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="edit-effective">Cost to me (optional)</Label>
              {effectiveAmount !== "" && (
                <button
                  type="button"
                  onClick={() => setEffectiveAmount("")}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Reset to charged
                </button>
              )}
            </div>
            <Input
              id="edit-effective"
              className="text-right tabular"
              inputMode="decimal"
              value={effectiveAmount}
              onChange={(e) => setEffectiveAmount(e.target.value)}
              placeholder={`Charged ${amount} — leave blank if unchanged`}
            />
            <p className="text-xs text-muted-foreground">
              Override what it actually cost you (e.g. after someone pays you
              back). Analytics use this; the charged amount stays on record.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
              <Label>{isIncome ? "Income type" : "Need / Want"}</Label>
              {isIncome ? (
                <Select value={incomeType} onValueChange={setIncomeType}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {INCOME_TYPES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select value={needWant} onValueChange={setNeedWant}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {NEED_WANT.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={recurring}
              onCheckedChange={setRecurring}
              id="edit-recurring"
            />
            <Label htmlFor="edit-recurring" className="cursor-pointer">
              Recurring monthly
            </Label>
          </div>
          {expense.sourceStatementLabel && (
            <p className="text-xs text-muted-foreground">
              Imported from {expense.sourceStatementLabel}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
