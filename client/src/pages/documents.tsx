import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { normalizeSearch } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  FolderOpen, Folder, FileText, Upload, Download, Trash2, ChevronRight, ChevronDown, Files, Search,
} from "lucide-react";

type DocOwner = { id: number; type: "account" | "entity"; name: string } | null;
type DocItem = {
  id: number;
  name: string;
  folderPath: string;
  ownerType: "account" | "entity";
  accountId: number | null;
  entityId: number | null;
  fileName: string;
  storedPath: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: number | null;
  createdAt: string | null;
  owner: DocOwner;
  uploader: { id: number; name: string } | null;
};

type AccountLite = { id: number; firstName: string; lastName: string; email: string };
type EntityLite = { id: number; name: string };

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

type FolderNode = {
  name: string;
  fullPath: string;
  children: Map<string, FolderNode>;
  docs: DocItem[];
};

function ownerLabel(doc: DocItem, labels: { account: string; entity: string; unknown: string }): string {
  const o = doc.owner;
  const kind = doc.ownerType === "account" ? labels.account : labels.entity;
  const name = (o?.name || labels.unknown).replace(/\//g, " ");
  const id = o?.id ?? (doc.accountId ?? doc.entityId ?? "?");
  return `${kind} · ${name} (#${id})`;
}

function buildTree(docs: DocItem[], ownerLabels: { account: string; entity: string; unknown: string }): FolderNode {
  const root: FolderNode = { name: "", fullPath: "", children: new Map(), docs: [] };
  for (const doc of docs) {
    const ownerSeg = ownerLabel(doc, ownerLabels);
    const folderSegs = (doc.folderPath || "").split("/").filter(Boolean);
    const parts = [ownerSeg, ...folderSegs];
    let node = root;
    let acc = "";
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      if (!node.children.has(p)) {
        node.children.set(p, { name: p, fullPath: acc, children: new Map(), docs: [] });
      }
      node = node.children.get(p)!;
    }
    node.docs.push(doc);
  }
  return root;
}

