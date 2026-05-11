import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
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

function tokenStatus(
  tk: PublicApiToken,
  t: (k: string) => string,
): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (tk.revokedAt) return { label: t("apiTokens.statusRevoked"), variant: "destructive" };
  if (tk.expiresAt && new Date(tk.expiresAt).getTime() < Date.now()) {
    return { label: t("apiTokens.statusExpired"), variant: "secondary" };
  }
  return { label: t("apiTokens.statusActive"), variant: "default" };
}

export function ApiTokensSection() {
  const { toast } = useToast();
  const { t } = useTranslation();
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
      toast({ title: t("apiTokens.createFailed"), description: e?.message ?? t("apiTokens.unknownError"), variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/auth/tokens/${id}`);
    },
    onSuccess: () => {
      toast({ title: t("apiTokens.revoked"), description: t("apiTokens.revokedDescription") });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/tokens"] });
    },
    onError: (e: any) => {
      toast({ title: t("apiTokens.revokeFailed"), description: e?.message ?? t("apiTokens.unknownError"), variant: "destructive" });
    },
  });

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t("common.copied"), description: t("apiTokens.copiedDescription") });
    } catch {
      toast({ title: t("apiTokens.copyFailedTitle"), description: t("apiTokens.copyFailedDescription"), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2" data-testid="text-section-title-tokens">
            <Key className="h-5 w-5" /> {t("apiTokens.title")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("apiTokens.sectionDescription")}
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-token">
              <Plus className="h-4 w-4 mr-2" /> {t("apiTokens.newToken")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("apiTokens.createDialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("apiTokens.createDialogDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="token-name">{t("common.name")}</Label>
                <Input
                  id="token-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("apiTokens.namePlaceholder")}
                  data-testid="input-token-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="token-expires">{t("apiTokens.expiresIn")}</Label>
                <Input
                  id="token-expires"
                  type="number"
                  min="1"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  placeholder={t("apiTokens.expiresPlaceholder")}
                  data-testid="input-token-expires"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel-create">
                {t("common.cancel")}
              </Button>
              <Button
                onClick={() => createMutation.mutate()}
                disabled={!name.trim() || createMutation.isPending}
                data-testid="button-confirm-create"
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("apiTokens.createToken")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {created && (
        <Alert className="border-amber-500/50 bg-amber-500/5" data-testid="alert-token-created">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>{t("apiTokens.saveTokenAlertTitle")}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              {t("apiTokens.saveTokenAlertDescription")}
            </p>
            <div className="flex items-center gap-2 bg-background border rounded-md p-2 font-mono text-xs break-all">
              <span className="flex-1" data-testid="text-new-token">{created.token}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyToClipboard(created.token)}
                aria-label={t("apiTokens.copyAriaLabel")}
                data-testid="button-copy-token"
              >
                <Copy className="h-4 w-4" />
                <span className="sr-only">{t("apiTokens.copyToken")}</span>
              </Button>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCreated(null)} data-testid="button-dismiss-token">
              {t("apiTokens.acknowledgeSaved")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("apiTokens.yourTokens")}</CardTitle>
          <CardDescription>
            <Trans
              i18nKey="apiTokens.authHeaderHint"
              components={[<code key="0" className="text-xs bg-muted px-1 py-0.5 rounded" />]}
            />
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
              <AlertTitle>{t("apiTokens.loadFailedTitle")}</AlertTitle>
              <AlertDescription>
                {/403/.test(String((error as any)?.message))
                  ? t("apiTokens.loadFailed403")
                  : (error as any)?.message ?? t("apiTokens.loadFailedUnknown")}
              </AlertDescription>
            </Alert>
          ) : !tokens || tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-empty">
              {t("apiTokens.noTokens")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("apiTokens.tableName")}</TableHead>
                  <TableHead>{t("apiTokens.tablePrefix")}</TableHead>
                  <TableHead>{t("common.status")}</TableHead>
                  <TableHead>{t("apiTokens.tableLastUsed")}</TableHead>
                  <TableHead>{t("apiTokens.tableExpires")}</TableHead>
                  <TableHead>{t("apiTokens.tableCreated")}</TableHead>
                  <TableHead className="text-right">{t("common.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((tk) => {
                  const status = tokenStatus(tk, t);
                  const isRevoked = !!tk.revokedAt;
                  return (
                    <TableRow key={tk.id} data-testid={`row-token-${tk.id}`}>
                      <TableCell className="font-medium" data-testid={`text-token-name-${tk.id}`}>{tk.name}</TableCell>
                      <TableCell className="font-mono text-xs">ff_{tk.prefix}…</TableCell>
                      <TableCell>
                        <Badge variant={status.variant} data-testid={`status-token-${tk.id}`}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(tk.lastUsedAt)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(tk.expiresAt)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(tk.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        {!isRevoked && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={revokeMutation.isPending}
                                aria-label={t("apiTokens.revokeTokenAria", { name: tk.name })}
                                data-testid={`button-revoke-${tk.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">{t("apiTokens.revokeTokenAria", { name: tk.name })}</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("apiTokens.revokeTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  <Trans
                                    i18nKey="apiTokens.revokeConfirmStrong"
                                    values={{ name: tk.name }}
                                    components={[<strong key="0" />]}
                                  />
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid={`button-revoke-cancel-${tk.id}`}>{t("common.cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => revokeMutation.mutate(tk.id)}
                                  data-testid={`button-revoke-confirm-${tk.id}`}
                                >
                                  {t("apiTokens.revoke")}
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
