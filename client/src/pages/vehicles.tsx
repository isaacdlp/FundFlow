import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import type { VehicleInfo } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { normalizeSearch } from "@/lib/utils";
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
import { useSort } from "@/hooks/use-sort";
import { SortableTableHead } from "@/components/sortable-table-head";
import { usePagination } from "@/hooks/use-pagination";
import { ListPagination } from "@/components/list-pagination";

export default function Vehicles() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { canManageOrg } = useOrgPermissions();
  const [search, setSearch] = useState("");
  const { t } = useTranslation();
  const lp = useLocalePath();

  const { data: vehiclesList, isLoading } = useQuery<VehicleInfo[]>({
    queryKey: ["/api/vehicles"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (vehicleId: number) => {
      const res = await apiRequest("DELETE", `/api/vehicles/${vehicleId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({ title: t("vehicles.deleted") });
    },
    onError: (error: Error) => {
      toast({ title: t("vehicles.deleteFailed"), description: error.message, variant: "destructive" });
    },
  });

  const filtered = vehiclesList?.filter(vehicle => {
    if (!search) return true;
    const q = normalizeSearch(search);
    return (
      normalizeSearch(vehicle.displayName).includes(q) ||
      normalizeSearch(vehicle.legalName).includes(q) ||
      normalizeSearch(vehicle.organization?.name || "").includes(q) ||
      normalizeSearch(vehicle.entityType || "").includes(q)
    );
  });
  const sort = useSort(filtered, {
    name: vehicle => vehicle.displayName,
    org: vehicle => vehicle.organization?.name,
    entityType: vehicle => vehicle.entityType || "LLC",
    manager: vehicle => vehicle.manager ? `${vehicle.manager.firstName} ${vehicle.manager.lastName}` : null,
  });
  const pagination = usePagination(sort.sorted, [search, sort.sort]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">{t("vehicles.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("vehicles.subtitle")}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("vehicles.searchPlaceholder")}
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
                    <SortableTableHead control={sort} column="name">{t("vehicles.tableName")}</SortableTableHead>
                    <SortableTableHead control={sort} column="org">{t("vehicles.tableOrg")}</SortableTableHead>
                    <SortableTableHead control={sort} column="entityType">{t("vehicles.tableEntityType")}</SortableTableHead>
                    <SortableTableHead control={sort} column="manager">{t("vehicles.tableManager")}</SortableTableHead>
                    <TableHead className="text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.items.map(vehicle => (
                    <TableRow key={vehicle.id} data-testid={`vehicle-row-${vehicle.id}`}>
                      <TableCell>
                        <Link href={lp("vehicleDetail", { id: vehicle.id })}>
                          <div className="cursor-pointer">
                            <p className="text-sm font-medium hover:underline" data-testid={`text-vehicle-name-${vehicle.id}`}>
                              {vehicle.displayName}
                            </p>
                            <p className="text-xs text-muted-foreground">{vehicle.legalName}</p>
                          </div>
                        </Link>
                      </TableCell>
                      <TableCell>
                        {vehicle.organization ? (
                          <Link href={lp("organizationDetail", { id: vehicle.organization.id })}>
                            <div className="flex items-center gap-1.5 cursor-pointer hover:underline">
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm" data-testid={`text-vehicle-org-${vehicle.id}`}>{vehicle.organization.name}</span>
                            </div>
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">{t("common.unknown")}</span>
                        )}
                      </TableCell>
                      <TableCell><Badge variant="outline">{vehicle.entityType || "LLC"}</Badge></TableCell>
                      <TableCell>
                        {vehicle.manager ? (
                          <span className="text-sm">{vehicle.manager.firstName} {vehicle.manager.lastName}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">{t("vehicles.notAssigned")}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => navigate(lp("vehicleDetail", { id: vehicle.id }))} data-testid={`button-view-vehicle-${vehicle.id}`}>
                            <FileText className="h-4 w-4" />
                          </Button>
                          {canManageOrg(vehicle.organizationId) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(vehicle.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-vehicle-${vehicle.id}`}
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
              <ListPagination control={pagination.control} className="border-t" />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {search ? t("vehicles.noResultsSearch") : t("vehicles.noVehicles")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
