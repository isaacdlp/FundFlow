import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import type { OrganizationWithOrganizers } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useOrgPermissions } from "@/hooks/use-org-permissions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Plus, Search, ChevronRight, Trash2, Building2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocalePath } from "@/i18n/hooks";

export default function Organizations() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const { canManageOrg } = useOrgPermissions();
  const { t } = useTranslation();
  const lp = useLocalePath();

  const { data: orgs, isLoading } = useQuery<OrganizationWithOrganizers[]>({
    queryKey: ["/api/organizations"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/organizations/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      toast({ title: t("organizations.deleted") });
    },
    onError: (error: Error) => {
      toast({ title: t("organizations.deleteFailed"), description: error.message, variant: "destructive" });
    },
  });

  const filtered = orgs?.filter((org) => {
    if (!search) return true;
    return org.name.toLowerCase().includes(search.toLowerCase()) ||
      (org.description || "").toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">{t("organizations.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("organizations.subtitle")}</p>
        </div>
        {isAdmin && (
          <Link href={lp("organizationNew")}>
            <Button data-testid="button-create-organization">
              <Plus className="h-4 w-4 mr-2" />
              {t("organizations.addOrganization")}
            </Button>
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("organizations.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : filtered && filtered.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("organizations.tableOrg")}</TableHead>
                    <TableHead>{t("organizations.tableLocation")}</TableHead>
                    <TableHead>{t("organizations.tableOrganizers")}</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((org) => (
                    <TableRow key={org.id} data-testid={`row-org-${org.id}`}>
                      <TableCell>
                        <Link href={lp("organizationDetail", { id: org.id })}>
                          <div className="flex items-center gap-3 cursor-pointer" data-testid={`link-org-${org.id}`}>
                            <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                              <Building2 className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{org.name}</p>
                              {org.description && (
                                <p className="text-xs text-muted-foreground truncate max-w-[300px]">{org.description}</p>
                              )}
                            </div>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {[org.city, org.stateProvince, org.country].filter(Boolean).join(", ") || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {org.organizers.length > 0 ? (
                            org.organizers.map((o) => (
                              <Badge key={o.id} variant="secondary">
                                {o.account.firstName} {o.account.lastName}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">{t("organizations.noneAssigned")}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 items-center justify-end">
                          {canManageOrg(org.id) && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-delete-org-${org.id}`}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t("organizations.deleteTitle")}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t("organizations.deleteConfirm", { name: org.name })}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(org.id)}
                                    data-testid={`button-confirm-delete-org-${org.id}`}
                                  >
                                    {t("common.delete")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                          <Link href={lp("organizationDetail", { id: org.id })}>
                            <Button variant="ghost" size="icon" data-testid={`button-view-org-${org.id}`}>
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">
                {search ? t("organizations.noResultsSearch") : t("organizations.noOrgs")}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
