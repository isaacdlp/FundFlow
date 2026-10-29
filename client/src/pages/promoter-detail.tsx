import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Trans, useTranslation } from "react-i18next";
import type { PromoterIncentiveInfo, PromoterInfo, IncentiveType } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { INCENTIVE_TYPES, formatPercent, incentiveLabelKey } from "@/lib/promoters";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocalePath, useLocale } from "@/i18n/hooks";
import { ROUTE_PATTERNS } from "@/i18n/routes";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Handshake, Pencil, Plus, Trash2, Users } from "lucide-react";
import NotFound from "@/pages/not-found";
import { ContractsCard } from "@/components/contracts-card";

/** The incentive being edited, or a new one (no id yet). */
type IncentiveDraft = { id?: number; type: IncentiveType; percent: string; notes: string };

function IncentivesSection({ promoter }: { promoter: PromoterInfo }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [draft, setDraft] = useState<IncentiveDraft | null>(null);
  const base = `/api/promoters/${promoter.id}/incentives`;
  const freeTypes = INCENTIVE_TYPES.filter(type => !promoter.incentives.some(i => i.type === type));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/promoters"] });
  const onError = (title: string) => (error: Error) =>
    toast({ title, description: error.message, variant: "destructive" });

  const saveMutation = useMutation({
    mutationFn: async (d: IncentiveDraft) => {
      if (d.id === undefined) {
        await apiRequest("POST", base, { type: d.type, percent: d.percent, notes: d.notes });
      } else {
        await apiRequest("PATCH", `${base}/${d.id}`, { percent: d.percent, notes: d.notes });
      }
    },
    onSuccess: () => {
      invalidate();
      setDraft(null);
      toast({ title: t("promoters.incentiveSaved") });
    },
    onError: onError(t("promoters.incentiveSaveFailed")),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `${base}/${id}`); },
    onSuccess: () => {
      invalidate();
      toast({ title: t("promoters.incentiveRemoved") });
    },
    onError: onError(t("promoters.incentiveRemoveFailed")),
  });

  const edit = (i: PromoterIncentiveInfo) =>
    setDraft({ id: i.id, type: i.type, percent: String(Number(i.percent)), notes: i.notes ?? "" });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">{t("promoters.incentives")}</h2>
          <p className="text-sm text-muted-foreground">{t("promoters.incentivesHint")}</p>
        </div>
        <Button
          variant="outline"
          onClick={() => setDraft({ type: freeTypes[0], percent: "", notes: "" })}
          disabled={freeTypes.length === 0}
          data-testid="button-add-incentive"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("promoters.addIncentive")}
        </Button>
      </CardHeader>
      <CardContent>
        {promoter.incentives.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("promoters.incentiveType")}</TableHead>
                <TableHead>{t("promoters.percent")}</TableHead>
                <TableHead>{t("promoters.notes")}</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {promoter.incentives.map(i => (
                <TableRow key={i.id} data-testid={`row-incentive-${i.type}`}>
                  <TableCell className="font-medium">{t(incentiveLabelKey(i.type))}</TableCell>
                  <TableCell>{formatPercent(i.percent)}</TableCell>
                  <TableCell className="text-muted-foreground max-w-xs truncate" title={i.notes ?? ""}>{i.notes || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => edit(i)} data-testid={`button-edit-incentive-${i.id}`}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeMutation.mutate(i.id)}
                        disabled={removeMutation.isPending}
                        data-testid={`button-remove-incentive-${i.id}`}
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
          <p className="text-sm text-muted-foreground">{t("promoters.noIncentives")}</p>
        )}
      </CardContent>

      <Dialog open={draft !== null} onOpenChange={open => { if (!open) setDraft(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id === undefined ? t("promoters.addIncentive") : t("promoters.editIncentive")}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t("promoters.incentiveType")}</Label>
                {draft.id === undefined ? (
                  <Select value={draft.type} onValueChange={v => setDraft({ ...draft, type: v as IncentiveType })}>
                    <SelectTrigger data-testid="select-incentive-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {freeTypes.map(type => (
                        <SelectItem key={type} value={type}>{t(incentiveLabelKey(type))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="text-sm">{t(incentiveLabelKey(draft.type))}</p>
                )}
                <p className="text-xs text-muted-foreground">{t(`promoters.incentiveHelp.${draft.type}`)}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="incentive-percent">{t("promoters.percent")} (%)</Label>
                <Input
                  id="incentive-percent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={draft.percent}
                  onChange={e => setDraft({ ...draft, percent: e.target.value })}
                  data-testid="input-incentive-percent"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="incentive-notes">{t("promoters.notes")}</Label>
                <Textarea id="incentive-notes" value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} data-testid="input-incentive-notes" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>{t("common.cancel")}</Button>
            <Button
              onClick={() => draft && saveMutation.mutate(draft)}
              disabled={!draft?.percent || saveMutation.isPending}
              data-testid="button-save-incentive"
            >
              {saveMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function PromoterDetail() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const locale = useLocale();
  const lp = useLocalePath();
  const [, navigate] = useLocation();
  const [, params] = useRoute<{ id: string }>(ROUTE_PATTERNS.promoterDetail[locale]);
  const promoterId = params?.id;

  const [active, setActive] = useState(true);
  const [contractDate, setContractDate] = useState("");
  const [notes, setNotes] = useState("");

  const { data: promoter, isLoading } = useQuery<PromoterInfo>({
    queryKey: ["/api/promoters", promoterId],
    enabled: isAdmin && !!promoterId,
  });

  useEffect(() => {
    if (promoter) {
      setActive(promoter.active);
      setContractDate(promoter.contractDate ?? "");
      setNotes(promoter.notes ?? "");
    }
  }, [promoter]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/promoters/${promoterId}`, { active, contractDate: contractDate || null, notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promoters"] });
      toast({ title: t("promoters.saved") });
    },
    onError: (error: Error) => toast({ title: t("promoters.saveFailed"), description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => { await apiRequest("DELETE", `/api/promoters/${promoterId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/promoters"] });
      toast({ title: t("promoters.removed") });
      navigate(lp("promoters"));
    },
    onError: (error: Error) => toast({ title: t("promoters.removeFailed"), description: error.message, variant: "destructive" }),
  });

  if (!isAdmin) return <NotFound />;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!promoter) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("promoters.notFound")}</p>
      </div>
    );
  }

  const name = `${promoter.account.firstName} ${promoter.account.lastName}`;
  const dirty = active !== promoter.active
    || contractDate !== (promoter.contractDate ?? "")
    || notes !== (promoter.notes ?? "");

  return (
    <div className="p-6 space-y-6">
      <Link href={lp("promoters")}>
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          {t("promoters.back")}
        </Button>
      </Link>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
          <Handshake className="h-8 w-8" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">{t("promoters.promoter")}</p>
          <h1 className="text-2xl font-semibold" data-testid="text-promoter-name">{name}</h1>
          <div className="flex gap-2 mt-1 flex-wrap">
            <Badge variant={promoter.active ? "default" : "secondary"}>
              {promoter.active ? t("promoters.active") : t("promoters.inactive")}
            </Badge>
            <Badge variant="outline">{t("promoters.introductionCount", { count: promoter.introductionCount })}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`${lp("accountDetail", { id: promoter.accountId })}?tab=introductions`}>
            <Button variant="outline" className="gap-2" data-testid="button-view-introductions">
              <Users className="h-4 w-4" />
              {t("promoters.viewIntroductions")}
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" data-testid="button-remove-promoter">
                <Trash2 className="h-4 w-4" />
                {t("promoters.remove")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("promoters.removeTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  <Trans i18nKey="promoters.removeConfirm" values={{ name }} components={[<strong key="0" />]} />
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()} data-testid="button-confirm-remove-promoter">
                  {t("promoters.remove")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("promoters.details")}</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Switch id="promoter-active" checked={active} onCheckedChange={setActive} data-testid="switch-promoter-active" />
            <Label htmlFor="promoter-active">{t("promoters.activeLabel")}</Label>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">{t("promoters.activeHint")}</p>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="promoter-contract-date">{t("promoters.contractDate")}</Label>
            <Input id="promoter-contract-date" type="date" value={contractDate} onChange={e => setContractDate(e.target.value)} data-testid="input-promoter-contract-date" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="promoter-notes">{t("promoters.notes")}</Label>
            <Textarea id="promoter-notes" value={notes} onChange={e => setNotes(e.target.value)} data-testid="input-promoter-notes" />
          </div>
          <Button onClick={() => updateMutation.mutate()} disabled={!dirty || updateMutation.isPending} data-testid="button-save-promoter">
            {updateMutation.isPending ? t("common.saving") : t("common.save")}
          </Button>
        </CardContent>
      </Card>

      <IncentivesSection promoter={promoter} />

      <ContractsCard
        listUrl={`/api/promoters/${promoter.id}/contracts`}
        draftUrl={`/api/promoters/${promoter.id}/contracts/draft`}
        createUrl={`/api/promoters/${promoter.id}/contracts`}
        hint={t("promoters.contractsHint")}
        // Signing sets the contract date when it's empty.
        onChange={() => queryClient.invalidateQueries({ queryKey: ["/api/promoters", promoterId] })}
      />
    </div>
  );
}
