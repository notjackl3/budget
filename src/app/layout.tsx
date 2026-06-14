import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { QueryProvider } from "@/components/query-provider";

// One typeface throughout — Plus Jakarta Sans (geometric, premium). Hierarchy
// comes from weight, case and tracking; money columns use tabular figures.
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Budget — personal spending tracker",
  description: "A clean, fast personal budget & spending tracker.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <QueryProvider>
            <ToastProvider>{children}</ToastProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
