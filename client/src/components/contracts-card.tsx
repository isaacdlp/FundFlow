import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { ContractDraft, ContractInfo } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/i18n/hooks";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ExternalLink, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";

const KNOWN_STATUSES = ["DRAFT", "VALIDATION", "NEGOTIATION", "SIGNING", "SIGNED", "BROKEN", "DELETED"];

export function contractStatusKey(status: string): string {
  return KNOWN_STATUSES.includes(status) ? `contracts.statuses.${status}` : "contracts.statuses.other";
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "SIGNED") return "default";
  if (status === "BROKEN" || status === "DELETED") return "destructive";
  if (status === "SIGNING") return "secondary";
  return "outline";
}

/** Draft being edited: variables as rows so keys can be renamed. */
type Editing = { title: string; signers: string[]; variables: { key: string; value: string }[]; subject: string; message: string };

function SendContractDialog({ draft, createUrl, onClose, onSent }: {
  draft: ContractDraft;
  createUrl: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState<Editing>(() => ({
    title: draft.title,
    signers: draft.signers,
    variables: Object.entries(draft.variables).map(([key, value]) => ({ key, value })),
    subject: draft.subject,
    message: draft.message,
  }));

  const sendMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", createUrl, {
        title: form.title,
        signers: form.signers.map(s => s.trim()).filter(Boolean),
        variables: Object.fromEntries(form.variables.filter(v => v.key.trim()).map(v => [v.key.trim(), v.value])),
        subject: form.subject,
        message: form.message,
      });
    },
    onSuccess: () => {
      toast({ title: t("contracts.sent") });
      onSent();
    },
    onError: (error: Error) => toast({ title: t("contracts.sendFailed"), description: error.message, variant: "destructive" }),
  });

  const setSigner = (i: number, value: string) =>
    setForm({ ...form, signers: form.signers.map((s, j) => (j === i ? value : s)) });
  const setVariable = (i: number, patch: Partial<{ key: string; value: string }>) =>
    setForm({ ...form, variables: form.variables.map((v, j) => (j === i ? { ...v, ...patch } : v)) });

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("contracts.sendTitle")}</DialogTitle>
          <DialogDescription>{t("contracts.sendDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="contract-title">{t("contracts.title")}</Label>
            <Input id="contract-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} data-testid="input-contract-title" />
          </div>

          <div className="space-y-2">
            <Label>{t("contracts.signers")}</Label>
            <p className="text-xs text-muted-foreground">{t("contracts.signersHint")}</p>
            {form.signers.map((signer, i) => (
              <div key={i} className="flex gap-2">
                <Input type="email" value={signer} onChange={e => setSigner(i, e.target.value)} data-testid={`input-contract-signer-${i}`} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setForm({ ...form, signers: form.signers.filter((_, j) => j !== i) })}
                  disabled={form.signers.length === 1}
                  aria-label={t("common.remove")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm({ ...form, signers: [...form.signers, ""] })} data-testid="button-add-signer">
              <Plus className="h-4 w-4 mr-1" />
              {t("contracts.addSigner")}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>{t("contracts.variables")}</Label>
            <p className="text-xs text-muted-foreground">{t("contracts.variablesHint")}</p>
            {form.variables.map((v, i) => (
              <div key={i} className="flex gap-2">
                <Input className="w-2/5" value={v.key} onChange={e => setVariable(i, { key: e.target.value })} placeholder={t("contracts.variableName")} data-testid={`input-contract-variable-key-${i}`} />
                <Input className="flex-1" value={v.value} onChange={e => setVariable(i, { value: e.target.value })} placeholder={t("contracts.variableValue")} data-testid={`input-contract-variable-value-${i}`} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setForm({ ...form, variables: form.variables.filter((_, j) => j !== i) })}
                  aria-label={t("common.remove")}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setForm({ ...form, variables: [...form.variables, { key: "", value: "" }] })} data-testid="button-add-variable">
              <Plus className="h-4 w-4 mr-1" />
              {t("contracts.addVariable")}
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contract-subject">{t("contracts.subject")}</Label>
            <Input id="contract-subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder={form.title} data-testid="input-contract-subject" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contract-message">{t("contracts.message")}</Label>
            <Textarea id="contract-message" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} data-testid="input-contract-message" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={!form.title.trim() || !form.signers.some(s => s.trim()) || sendMutation.isPending}
            data-testid="button-confirm-send-contract"
          >
            {sendMutation.isPending ? t("contracts.sending") : t("contracts.send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Contracts sent through Concord for one subject (a promoter, later an
 * investment or a tax form): list, check status, delete, and send a new one
 * from the subject's draft.
 */
export function ContractsCard({ listUrl, draftUrl, createUrl, hint, onChange }: {
  /** GET → ContractInfo[] */
  listUrl: string;
  /** GET → ContractDraft */
  draftUrl: string;
  /** POST { title, signers, variables, message } */
  createUrl: string;
  hint?: string;
  /** Called after a contract is sent, refreshed or deleted (e.g. to refetch the subject). */
  onChange?: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const locale = useLocale();
  const [sending, setSending] = useState(false);
  const [toDelete, setToDelete] = useState<ContractInfo | null>(null);

  const { data: contracts, isLoading } = useQuery<ContractInfo[]>({ queryKey: [listUrl] });
  const { data: draft } = useQuery<ContractDraft>({ queryKey: [draftUrl] });

  const changed = () => {
    queryClient.invalidateQueries({ queryKey: [listUrl] });
    onChange?.();
  };
  const onError = (title: string) => (error: Error) =>
    toast({ title, description: error.message, variant: "destructive" });

  const refreshMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("POST", `/api/contracts/${id}/refresh`); },
    onSuccess: () => {
      changed();
      toast({ title: t("contracts.refreshed") });
    },
    onError: onError(t("contracts.refreshFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/contracts/${id}`); },
    onSuccess: () => {
      changed();
      toast({ title: t("contracts.deleted") });
    },
    onError: (error: Error) => {
      // A 409 means it turned out to be signed; show the fresh status.
      changed();
      onError(t("contracts.deleteFailed"))(error);
    },
  });

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" }) : "—";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">{t("contracts.heading")}</h2>
          <p className="text-sm text-muted-foreground">{hint ?? t("contracts.hint")}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setSending(true)}
          disabled={!draft?.ready}
          title={draft && !draft.ready ? t("contracts.notConfigured") : undefined}
          data-testid="button-send-contract"
        >
          <Send className="h-4 w-4 mr-2" />
          {t("contracts.send")}
        </Button>
      </CardHeader>
      <CardContent>
        {draft && !draft.ready && (
          <p className="text-sm text-muted-foreground mb-4" data-testid="text-contracts-not-configured">{t("contracts.notConfigured")}</p>
        )}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : contracts && contracts.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("contracts.title")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                <TableHead>{t("contracts.signers")}</TableHead>
                <TableHead>{t("contracts.sentOn")}</TableHead>
                <TableHead className="w-[140px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contracts.map(c => (
                <TableRow key={c.id} data-testid={`row-contract-${c.id}`}>
                  <TableCell className="font-medium">{c.title}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(c.status)}>{t(contractStatusKey(c.status), { status: c.status })}</Badge>
                    {c.signedAt && <p className="text-xs text-muted-foreground mt-1">{t("contracts.signedOn", { date: formatDate(c.signedAt) })}</p>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.signers.join(", ")}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(c.createdAt)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      {c.url && (
                        <Button variant="ghost" size="icon" asChild title={t("contracts.openInConcord")}>
                          <a href={c.url} target="_blank" rel="noopener noreferrer" data-testid={`link-contract-${c.id}`}>
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => refreshMutation.mutate(c.id)}
                        disabled={refreshMutation.isPending}
                        title={t("contracts.checkStatus")}
                        data-testid={`button-refresh-contract-${c.id}`}
                      >
                        <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending && refreshMutation.variables === c.id ? "animate-spin" : ""}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setToDelete(c)}
                        disabled={c.status === "SIGNED" || deleteMutation.isPending}
                        title={c.status === "SIGNED" ? t("contracts.signedCantDelete") : t("common.delete")}
                        data-testid={`button-delete-contract-${c.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">{t("contracts.none")}</p>
        )}
      </CardContent>

      {sending && draft && (
        <SendContractDialog
          draft={draft}
          createUrl={createUrl}
          onClose={() => setSending(false)}
          onSent={() => { setSending(false); changed(); }}
        />
      )}

      <AlertDialog open={toDelete !== null} onOpenChange={open => { if (!open) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("contracts.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("contracts.deleteConfirm", { title: toDelete?.title ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (toDelete) deleteMutation.mutate(toDelete.id); setToDelete(null); }}
              data-testid="button-confirm-delete-contract"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
