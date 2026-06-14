"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Archive } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import {
  updateSettings,
  createCategory,
  updateCategory,
  archiveCategory,
} from "@/app/actions";
import { centsToDecimalString, dollarsToCents } from "@/lib/money";
import type { CategoryDTO } from "@/lib/types";

export function SettingsView({
  currencyCode,
  currencySymbol,
  mealNeedCents,
  categories,
}: {
  currencyCode: string;
  currencySymbol: string;
  mealNeedCents: number;
  categories: CategoryDTO[];
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [code, setCode] = React.useState(currencyCode);
  const [symbol, setSymbol] = React.useState(currencySymbol);
  const [mealNeed, setMealNeed] = React.useState(
    centsToDecimalString(mealNeedCents),
  );
  const [newCat, setNewCat] = React.useState("");
  const [newCatColor, setNewCatColor] = React.useState("#6366f1");

  async function saveCurrency() {
    await updateSettings({ currencyCode: code, currencySymbol: symbol });
    toast({ title: "Currency updated", variant: "success" });
    router.refresh();
  }

  async function saveMealNeed() {
    await updateSettings({
      currencyCode: code,
      currencySymbol: symbol,
      mealNeedCents: dollarsToCents(mealNeed),
    });
    toast({ title: "Meal threshold updated", variant: "success" });
    router.refresh();
  }

  async function addCategory() {
    if (!newCat.trim()) return;
    await createCategory(newCat.trim(), newCatColor);
    setNewCat("");
    router.refresh();
    toast({ title: "Category added", variant: "success" });
  }

  return (
    <div className="space-y-6">
      {/* Currency */}
      <Card>
        <CardHeader>
          <CardTitle>Currency</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="code">Code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-24"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="symbol">Symbol</Label>
            <Input
              id="symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              className="w-24"
            />
          </div>
          <Button onClick={saveCurrency}>Save</Button>
          <p className="text-sm text-muted-foreground">
            Preview: <span className="tabular">{symbol}1,234.56</span>
          </p>
        </CardContent>
      </Card>

      {/* Food budgeting */}
      <Card>
        <CardHeader>
          <CardTitle>Food budgeting</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="mealneed">Meal need threshold</Label>
            <Input
              id="mealneed"
              inputMode="decimal"
              value={mealNeed}
              onChange={(e) => setMealNeed(e.target.value)}
              className="w-28 text-right tabular"
              onKeyDown={(e) => e.key === "Enter" && saveMealNeed()}
            />
          </div>
          <Button onClick={saveMealNeed}>Save</Button>
          <p className="max-w-md text-sm text-muted-foreground">
            For each eating-out expense, the first {symbol}
            {mealNeed || "0"} counts as a <strong>Need</strong> (the cost of the
            meal) and anything above it as <strong>Comfort</strong> (extra you
            chose to spend). This drives your monthly food baseline.
          </p>
        </CardContent>
      </Card>

      {/* Categories */}
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <CategoryChip key={c.id} category={c} onChange={() => router.refresh()} />
            ))}
          </div>
          <div className="flex items-end gap-2 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="newcat">New category</Label>
              <Input
                id="newcat"
                value={newCat}
                onChange={(e) => setNewCat(e.target.value)}
                placeholder="e.g. Gifts"
                className="w-48"
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
              />
            </div>
            <input
              type="color"
              value={newCatColor}
              onChange={(e) => setNewCatColor(e.target.value)}
              className="h-10 w-12 cursor-pointer rounded-lg border bg-card"
              aria-label="Category color"
            />
            <Button variant="outline" onClick={addCategory}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}

function CategoryChip({
  category,
  onChange,
}: {
  category: CategoryDTO;
  onChange: () => void;
}) {
  const [name, setName] = React.useState(category.name);
  const [editing, setEditing] = React.useState(false);

  async function commit() {
    setEditing(false);
    if (name.trim() && name !== category.name) {
      await updateCategory(category.id, { name: name.trim() });
      onChange();
    } else {
      setName(category.name);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card py-1 pl-2 pr-1 text-sm">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: category.color ?? "#94a3b8" }}
      />
      {editing ? (
        <input
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && commit()}
          className="w-24 bg-transparent outline-none"
        />
      ) : (
        <button onClick={() => setEditing(true)} className="hover:underline">
          {category.name}
        </button>
      )}
      <button
        className="rounded-full p-0.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
        onClick={async () => {
          await archiveCategory(category.id);
          onChange();
        }}
        aria-label={`Archive ${category.name}`}
      >
        <Archive className="h-3 w-3" />
      </button>
    </span>
  );
}
