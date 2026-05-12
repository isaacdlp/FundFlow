import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import type { SpvInfo } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Search, Trash2, Building2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useOrgPermissions } from "@/hooks/use-org-permissions";
import { useLocalePath } from "@/i18n/hooks";

export default function Spvs() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { canManageOrg } = useOrgPermissions();
  const [search, setSearch] = useState("");
  const { t } = useTranslation();
  const lp = useLocalePath();

  const { data: spvsList, isLoading } = useQuery<SpvInfo[]>({
    queryKey: ["/api/spvs"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (spvId: number) => {
      const res = await apiRequest("DELETE", `/api/spvs/${spvId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spvs"] });
      toast({ title: t("spvs.deleted") });
    },
    onError: (error: Error) => {
      toast({ title: t("spvs.deleteFailed"), description: error.message, variant: "destructive" });
    },
  });

  const filtered = spvsList?.filter(spv => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      spv.displayName.toLowerCase().includes(q) ||
      spv.legalName.toLowerCase().includes(q) ||
      (spv.organization?.name || "").toLowerCase().includes(q) ||
      (spv.entityType || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">{t("spvs.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("spvs.subtitle")}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("spvs.searchPlaceholder")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : filtered && filtered.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("spvs.tableName")}</TableHead>
                    <TableHead>{t("spvs.tableOrg")}</TableHead>
                    <TableHead>{t("spvs.tableEntityType")}</TableHead>
                    <TableHead>{t("spvs.tableManager")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(spv => (
                    <TableRow key={spv.id} data-testid={`spv-row-${spv.id}`}>
                      <TableCell>
                        <Link href={lp("spvDetail", { id: spv.id })}>
                          <div className="cursor-pointer">
                            <p className="text-sm font-medium hover:underline" data-testid={`text-spv-name-${spv.id}`}>
                              {spv.displayName}
                            </p>
                            <p className="text-xs text-muted-foreground">{spv.legalName}</p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {spv.organization ? (
                          <Link href={lp("organizationDetail", { id: spv.organization.id })}>
                            <div className="flex items-center gap-1.5 cursor-pointer hover:underline">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm" data-testid={`text-spv-org-${spv.id}`}>{spv.organization.name}</span>
                            </div>
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">{t("common.unknown")}</span>
                        )}
                      </TableCell>
                      <TableCell><Badge variant="outline">{spv.entityType || "LLC"}</Badge></TableCell>
                      <TableCell>
                        {spv.manager ? (
                          <span className="text-sm">{spv.manager.firstName} {spv.manager.lastName}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">{t("spvs.notAssigned")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => navigate(lp("spvDetail", { id: spv.id }))} data-testid={`button-view-spv-${spv.id}`}>
                            <FileText className="h-4 w-4" />
                          </Button>
                          {canManageOrg(spv.organizationId) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(spv.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-spv-${spv.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {search ? t("spvs.noResultsSearch") : t("spvs.noSpvs")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
