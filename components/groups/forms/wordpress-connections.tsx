"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clipboard, Download, PlugZap, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createWordPressConnection,
  revokeWordPressConnection,
} from "@/lib/data/wordpress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type Connection = {
  id: string;
  siteOrigin: string;
  siteName: string | null;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export function WordPressConnections({ initialConnections }: { initialConnections: Connection[] }) {
  const router = useRouter();
  const [connections, setConnections] = useState(initialConnections);
  const [siteUrl, setSiteUrl] = useState("");
  const [siteName, setSiteName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function connect() {
    setWorking(true);
    const result = await createWordPressConnection({
      siteUrl,
      siteName: siteName.trim() || undefined,
    });
    setWorking(false);
    if (!result?.data) return toast.error(result?.serverError || "Could not create the connection.");
    setNewToken(result.data.token);
    setConnections((current) => [
      {
        id: result.data!.id,
        siteOrigin: result.data!.siteOrigin,
        siteName: siteName.trim() || null,
        tokenPrefix: result.data!.tokenPrefix,
        lastUsedAt: null,
        revokedAt: null,
        createdAt: new Date(),
      },
      ...current,
    ]);
    setSiteUrl("");
    setSiteName("");
    router.refresh();
  }

  async function copyNewToken() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      toast.success("Token copied.");
    } catch {
      toast.error("Could not copy the token. Select it and copy it manually.");
    }
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <section className="rounded-xl border bg-background p-5">
        <div className="flex items-start gap-3">
          <PlugZap className="mt-0.5 h-5 w-5" />
          <div><h2 className="font-medium">Generate a read-only site token</h2><p className="text-sm text-muted-foreground">The token can only list your published forms. Paste it into the Router Forms plugin settings; it never enters post content or frontend HTML.</p></div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2"><Label htmlFor="site-name">Site name</Label><Input id="site-name" value={siteName} onChange={(event) => setSiteName(event.target.value)} placeholder="Marketing site" /></div>
          <div className="grid gap-2"><Label htmlFor="site-url">Site URL</Label><Input id="site-url" type="url" value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="https://example.com" /></div>
        </div>
        <Button className="mt-4" disabled={!siteUrl.trim() || working} onClick={connect}>{working ? "Generating…" : "Generate site token"}</Button>
      </section>

      {newToken && (
        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-5">
          <h2 className="font-medium">Copy this token now</h2>
          <p className="mt-1 text-sm text-muted-foreground">Router stores only its hash, so the full token cannot be shown again.</p>
          <div className="mt-4 flex gap-2"><Input readOnly value={newToken} className="font-mono text-xs" /><Button variant="outline" size="icon" aria-label="Copy WordPress site token" onClick={copyNewToken}><Clipboard className="h-4 w-4" /></Button></div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setNewToken(null)}>I’ve stored it safely</Button>
        </section>
      )}

      <section className="rounded-xl border bg-background p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">Plugin</h2><p className="text-sm text-muted-foreground">WordPress 6.6+, PHP 7.4+, block and classic themes.</p></div><Button variant="outline" asChild><a href="/downloads/router-forms.zip"><Download className="mr-2 h-4 w-4" /> Download ZIP</a></Button></div>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-muted-foreground"><li>Install and activate the ZIP in WordPress.</li><li>Open Settings → Router Forms and paste the site token.</li><li>Add the Router Form block or use <code>[router_form id=&quot;PUBLIC_ID&quot;]</code>.</li></ol>
      </section>

      <section className="rounded-xl border bg-background p-5">
        <h2 className="font-medium">Connections</h2>
        <div className="mt-4 grid gap-3">
          {connections.map((connection) => (
            <div key={connection.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="flex items-center gap-2"><span className="font-medium">{connection.siteName || connection.siteOrigin}</span><Badge variant={connection.revokedAt ? "secondary" : "outline"}>{connection.revokedAt ? "Revoked" : "Active"}</Badge></div><p className="text-xs text-muted-foreground">{connection.siteOrigin} · token …{connection.tokenPrefix} · {connection.lastUsedAt ? `last used ${connection.lastUsedAt.toLocaleString()}` : "not used yet"}</p></div>
              {!connection.revokedAt && <Button variant="outline" size="sm" onClick={async () => { if (!window.confirm("Revoke this site token? Forms on this WordPress origin will stop loading.")) return; const result = await revokeWordPressConnection({ id: connection.id }); if (result?.serverError) return toast.error(result.serverError); setConnections((current) => current.map((item) => item.id === connection.id ? { ...item, revokedAt: new Date() } : item)); router.refresh(); }}><Trash2 className="mr-2 h-3.5 w-3.5" /> Revoke</Button>}
            </div>
          ))}
          {connections.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No WordPress sites connected yet.</p>}
        </div>
      </section>
    </div>
  );
}
