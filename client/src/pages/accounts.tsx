import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Trans, useTranslation } from "react-i18next";
import type { AccountWithRoles } from "@shared/types";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { normalizeSearch } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Search, ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocalePath } from "@/i18n/hooks";

export default function Accounts() {
  const [search, setSearch] = useState("");
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const lp = useLocalePath();

  const { data: accounts, isLoading } = useQuery<AccountWithRoles[]>({
    queryKey: ["/api/accounts"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/accounts/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: t("accounts.deleted") });
    },
    onError: (error: Error) => {
      toast({ title: t("accounts.deleteFailed"), description: error.message, variant: "destructive" });
    },
  });

  const filtered = accounts?.filter((account) => {
    if (!search) return true;
    const q = normalizeSearch(search);
    return normalizeSearch(`${account.firstName} ${account.lastName}`).includes(q) ||
      normalizeSearch(account.email).includes(q);
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">{t("accounts.title")}</h1>
          <p className="text-muted-foreground mt-1">{t("accounts.subtitle")}</p>
        </div>
        {isAdmin && (
          <Link href={lp("accountNew")}>
            <Button data-testid="button-create-account">
              <Plus className="h-4 w-4 mr-2" />
              {t("accounts.addAccount")}
            </Button>
          </Link>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("accounts.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search"
        />
      </div>

      <Card>
          {isLoading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : filtered && filtered.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("accounts.tableName")}</TableHead>
                    <TableHead>{t("accounts.tableEmail")}</TableHead>
                    <TableHead>{t("accounts.tableRoles")}</TableHead>
                    <TableHead className="w-[100px] text-right">{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((account) => {
                    const isSelf = user?.id === account.id;
                    return (
                      <TableRow key={account.id} data-testid={`row-account-${account.id}`}>
                        <TableCell>
                          <Link href={lp("accountDetail", { id: account.id })}>
                            <div className="flex items-center gap-3 cursor-pointer" data-testid={`link-account-${account.id}`}>
                              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold flex-shrink-0">
                                {account.firstName[0]}{account.lastName[0]}
                              </div>
                              <span className="font-medium">{account.firstName} {account.lastName}</span>
                            </div>
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{account.email}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {account.roles.map((role) => (
                              <Badge key={role.id} variant={role.name === "admin" ? "destructive" : "secondary"}>
                                {role.name.toUpperCase()}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 items-center justify-end">
                            {isAdmin && !isSelf && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" data-testid={`button-delete-account-${account.id}`}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{t("accounts.deleteTitle")}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      <Trans
                                        i18nKey="accounts.deleteConfirm"
                                        values={{ name: `${account.firstName} ${account.lastName}`, email: account.email }}
                                        components={[<strong key="0" />]}
                                      />
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteMutation.mutate(account.id)}
                                      data-testid={`button-confirm-delete-account-${account.id}`}
                                    >
                                      {t("common.delete")}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                            <Link href={lp("accountDetail", { id: account.id })}>
                              <Button variant="ghost" size="icon" data-testid={`button-view-account-${account.id}`}>
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {search ? t("accounts.noResultsSearch") : t("accounts.noAccounts")}
              </p>
            </div>
          )}
      </Card>
    </div>
  );
}
