import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link, useLocation } from "wouter";
import { Trans, useTranslation } from "react-i18next";
import { useLocalePath, useLocale } from "@/i18n/hooks";
import { ROUTE_PATTERNS } from "@/i18n/routes";
import type { AccountWithRoles } from "@shared/types";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Pencil, Save, X, Loader2, Mail, KeyRound, Trash2, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const COUNTRIES = [
  "United States", "United Kingdom", "Spain", "Germany", "France",
  "Italy", "Canada", "Australia", "Japan", "South Korea",
  "Brazil", "Mexico", "India", "China", "Singapore",
  "Switzerland", "Netherlands", "Sweden", "Ireland", "Portugal",
];

export default function AccountDetail() {
  const locale = useLocale();
  const lp = useLocalePath();
  const { t } = useTranslation();
  const ACCOUNT_TABS = [
    { value: "personal", label: t("accountDetail.personalInfo") },
    { value: "login", label: t("accountDetail.loginInfo") },
    { value: "permissions", label: t("accountDetail.permissions") },
  ];
  const [, params] = useRoute(ROUTE_PATTERNS.accountDetail[locale]);
  const accountId = params?.id;
  const { toast } = useToast();
  const { user, isAdmin, isImpersonating, showAsMutation } = useAuth();
  const [, navigate] = useLocation();
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("personal");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const isOwnAccount = user && accountId && String(user.id) === String(accountId);

  const { data: account, isLoading } = useQuery<AccountWithRoles>({
    queryKey: ["/api/accounts", accountId],
    enabled: !!accountId,
  });

  const [formData, setFormData] = useState<Record<string, string | string[]>>({});

  useEffect(() => {
    if (account) {
      setFormData({
        firstName: account.firstName || "",
        lastName: account.lastName || "",
        email: account.email || "",
        phone: account.phone || "",
        birthdate: account.birthdate || "",
        taxId: account.taxId || "",
        streetAddress1: account.streetAddress1 || "",
        streetAddress2: account.streetAddress2 || "",
        country: account.country || "",
        city: account.city || "",
        stateProvince: account.stateProvince || "",
        zipPostalCode: account.zipPostalCode || "",
        roles: account.roles.map((r) => r.name),
      });
    }
  }, [account]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/accounts/${accountId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", accountId] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setEditing(false);
      toast({ title: t("accountDetail.profileUpdated") });
    },
    onError: (error: Error) => {
      toast({ title: t("accountDetail.profileUpdateFailed"), description: error.message, variant: "destructive" });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/accounts/${accountId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: t("accounts.deleted") });
      navigate(lp("accounts"));
    },
    onError: (error: Error) => {
      toast({ title: t("accounts.deleteFailed"), description: error.message, variant: "destructive" });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/auth/change-password", data);
      return res.json();
    },
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: t("auth.passwordChanged") });
    },
    onError: (error: Error) => {
      let desc = error.message;
      try { desc = JSON.parse(desc.replace(/^\d+:\s*/, "")).message; } catch {}
      toast({ title: t("accountDetail.passwordChangeFailed"), description: desc, variant: "destructive" });
    },
  });

  const sendResetMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest("POST", "/api/auth/forgot-password", { email });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("accountDetail.passwordResetEmailSent"), description: t("accountDetail.passwordResetEmailSentDesc") });
    },
    onError: (error: Error) => {
      toast({ title: t("accountDetail.sendResetFailed"), description: error.message, variant: "destructive" });
    },
  });

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast({ title: t("auth.passwordsDoNotMatch"), variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: t("auth.passwordTooShort"), variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleCancel = () => {
    if (account) {
      setFormData({
        firstName: account.firstName || "",
        lastName: account.lastName || "",
        email: account.email || "",
        phone: account.phone || "",
        birthdate: account.birthdate || "",
        taxId: account.taxId || "",
        streetAddress1: account.streetAddress1 || "",
        streetAddress2: account.streetAddress2 || "",
        country: account.country || "",
        city: account.city || "",
        stateProvince: account.stateProvince || "",
        zipPostalCode: account.zipPostalCode || "",
        roles: account.roles.map((r) => r.name),
      });
    }
    setEditing(false);
  };

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleRole = (roleName: string) => {
    setFormData((prev) => {
      const currentRoles = (prev.roles as string[]) || [];
      const newRoles = currentRoles.includes(roleName)
        ? currentRoles.filter((r) => r !== roleName)
        : [...currentRoles, roleName];
      return { ...prev, roles: newRoles };
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">{t("accountDetail.notFound")}</p>
      </div>
    );
  }

  const initials = `${account.firstName[0]}${account.lastName[0]}`;

  return (
    <div className="p-6 space-y-6">
      <Link href={lp("accounts")}>
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          {t("accountDetail.back", "Back to accounts")}
        </Button>
      </Link>

      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xl font-semibold flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold" data-testid="text-account-name">
            {account.firstName} {account.lastName}
          </h1>
          <p className="text-muted-foreground" data-testid="text-account-email">{account.email}</p>
          <div className="flex gap-2 mt-1 flex-wrap">
            {account.roles.map((role) => (
              <Badge
                key={role.id}
                variant={role.name === "admin" ? "destructive" : "secondary"}
              >
                {role.name.toUpperCase()}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && !isOwnAccount && !isImpersonating && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => showAsMutation.mutate(account.id)}
              disabled={showAsMutation.isPending}
              data-testid="button-show-as"
            >
              <Eye className="h-4 w-4" />
              {t("impersonation.showAs")}
            </Button>
          )}
          {isAdmin && !isOwnAccount && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-destructive hover:text-destructive" data-testid="button-delete-account">
                  <Trash2 className="h-4 w-4" />
                  {t("accounts.deleteTitle")}
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
                    onClick={() => deleteAccountMutation.mutate()}
                    data-testid="button-confirm-delete-account"
                  >
                    {t("common.delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {ACCOUNT_TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} data-testid={`tab-${tab.value}`}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="personal" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
              <h2 className="text-lg font-semibold">{t("accountDetail.personalInfo")}</h2>
              {!editing ? (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="button-edit">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  {t("common.edit")}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCancel} data-testid="button-cancel">
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    data-testid="button-save"
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {updateMutation.isPending ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("common.firstName")} *</Label>
                  <Input
                    id="firstName"
                    value={(formData.firstName as string) || ""}
                    onChange={(e) => updateField("firstName", e.target.value)}
                    disabled={!editing}
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("common.lastName")} *</Label>
                  <Input
                    id="lastName"
                    value={(formData.lastName as string) || ""}
                    onChange={(e) => updateField("lastName", e.target.value)}
                    disabled={!editing}
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthdate">{t("createAccount.birthdate")}</Label>
                <Input
                  id="birthdate"
                  type="date"
                  value={(formData.birthdate as string) || ""}
                  onChange={(e) => updateField("birthdate", e.target.value)}
                  disabled={!editing}
                  data-testid="input-birthdate"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("common.email")} *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={(formData.email as string) || ""}
                    onChange={(e) => updateField("email", e.target.value)}
                    disabled={!editing}
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("common.phone")}</Label>
                  <Input
                    id="phone"
                    value={(formData.phone as string) || ""}
                    onChange={(e) => updateField("phone", e.target.value)}
                    disabled={!editing}
                    data-testid="input-phone"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="taxId">{t("common.ssnTaxId")}</Label>
                <Input
                  id="taxId"
                  value={(formData.taxId as string) || ""}
                  onChange={(e) => updateField("taxId", e.target.value)}
                  disabled={!editing}
                  data-testid="input-tax-id"
                />
                <p className="text-xs text-muted-foreground">{t("createAccount.taxIdHelper")}</p>
              </div>

              <Separator />

              <h3 className="text-base font-semibold">{t("createAccount.residentialAddress")}</h3>

              <div className="space-y-2">
                <Label htmlFor="streetAddress1">{t("createAccount.streetAddress1")} *</Label>
                <Input
                  id="streetAddress1"
                  value={(formData.streetAddress1 as string) || ""}
                  onChange={(e) => updateField("streetAddress1", e.target.value)}
                  disabled={!editing}
                  data-testid="input-street-1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="streetAddress2">{t("createAccount.streetAddress2Optional")}</Label>
                <Input
                  id="streetAddress2"
                  value={(formData.streetAddress2 as string) || ""}
                  onChange={(e) => updateField("streetAddress2", e.target.value)}
                  disabled={!editing}
                  data-testid="input-street-2"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="country">{t("common.country")} *</Label>
                  {editing ? (
                    <Select
                      value={(formData.country as string) || ""}
                      onValueChange={(val) => updateField("country", val)}
                    >
                      <SelectTrigger data-testid="select-country">
                        <SelectValue placeholder={t("common.selectCountry")} />
                      </SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={(formData.country as string) || ""}
                      disabled
                      data-testid="input-country"
                    />
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">{t("common.city")} *</Label>
                  <Input
                    id="city"
                    value={(formData.city as string) || ""}
                    onChange={(e) => updateField("city", e.target.value)}
                    disabled={!editing}
                    data-testid="input-city"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stateProvince">{t("common.state")} *</Label>
                  <Input
                    id="stateProvince"
                    value={(formData.stateProvince as string) || ""}
                    onChange={(e) => updateField("stateProvince", e.target.value)}
                    disabled={!editing}
                    data-testid="input-state"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipPostalCode">{t("createAccount.zipPostalCode")} *</Label>
                  <Input
                    id="zipPostalCode"
                    value={(formData.zipPostalCode as string) || ""}
                    onChange={(e) => updateField("zipPostalCode", e.target.value)}
                    disabled={!editing}
                    data-testid="input-zip"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="login" className="mt-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("accountDetail.loginInfo")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("auth.emailAddress")}</Label>
                <Input value={account.email} disabled data-testid="input-login-email" />
              </div>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-base font-medium">{t("common.password")}</Label>
                </div>
                {isOwnAccount ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="currentPassword">{t("common.currentPassword")}</Label>
                      <Input
                        id="currentPassword"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder={t("accountDetail.enterCurrentPassword")}
                        data-testid="input-current-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="newPassword">{t("common.newPassword")}</Label>
                      <Input
                        id="newPassword"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t("accountDetail.enterNewPassword")}
                        data-testid="input-new-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword">{t("common.confirmPassword")}</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t("accountDetail.confirmNewPasswordPlaceholder")}
                        data-testid="input-confirm-password"
                      />
                    </div>
                    <Button
                      onClick={handleChangePassword}
                      disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || !confirmPassword}
                      data-testid="button-change-password"
                    >
                      {changePasswordMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t("auth.changingPassword")}
                        </>
                      ) : (
                        t("auth.changePassword")
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t("accountDetail.sendResetDescription")}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => account && sendResetMutation.mutate(account.email)}
                      disabled={sendResetMutation.isPending}
                      data-testid="button-send-reset-email"
                    >
                      {sendResetMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t("auth.sending")}
                        </>
                      ) : (
                        <>
                          <Mail className="h-4 w-4 mr-2" />
                          {t("accountDetail.sendResetEmail")}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t("accountDetail.accountCreated")}</Label>
                <Input
                  value={new Date(account.createdAt).toLocaleDateString(locale, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  disabled
                  data-testid="input-created-at"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="permissions" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
              <h2 className="text-lg font-semibold">{t("accountDetail.rolesTitle")}</h2>
              {!editing ? (
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="button-edit-roles">
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  {t("common.edit")}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={handleCancel} data-testid="button-cancel-roles">
                    <X className="h-3.5 w-3.5 mr-1.5" />
                    {t("common.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    data-testid="button-save-roles"
                  >
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                    {updateMutation.isPending ? t("common.saving") : t("common.save")}
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="flex items-start gap-3 p-4 rounded-md border"
                data-testid="role-admin"
              >
                <Checkbox
                  id="role-admin"
                  checked={((formData.roles as string[]) || []).includes("admin")}
                  onCheckedChange={() => editing && toggleRole("admin")}
                  disabled={!editing}
                  data-testid="checkbox-role-admin"
                />
                <div className="space-y-1">
                  <label
                    htmlFor="role-admin"
                    className="text-sm font-medium cursor-pointer"
                  >
                    {t("common.admin")}
                  </label>
                  <p className="text-xs text-muted-foreground">{t("createAccount.adminRoleDescription")}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
