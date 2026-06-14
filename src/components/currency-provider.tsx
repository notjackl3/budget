"use client";

import * as React from "react";
import { formatMoney } from "@/lib/money";

const CurrencyContext = React.createContext<string>("C$");

export function CurrencyProvider({
  symbol,
  children,
}: {
  symbol: string;
  children: React.ReactNode;
}) {
  return (
    <CurrencyContext.Provider value={symbol}>
      {children}
    </CurrencyContext.Provider>
  );
}

/** Hook returning a currency-aware money formatter. */
export function useMoney() {
  const symbol = React.useContext(CurrencyContext);
  return React.useCallback((cents: number) => formatMoney(cents, symbol), [symbol]);
}

export function useCurrencySymbol() {
  return React.useContext(CurrencyContext);
}
