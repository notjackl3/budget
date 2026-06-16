import { loginAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wallet } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error, from } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Wallet className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your password to open your budget.
          </p>
        </div>

        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="from" value={from ?? "/"} />
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">
              {error === "rate"
                ? "Too many attempts. Please wait a few minutes and try again."
                : "Incorrect password. Please try again."}
            </p>
          )}
          <Button type="submit" className="w-full">
            Sign in
          </Button>
        </form>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Single-user, private. Set <code>APP_PASSWORD</code> in your env.
        </p>
      </div>
    </div>
  );
}
