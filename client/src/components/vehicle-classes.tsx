import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Layers, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import type { VehicleClassInfo } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/i18n/hooks";
import { fmtMoney } from "@/lib/format";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * The share classes of a Vehicle: segregated pools, each with its own
 * investors and assets. Every Vehicle has at least one; with only one, the
 * rest of the page doesn't mention classes. Organizers create, rename and
 * delete them; investors see (read-only) the classes they hold positions in.
 */
export function VehicleClassesTab({ vehicleId, classes, isLoading, canEdit, currencySymbol }: {
  vehicleId: string;
  classes: VehicleClassInfo[] | undefined;
  isLoading: boolean;
  canEdit: boolean;
  currencySymbol: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const locale = useLocale();
  const money = (v: string) => currencySymbol + fmtMoney(parseFloat(v || "0"), locale);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Classes move positions and assets around: refresh everything under this Vehicle.
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/vehicles", vehicleId] });
    queryClient.invalidateQueries({ predicate: q => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/portfolio") });
  };

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; notes: string }) => {
      const res = await apiRequest("POST", `/api/vehicles/${vehicleId}/classes`, payload);
      return res.json();
    },
    onSuccess: () => {
      refresh();
      setName(""); setNotes("");
      toast({ title: t("vehicleDetail.classAdded") });
    },
    onError: (e: Error) => toast({ title: t("vehicleDetail.classAddFailed"), description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: { id: number; name: string; notes: string }) => {
      const res = await apiRequest("PATCH", `/api/vehicles/${vehicleId}/classes/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      refresh();
      setEditingId(null);
      toast({ title: t("vehicleDetail.classUpdated") });
    },
    onError: (e: Error) => toast({ title: t("vehicleDetail.classUpdateFailed"), description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/vehicles/${vehicleId}/classes/${id}`);
      return res.json();
    },
    onSuccess: () => {
      refresh();
      toast({ title: t("vehicleDetail.classDeleted") });
    },
    onError: (e: Error) => toast({ title: t("vehicleDetail.classDeleteFailed"), description: e.message, variant: "destructive" }),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const list = classes ?? [];

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">{t("vehicleDetail.classes")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("vehicleDetail.classesSubtitle")}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {canEdit && (
          <div className="space-y-3 p-4 rounded-md border bg-muted/30">
            <div className="space-y-1">
              <Label className="text-xs">{t("vehicleDetail.className")}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={t("vehicleDetail.classNamePlaceholder")} data-testid="input-class-name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("common.notes")}</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("vehicleDetail.optional")} data-testid="input-class-notes" />
            </div>
            <p className="text-xs text-muted-foreground" data-testid="text-class-help">
              {t(list.length === 1 ? "vehicleDetail.singleClassHelp" : "vehicleDetail.deleteClassHelp")}
            </p>
            <div className="flex justify-end">
              <Button
                onClick={() => createMutation.mutate({ name: name.trim(), notes })}
                disabled={!name.trim() || createMutation.isPending}
                data-testid="button-add-class"
              >
                <Plus className="h-4 w-4 mr-2" />
                {createMutation.isPending ? t("vehicleDetail.adding") : t("vehicleDetail.addClass")}
              </Button>
            </div>
          </div>
        )}

        {canEdit && <Separator />}

        <div className="space-y-3">
          {list.map(c => (
            <div key={c.id} className="p-3 rounded-md border" data-testid={`vehicle-class-${c.id}`}>
              {editingId === c.id ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("vehicleDetail.className")}</Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} data-testid={`input-edit-class-name-${c.id}`} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("common.notes")}</Label>
                    <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} data-testid={`input-edit-class-notes-${c.id}`} />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingId(null)} data-testid={`button-cancel-class-${c.id}`}>
                      <X className="h-4 w-4 mr-1" /> {t("common.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => updateMutation.mutate({ id: c.id, name: editName.trim(), notes: editNotes })}
                      disabled={!editName.trim() || updateMutation.isPending}
                      data-testid={`button-save-class-${c.id}`}
                    >
                      <Save className="h-4 w-4 mr-1" /> {updateMutation.isPending ? t("common.saving") : t("common.save")}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-md flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                      <Layers className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate" data-testid={`text-class-name-${c.id}`}>{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t("vehicleDetail.memberCount", { count: c.memberCount })} · {t("vehicleDetail.assetCount", { count: c.assetCount })}
                      </p>
                    </div>
                    {canEdit && (
                      <>
                        <Button variant="ghost" size="icon" onClick={() => { setEditingId(c.id); setEditName(c.name); setEditNotes(c.notes ?? ""); }} data-testid={`button-edit-class-${c.id}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {list.length > 1 && (
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)} disabled={deleteMutation.isPending} data-testid={`button-delete-class-${c.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">{t("vehicleDetail.committed")}</p>
                      <p className="font-medium" data-testid={`text-class-committed-${c.id}`}>{money(c.committed)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("vehicleDetail.cash")}</p>
                      <p className="font-medium" data-testid={`text-class-cash-${c.id}`}>{money(c.cash)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("vehicleDetail.assetValue")}</p>
                      <p className="font-medium" data-testid={`text-class-asset-value-${c.id}`}>{money(c.assetValue)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("vehicleDetail.currentValue")}</p>
                      <p className="font-medium" data-testid={`text-class-current-value-${c.id}`}>{money(c.currentValue)}</p>
                    </div>
                  </div>
                  {c.notes && <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">{c.notes}</p>}
                </>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/** A share class picker for the investment and asset forms. */
export function ClassSelect({ classes, value, onChange, testId, includeAll }: {
  classes: VehicleClassInfo[];
  value: string;
  onChange: (value: string) => void;
  testId: string;
  /** Adds an "All classes" choice (value "all"), for filters. */
  includeAll?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder={t("vehicleDetail.selectClass")} />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="all">{t("vehicleDetail.allClasses")}</SelectItem>}
        {classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
