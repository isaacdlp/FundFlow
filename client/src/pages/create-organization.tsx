import { useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useLocalePath } from "@/i18n/hooks";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Save } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function CreateOrganization() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const lp = useLocalePath();
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    website: "",
    country: "",
    city: "",
    stateProvince: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/organizations", data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      toast({ title: t("createOrganization.successTitle") });
      navigate(lp("organizationDetail", { id: data.id }));
    },
    onError: (error: Error) => {
      toast({
        title: t("createOrganization.errorTitle"),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateField = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast({
        title: t("createOrganization.missingFieldsTitle"),
        description: t("createOrganization.nameRequiredMessage"),
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(formData);
  };

  return (
    <div className="p-6 space-y-6">
      <Link href={lp("organizations")}>
        <Button variant="ghost" className="gap-2 -ml-2" data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
          {t("organizationDetail.back")}
        </Button>
      </Link>

      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">{t("createOrganization.title")}</h1>
        <p className="text-muted-foreground mt-1">
          {t("createOrganization.subtitle")}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createOrganization.detailsSection")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{t("createOrganization.nameLabel")}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  required
                  data-testid="input-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">{t("common.description")}</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  data-testid="input-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website">{t("common.website")}</Label>
                <Input
                  id="website"
                  value={formData.website}
                  onChange={(e) => updateField("website", e.target.value)}
                  placeholder={t("createOrganization.websitePlaceholder")}
                  data-testid="input-website"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("createOrganization.locationSection")}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">{t("common.city")}</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => updateField("city", e.target.value)}
                    data-testid="input-city"
                  />
                </div>
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
                  <Label htmlFor="country">{t("common.country")}</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) => updateField("country", e.target.value)}
                    data-testid="input-country"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="button-submit"
            >
              <Save className="h-4 w-4 mr-2" />
              {createMutation.isPending ? t("common.creating") : t("createOrganization.createBtn")}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
