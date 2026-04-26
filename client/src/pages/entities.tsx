import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import type { EntityInfo } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Building, Search, Trash2, Plus } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

export default function Entities() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState("");

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
      toast({ title: "Entity deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete entity", description: error.message, variant: "destructive" });
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
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Entities</h1>
          <p className="text-muted-foreground mt-1">Manage associated entities (companies, trusts, etc.)</p>
        </div>
        {isAdmin && (
          <Link href="/entities/new">
            <Button data-testid="button-add-entity">
              <Plus className="h-4 w-4 mr-2" />
              Add Entity
            </Button>
          </Link>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by anything"
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
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Managers</TableHead>
                    <TableHead className="text-center">Owners</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(entity => (
                    <TableRow key={entity.id} data-testid={`entity-row-${entity.id}`}>
                      <TableCell>
                        <Link href={`/entities/${entity.id}`}>
                          <span className="text-sm font-medium cursor-pointer hover:underline" data-testid={`text-entity-name-${entity.id}`}>
                            {entity.name}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{entity.entityType}</Badge>
                      </TableCell>
                      <TableCell>
                        {entity.managers.length > 0 ? (
                          <span className="text-sm">
                            {entity.managers.map(m => `${m.account.firstName} ${m.account.lastName}`).join(", ")}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">No managers</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{entity.ownerCount}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/entities/${entity.id}`)} data-testid={`button-view-entity-${entity.id}`}>
                            <Building className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteMutation.mutate(entity.id)}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-entity-${entity.id}`}
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
            <Building className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {search ? "No entities match your search." : "No entities have been created yet."}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
