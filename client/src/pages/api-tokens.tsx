import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Copy, Key, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import type { PublicApiToken } from "@shared/schema";

interface CreatedToken extends PublicApiToken {
  token: string;
}

function formatDate(value: string | Date | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function tokenStatus(t: PublicApiToken): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (t.revokedAt) return { label: "Revoked", variant: "destructive" };
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) {
    return { label: "Expired", variant: "secondary" };
  }
  return { label: "Active", variant: "default" };
}

export function ApiTokensSection() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("");
  const [created, setCreated] = useState<CreatedToken | null>(null);

  const { data: tokens, isLoading, error } = useQuery<PublicApiToken[]>({
    queryKey: ["/api/auth/tokens"],
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { name: name.trim() };
      const days = parseInt(expiresInDays);
      if (!isNaN(days) && days > 0) body.expiresInDays = days;
      const res = await apiRequest("POST", "/api/auth/tokens", body);
      return (await res.json()) as CreatedToken;
    },
    onSuccess: (data) => {
      setCreated(data);
      setName("");
      setExpiresInDays("");
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/tokens"] });
    },
    onError: (e: any) => {
      toast({ title: "Could not create token", description: e?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/auth/tokens/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Token revoked", description: "It can no longer be used to authenticate." });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/tokens"] });
    },
    onError: (e: any) => {
      toast({ title: "Could not revoke token", description: e?.message ?? "Unknown error", variant: "destructive" });
    },
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Token copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Please copy manually.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2" data-testid="text-section-title-tokens">
            <Key className="h-5 w-5" /> API Tokens
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Personal access tokens for programmatic access to the FundFlow API. Tokens inherit your account's permissions.
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-token">
              <Plus className="h-4 w-4 mr-2" /> New token
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API token</DialogTitle>
              <DialogDescription>
                Give your token a recognizable name. The full token will be shown to you exactly once after creation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="token-name">Name</Label>
                <Input
                  id="token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CI pipeline, Laptop"
                  data-testid="input-token-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="token-expires">Expires in (days)</Label>
                <Input
                  id="token-expires"
                  type="number"
                  min="1"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  placeholder="Leave blank for no expiration"
                  data-testid="input-token-expires"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel-create">
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name.trim() || createMutation.isPending}
                data-testid="button-confirm-create"
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create token
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {created && (
        <Alert className="border-amber-500/50 bg-amber-500/5" data-testid="alert-token-created">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Save your token now</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              This is the only time the full token will be displayed. Store it somewhere safe — you won't be able to retrieve it again.
            </p>
            <div className="flex items-center gap-2 bg-background border rounded-md p-2 font-mono text-xs break-all">
              <span className="flex-1" data-testid="text-new-token">{created.token}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyToClipboard(created.token)}
                aria-label="Copy token to clipboard"
                data-testid="button-copy-token"
              >
                <Copy className="h-4 w-4" />
                <span className="sr-only">Copy token</span>
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCreated(null)} data-testid="button-dismiss-token">
              I've saved it
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Your tokens</CardTitle>
          <CardDescription>
            Tokens authenticate via the <code className="text-xs bg-muted px-1 py-0.5 rounded">Authorization: Bearer ff_…</code> header.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <Alert variant="destructive" data-testid="alert-tokens-error">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Couldn't load tokens</AlertTitle>
              <AlertDescription>
                {/403/.test(String((error as any)?.message))
                  ? "You need administrator access to manage API tokens."
                  : (error as any)?.message ?? "Unknown error. Try refreshing the page."}
              </AlertDescription>
            </Alert>
          ) : !tokens || tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-empty">
              You haven't created any tokens yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Prefix</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t) => {
                  const status = tokenStatus(t);
                  const isRevoked = !!t.revokedAt;
                  return (
                    <TableRow key={t.id} data-testid={`row-token-${t.id}`}>
                      <TableCell className="font-medium" data-testid={`text-token-name-${t.id}`}>{t.name}</TableCell>
                      <TableCell className="font-mono text-xs">ff_{t.prefix}…</TableCell>
                      <TableCell>
                        <Badge variant={status.variant} data-testid={`status-token-${t.id}`}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(t.lastUsedAt)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(t.expiresAt)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(t.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        {!isRevoked && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={revokeMutation.isPending}
                                aria-label={`Revoke token ${t.name}`}
                                data-testid={`button-revoke-${t.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">Revoke {t.name}</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Revoke this token?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Any system using <strong>{t.name}</strong> will immediately stop being able to authenticate. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid={`button-revoke-cancel-${t.id}`}>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => revokeMutation.mutate(t.id)}
                                  data-testid={`button-revoke-confirm-${t.id}`}
                                >
                                  Revoke
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
