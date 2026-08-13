import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useLocalePath } from "@/i18n/hooks";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CountrySelect } from "@/components/country-select";
import { ArrowLeft, Save } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";


export default function CreateAccount() {
  const [, navigate] = useLocation();
  const lp = useLocalePath();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
    birthdate: "",
    taxId: "",
    streetAddress1: "",
    streetAddress2: "",
    country: "",
    city: "",
    stateProvince: "",
    zipPostalCode: "",
    language: "en",
    roles: [] as string[],
  });
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(false);

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/accounts", { ...data, welcome_email: sendWelcomeEmail });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: t("createAccount.successTitle") });
      navigate(lp("accountDetail", { id: data.id }));
    },
    onError: (error: Error) => {
      toast({
        title: t("createAccount.errorTitle"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleRole = (roleName: string) => {
    setFormData((prev) => ({
      ...prev,
      roles: prev.roles.includes(roleName)
        ? prev.roles.filter((r) => r !== roleName)
        : [...prev.roles, roleName],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.firstName || !formData.lastName || !formData.password) {
      toast({
        title: t("createAccount.missingRequiredTitle"),
        description: t("createAccount.missingRequiredDescription"),
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(formData);
  };

  return (
    <div className="p-6 space-y-6">
      <Link href={lp("accounts")}>
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          {t("accountDetail.back")}
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">{t("createAccount.title")}</h1>
        <p className="text-muted-foreground mt-1">
          {t("createAccount.subtitle")}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createAccount.personalInfo")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">{t("common.firstName")} *</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => updateField("firstName", e.target.value)}
                    required
                    data-testid="input-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">{t("common.lastName")} *</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => updateField("lastName", e.target.value)}
                    required
                    data-testid="input-last-name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="birthdate">{t("createAccount.birthdate")}</Label>
                  <Input
                    id="birthdate"
                    type="date"
                    value={formData.birthdate}
                    onChange={(e) => updateField("birthdate", e.target.value)}
                    data-testid="input-birthdate"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">{t("common.language")}</Label>
                  <Select
                    value={formData.language}
                    onValueChange={(val) => updateField("language", val)}
                  >
                    <SelectTrigger id="language" data-testid="select-language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">{t("common.english")}</SelectItem>
                      <SelectItem value="es">{t("common.spanish")}</SelectItem>
                      <SelectItem value="fr">{t("common.french")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">{t("common.email")} *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    required
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("common.phone")}</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    data-testid="input-phone"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="taxId">{t("common.ssnTaxId")}</Label>
                <Input
                  id="taxId"
                  value={formData.taxId}
                  onChange={(e) => updateField("taxId", e.target.value)}
                  data-testid="input-tax-id"
                />
                <p className="text-xs text-muted-foreground">{t("createAccount.taxIdHelper")}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createAccount.loginCredentials")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t("common.password")} *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => updateField("password", e.target.value)}
                  required
                  data-testid="input-password"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createAccount.residentialAddress")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="streetAddress1">{t("createAccount.streetAddress1")}</Label>
                <Input
                  id="streetAddress1"
                  value={formData.streetAddress1}
                  onChange={(e) => updateField("streetAddress1", e.target.value)}
                  data-testid="input-street-1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="streetAddress2">{t("createAccount.streetAddress2Optional")}</Label>
                <Input
                  id="streetAddress2"
                  value={formData.streetAddress2}
                  onChange={(e) => updateField("streetAddress2", e.target.value)}
                  data-testid="input-street-2"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="country">{t("common.country")}</Label>
                  <CountrySelect
                    value={formData.country}
                    onValueChange={(val) => updateField("country", val)}
                    data-testid="select-country"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">{t("common.city")}</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    data-testid="input-city"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stateProvince">{t("common.state")}</Label>
                  <Input
                    id="stateProvince"
                    value={formData.stateProvince}
                    onChange={(e) => updateField("stateProvince", e.target.value)}
                    data-testid="input-state"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zipPostalCode">{t("createAccount.zipPostalCode")}</Label>
                  <Input
                    id="zipPostalCode"
                    value={formData.zipPostalCode}
                    onChange={(e) => updateField("zipPostalCode", e.target.value)}
                    data-testid="input-zip"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createAccount.roles")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                className="flex items-start gap-3 p-4 rounded-md border"
                data-testid="role-admin"
              >
                <Checkbox
                  id="role-admin"
                  checked={formData.roles.includes("admin")}
                  onCheckedChange={() => toggleRole("admin")}
                  data-testid="checkbox-role-admin"
                />
                <div className="space-y-1">
                  <label htmlFor="role-admin" className="text-sm font-medium cursor-pointer">
                    {t("common.admin")}
                  </label>
                  <p className="text-xs text-muted-foreground">{t("createAccount.adminRoleDescription")}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3 justify-end">
            <div className="flex items-center gap-2">
              <Checkbox
                id="send-welcome-email"
                checked={sendWelcomeEmail}
                onCheckedChange={(v) => setSendWelcomeEmail(!!v)}
                data-testid="checkbox-send-welcome-email"
              />
              <div>
                <label htmlFor="send-welcome-email" className="text-sm font-medium cursor-pointer">
                  {t("createAccount.sendWelcomeEmail")}
                </label>
                <p className="text-xs text-muted-foreground">{t("createAccount.sendWelcomeEmailHint")}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="button-submit"
            >
              <Save className="h-4 w-4 mr-2" />
              {createMutation.isPending ? t("common.creating") : t("createAccount.createBtn")}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
