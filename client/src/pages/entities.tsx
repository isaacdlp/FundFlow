import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Trans, useTranslation } from "react-i18next";
import type { EntityInfo } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Building, Search, Trash2, Plus } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLocalePath } from "@/i18n/hooks";

export default function Entities() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const { t } = useTranslation();
  const lp = useLocalePath();

  const { data: entitiesList, isLoading } = useQuery<EntityInfo[]>({
    queryKey: ["/api/entities"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/entities/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/entities"] });
      toast({ title: t("entities.deleted") });
    },
    onError: (error: Error) => {
      toast({ title: t("entities.deleteFailed"), description: error.message, variant: "destructive" });
    },
  });

  const filtered = entitiesList?.filter(e => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.name.toLowerCase().includes(q) ||
      e.entityType.toLowerCase().includes(q) ||
      e.managers.some(m => `${m.account.firstName} ${m.account.lastName}`.toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">{t("entities.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("entities.subtitle")}</p>
        </div>
        {isAdmin && (
          <Link href={lp("entityNew")}>
            <Button data-testid="button-add-entity">
              <Plus className="h-4 w-4 mr-2" />
              {t("entities.addEntity")}
            </Button>
          </Link>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("entities.searchPlaceholder")}
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
                    <TableHead>{t("entities.tableName")}</TableHead>
                    <TableHead>{t("entities.tableType")}</TableHead>
                    <TableHead>{t("entities.tableManagers")}</TableHead>
                    <TableHead className="text-center">{t("entities.tableOwners")}</TableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(entity => (
                    <TableRow key={entity.id} data-testid={`entity-row-${entity.id}`}>
                      <TableCell>
                        <Link href={lp("entityDetail", { id: entity.id })}>
                          <span className="text-sm font-medium cursor-pointer hover:underline" data-testid={`text-entity-name-${entity.id}`}>
                            {entity.name}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell><Badge variant="outline">{entity.entityType}</Badge></TableCell>
                      <TableCell>
                        {entity.managers.length > 0 ? (
                          <span className="text-sm">
                            {entity.managers.map(m => `${m.account.firstName} ${m.account.lastName}`).join(", ")}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">{t("entities.noManagers")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{entity.ownerCount}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => navigate(lp("entityDetail", { id: entity.id }))} data-testid={`button-view-entity-${entity.id}`}>
                            <Building className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-delete-entity-${entity.id}`}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t("entities.deleteTitle")}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    <Trans i18nKey="entities.deleteConfirm" values={{ name: entity.name }} components={[<strong key="0" />]} />
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(entity.id)}
                                    data-testid={`button-confirm-delete-entity-${entity.id}`}
                                  >
                                    {t("common.delete")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
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
            <Building className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {search ? t("entities.noResultsSearch") : t("entities.noEntities")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
