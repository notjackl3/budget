"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { createExpense } from "@/app/actions";
import { expensesQueryKey } from "@/lib/expenses-query";
import { NEED_WANT } from "@/lib/categories";
import type { CategoryDTO, PaymentMethodDTO } from "@/lib/types";

function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function QuickAdd({
  categories,
  paymentMethods,
  trigger,
}: {
  categories: CategoryDTO[];
  paymentMethods: PaymentMethodDTO[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const descRef = React.useRef<HTMLInputElement>(null);

  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [date, setDate] = React.useState(todayYMD());
  const [categoryId, setCategoryId] = React.useState<string>("none");
  const [paymentMethodId, setPaymentMethodId] = React.useState<string>("none");
  const [needWant, setNeedWant] = React.useState<string>("none");
  const [recurring, setRecurring] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);

  function resetForNext() {
    setDescription("");
    setAmount("");
    setNotes("");
    setRecurring(false);
    // keep date, category, payment method, need/want for fast repeat entry
    requestAnimationFrame(() => descRef.current?.focus());
  }

  async function submit(closeAfter: boolean) {
    if (!description.trim() || !amount) {
      toast({ title: "Add a description and amount", variant: "error" });
      return;
    }
    setPending(true);
    try {
      await createExpense({
        description,
        amount,
        date,
        categoryId,
        paymentMethodId,
        needWant,
        recurring,
        notes,
      });
      toast({ title: "Expense added", variant: "success" });
      queryClient.invalidateQueries({ queryKey: expensesQueryKey });
      router.refresh();
      if (closeAfter) setOpen(false);
      else resetForNext();
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

  function onKeyDown(e: React.KeyboardEvent) {
    // Enter (without Shift) submits and keeps the form open for the next entry.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="h-4 w-4" /> Add expense
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick add</DialogTitle>
          <DialogDescription>
            Press Enter to save and keep adding. Date stays put.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3" onKeyDown={onKeyDown}>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qa-desc">Description</Label>
              <Input
                id="qa-desc"
                ref={descRef}
                autoFocus
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Groceries at T&T"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-amount">Amount</Label>
              <Input
                id="qa-amount"
                inputMode="decimal"
                className="w-28 text-right tabular"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Uncategorized" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-date">Date</Label>
              <Input
                id="qa-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Payment</Label>
              <Select
                value={paymentMethodId}
                onValueChange={setPaymentMethodId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {paymentMethods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Need / Want</Label>
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
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qa-notes">Notes (optional)</Label>
            <Input
              id="qa-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything to remember"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Switch
              id="qa-recurring"
              checked={recurring}
              onCheckedChange={setRecurring}
            />
            <Label htmlFor="qa-recurring" className="cursor-pointer">
              Recurring monthly
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => submit(true)}
            >
              Add &amp; close
            </Button>
            <Button disabled={pending} onClick={() => submit(false)}>
              <Plus className="h-4 w-4" /> Add &amp; next
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