function FolderTree({
  node, depth, selectedPath, onSelect, rootLabel,
}: {
  node: FolderNode;
  depth: number;
  selectedPath: string;
  onSelect: (path: string) => void;
  rootLabel: string;
}) {
  const [open, setOpen] = useState(depth === 0);
  const isSelected = node.fullPath === selectedPath;
  const children = Array.from(node.children.values()).sort((a, b) => a.name.localeCompare(b.name));
  const isRoot = depth === 0;

  return (
    <div>
      <button
        type="button"
        className={`w-full flex items-center gap-1 text-left px-2 py-1.5 rounded text-sm hover-elevate ${isSelected ? "bg-accent" : ""}`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => { onSelect(node.fullPath); if (!isRoot) setOpen(o => !o); }}
        data-testid={`folder-${node.fullPath || "root"}`}
      >
        {children.length > 0 && !isRoot ? (open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />) : <span className="w-3" />}
        {isRoot ? <Files className="h-4 w-4" /> : open ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
        <span className="truncate">{isRoot ? rootLabel : node.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">{node.docs.length || ""}</span>
      </button>
      {open && children.map(c => (
        <FolderTree key={c.fullPath} node={c} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} rootLabel={rootLabel} />
      ))}
    </div>
  );
}

function collectDocsRecursive(node: FolderNode): DocItem[] {
  const out = [...node.docs];
  Array.from(node.children.values()).forEach(child => {
    out.push(...collectDocsRecursive(child));
  });
  return out;
}

function findNode(root: FolderNode, fullPath: string): FolderNode | null {
  if (!fullPath) return root;
  const parts = fullPath.split("/").filter(Boolean);
  let node: FolderNode | undefined = root;
  for (const p of parts) {
    node = node?.children.get(p);
    if (!node) return null;
  }
  return node ?? null;
}

function UploadDialog({ accounts, entities }: { accounts: AccountLite[]; entities: EntityLite[] }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [ownerType, setOwnerType] = useState<"account" | "entity">("account");
  const [accountId, setAccountId] = useState<string>("");
  const [entityId, setEntityId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);

  const reset = () => {
    setName(""); setFolderPath(""); setOwnerType("account");
    setAccountId(""); setEntityId(""); setFile(null);
  };

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t("documents.selectFile"));
      const fd = new FormData();
      fd.append("file", file);
      fd.append("name", name || file.name);
      fd.append("folderPath", folderPath);
      fd.append("ownerType", ownerType);
      if (ownerType === "account") fd.append("accountId", accountId);
      else fd.append("entityId", entityId);
      const res = await fetch("/api/documents", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) {
        const text = await res.text().catch(() => res.statusText);
        throw new Error(text || t("documents.uploadFailed"));
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("documents.uploaded") });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setOpen(false); reset();
    },
    onError: (e: any) => toast({ title: t("documents.uploadFailed"), description: e.message, variant: "destructive" }),
  });

  const canSubmit = !!file && (ownerType === "account" ? !!accountId : !!entityId);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button data-testid="button-upload-document">
          <Upload className="h-4 w-4 mr-2" /> {t("documents.upload")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("documents.uploadTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="doc-file">{t("documents.file")}</Label>
            <Input id="doc-file" type="file" onChange={e => setFile(e.target.files?.[0] ?? null)}
              data-testid="input-doc-file" />
          </div>
          <div>
            <Label htmlFor="doc-name">{t("documents.name")}</Label>
            <Input id="doc-name" value={name} onChange={e => setName(e.target.value)}
              placeholder={file?.name ?? t("documents.namePlaceholder")} data-testid="input-doc-name" />
          </div>
          <div>
            <Label htmlFor="doc-folder">{t("documents.folderPath")}</Label>
            <Input id="doc-folder" value={folderPath} onChange={e => setFolderPath(e.target.value)}
              placeholder={t("documents.folderPathPlaceholder")} data-testid="input-doc-folder" />
            <p className="text-xs text-muted-foreground mt-1">{t("documents.folderPathHint")}</p>
          </div>
          <div>
            <Label>{t("documents.associateWith")}</Label>
            <Select value={ownerType} onValueChange={(v) => setOwnerType(v as any)}>
              <SelectTrigger data-testid="select-owner-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="account">{t("documents.account")}</SelectItem>
                <SelectItem value="entity">{t("documents.entity")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {ownerType === "account" ? (
            <div>
              <Label>{t("documents.account")}</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger data-testid="select-account"><SelectValue placeholder={t("documents.selectAccount")} /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.firstName} {a.lastName} ({a.email})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label>{t("documents.entity")}</Label>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger data-testid="select-entity"><SelectValue placeholder={t("documents.selectEntity")} /></SelectTrigger>
                <SelectContent>
                  {entities.map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => upload.mutate()} disabled={!canSubmit || upload.isPending}
            data-testid="button-confirm-upload">
            {upload.isPending ? t("documents.uploading") : t("documents.upload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DocumentsPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [selectedPath, setSelectedPath] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: docs = [], isLoading } = useQuery<DocItem[]>({ queryKey: ["/api/documents"] });
  const { data: accounts = [] } = useQuery<AccountLite[]>({
    queryKey: ["/api/accounts"], enabled: isAdmin,
  });
  const { data: entities = [] } = useQuery<EntityLite[]>({
    queryKey: ["/api/entities"], enabled: isAdmin,
  });

  const ownerLabels = useMemo(() => ({
    account: t("documents.account"),
    entity: t("documents.entity"),
    unknown: t("common.unknown"),
  }), [t]);
  const rootLabel = t("documents.allDocuments");

  const tree = useMemo(() => buildTree(docs, ownerLabels), [docs, ownerLabels]);
  const selectedNode = useMemo(() => findNode(tree, selectedPath) ?? tree, [tree, selectedPath]);
  const visibleDocs = useMemo(() => {
    const base = selectedPath ? collectDocsRecursive(selectedNode) : docs;
    if (!searchQuery.trim()) return base;
    const q = normalizeSearch(searchQuery.trim());
    return base.filter(doc =>
      normalizeSearch(doc.name).includes(q) ||
      normalizeSearch(doc.fileName).includes(q) ||
      normalizeSearch(doc.folderPath || "").includes(q) ||
      normalizeSearch(doc.owner?.name || "").includes(q),
    );
  }, [docs, selectedNode, selectedPath, searchQuery]);

  const del = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/documents/${id}`),
    onSuccess: () => {
      toast({ title: t("documents.deleted") });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
    },
    onError: (e: any) => toast({ title: t("documents.deleteFailed"), description: e.message, variant: "destructive" }),
  });

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-7xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
            <Files className="h-6 w-6" /> {t("documents.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isAdmin ? t("documents.subtitleAdmin") : t("documents.subtitleUser")}
          </p>
        </div>
        {isAdmin && <UploadDialog accounts={accounts} entities={entities} />}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder={t("documents.searchPlaceholder")}
          className="pl-9"
          data-testid="input-search-documents"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{t("documents.foldersTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <FolderTree node={tree} depth={0} selectedPath={selectedPath} onSelect={setSelectedPath} rootLabel={rootLabel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {selectedPath || rootLabel} <span className="text-muted-foreground font-normal">({visibleDocs.length})</span>
            </CardTitle>
            <CardDescription>
              {selectedPath ? t("documents.selectedFolder") : t("documents.selectedAll")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
            ) : visibleDocs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-empty-docs">
                {searchQuery.trim() ? t("documents.noSearchResults") : t("documents.noDocuments")}
              </div>
            ) : (
              <div className="divide-y">
                {visibleDocs.map(doc => (
                  <div key={doc.id} className="py-3 flex items-center gap-3" data-testid={`row-document-${doc.id}`}>
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate" data-testid={`text-doc-name-${doc.id}`}>{doc.name}</div>
                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2 mt-0.5">
                        {doc.folderPath && <span>{doc.folderPath}/</span>}
                        <span>{doc.fileName}</span>
                        <span>· {formatBytes(doc.sizeBytes)}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild data-testid={`button-download-${doc.id}`}>
                      <a href={`/api/documents/${doc.id}/download`}>
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                    {isAdmin && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" data-testid={`button-delete-${doc.id}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("documents.deleteTitle")}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("documents.deleteConfirm", { name: doc.name })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => del.mutate(doc.id)} data-testid={`button-confirm-delete-${doc.id}`}>
                              {t("common.delete")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
