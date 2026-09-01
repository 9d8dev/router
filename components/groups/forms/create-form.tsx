"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { FileText, MessageSquare, Megaphone, Mail, Plus } from "lucide-react";
import { createForm } from "@/lib/data/forms";
import type { Endpoint } from "@/lib/db";
import type { StarterId } from "@/lib/forms/starters";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const starters: Array<{
  id: StarterId;
  name: string;
  description: string;
  icon: typeof FileText;
}> = [
  { id: "blank", name: "Blank", description: "Start with an empty canvas", icon: Plus },
  { id: "contact", name: "Contact", description: "Name, email, and message", icon: MessageSquare },
  { id: "lead-capture", name: "Lead capture", description: "Qualify a new opportunity", icon: Megaphone },
  { id: "feedback", name: "Feedback", description: "Rating and open feedback", icon: FileText },
  { id: "newsletter", name: "Newsletter", description: "Email and consent", icon: Mail },
];

export function CreateForm({
  endpoints,
  initialEndpointId,
}: {
  endpoints: Endpoint[];
  initialEndpointId?: string;
}) {
  const [name, setName] = useState("");
  const [starterId, setStarterId] = useState<StarterId>("contact");
  const [endpointId, setEndpointId] = useState(initialEndpointId ?? "new");
  const { execute, isExecuting } = useAction(createForm, {
    onError: ({ error }) => toast.error(error.serverError || "Could not create the form."),
  });

  return (
    <div className="mx-auto grid max-w-4xl gap-8 py-4">
      <div className="grid gap-2">
        <Label htmlFor="form-name">Internal name</Label>
        <Input
          id="form-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Demo request"
          className="max-w-lg bg-background"
        />
      </div>

      <div className="grid gap-3">
        <div>
          <Label>Endpoint</Label>
          <p className="text-sm text-muted-foreground">
            A new form creates its endpoint automatically. Attaching preserves an existing headless URL.
          </p>
        </div>
        <Select value={endpointId} onValueChange={setEndpointId}>
          <SelectTrigger className="max-w-lg bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Create a new endpoint</SelectItem>
            {endpoints.map((endpoint) => (
              <SelectItem key={endpoint.id} value={endpoint.id}>
                Attach “{endpoint.name}”
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {endpointId === "new" && (
        <div className="grid gap-3">
          <Label>Starter</Label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {starters.map((starter) => {
              const Icon = starter.icon;
              return (
                <button
                  key={starter.id}
                  type="button"
                  onClick={() => setStarterId(starter.id)}
                  className={cn(
                    "rounded-xl border bg-background p-4 text-left transition-colors hover:border-foreground/40",
                    starterId === starter.id && "border-foreground ring-2 ring-foreground/10"
                  )}
                >
                  <Icon className="mb-5 h-5 w-5" />
                  <span className="block text-sm font-medium">{starter.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{starter.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {endpointId !== "new" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          The first draft will be seeded from this endpoint’s current schema. Publishing will replace that
          schema with the form’s compiled fields; Router will ask you to confirm first.
        </div>
      )}

      <div>
        <Button
          disabled={!name.trim() || isExecuting}
          onClick={() =>
            execute({
              name: name.trim(),
              starterId,
              ...(endpointId !== "new" ? { endpointId } : {}),
            })
          }
        >
          {isExecuting ? "Creating…" : "Create form"}
        </Button>
      </div>
    </div>
  );
}
