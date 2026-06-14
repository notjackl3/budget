"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { saveReflection } from "@/app/actions";

export function ReflectionEditor({
  month,
  initial,
}: {
  month: string;
  initial: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [value, setValue] = React.useState(initial);
  const [pending, setPending] = React.useState(false);
  const dirty = value !== initial;

  async function save() {
    setPending(true);
    try {
      await saveReflection(month, value);
      toast({ title: "Reflection saved", variant: "success" });
      router.refresh();
    } catch {
      toast({ title: "Could not save reflection", variant: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="How did this month go? What surprised you? Anything to change next month?"
        rows={3}
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          {dirty ? "Save reflection" : "Saved"}
        </Button>
      </div>
    </div>
  );
}
