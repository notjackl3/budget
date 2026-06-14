"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Table2,
  CheckCircle2,
  Upload,
  Settings as SettingsIcon,
  Wallet,
  Briefcase,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";
import { QuickAdd } from "@/components/quick-add";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/app/actions";
import type { CategoryDTO, PaymentMethodDTO } from "@/lib/types";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Table2 },
  { href: "/income", label: "Income", icon: Briefcase },
  { href: "/investments", label: "Investments", icon: TrendingUp },
  { href: "/review", label: "Weekly Review", icon: CheckCircle2 },
  { href: "/import", label: "Import", icon: Upload },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export function AppShell({
  categories,
  paymentMethods,
  children,
}: {
  categories: CategoryDTO[];
  paymentMethods: PaymentMethodDTO[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-[var(--glass-rim)] bg-[var(--glass-fill)] px-3 py-5 backdrop-blur-xl backdrop-saturate-150 md:flex">
        <div className="mb-7 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-glass-violet">
            <Wallet className="h-4 w-4" />
          </div>
          <span className="font-semibold tracking-tight">Budget</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ease-glass",
                  active
                    ? "glass glass-active text-foreground"
                    : "text-muted-foreground hover:-translate-y-px hover:text-foreground",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
                )}
                <Icon
                  className={cn(
                    "h-4 w-4 transition-colors",
                    active ? "text-primary" : "group-hover:text-foreground",
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <form action={logoutAction} className="px-1">
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground">
            Sign out
          </Button>
        </form>
      </aside>

      {/* Main */}
      <div className="flex min-h-screen flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--glass-rim)] bg-[hsl(var(--background)/0.7)] px-4 backdrop-blur-xl backdrop-saturate-150 md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-glass-violet">
              <Wallet className="h-4 w-4" />
            </div>
            <span className="font-semibold">Budget</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <QuickAdd categories={categories} paymentMethods={paymentMethods} />
            <ThemeToggle />
          </div>
        </header>

        {/* Mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-b border-[var(--glass-rim)] bg-[var(--glass-fill)] px-3 py-2 backdrop-blur-xl backdrop-saturate-150 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200 ease-glass",
                isActive(item.href)
                  ? "glass glass-active text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
