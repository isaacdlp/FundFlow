import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { useLocale } from "@/i18n/hooks";
import { ROUTE_PATTERNS } from "@/i18n/routes";
import type { OrganizationPublic } from "@shared/types";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Building2, Globe, MapPin, CheckCircle2, Clock } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

type FlowMode = "choose" | "signup" | "signin" | "success";

export default function OrgLanding() {
  const locale = useLocale();
  const { t } = useTranslation();
  const [, params] = useRoute(ROUTE_PATTERNS.orgLanding[locale]);
  const slug = params?.slug;
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const inviteToken = searchParams.get("invite");
  const { toast } = useToast();

  const [mode, setMode] = useState<FlowMode>("choose");
  const [successMessage, setSuccessMessage] = useState("");
  const [successStatus, setSuccessStatus] = useState<"approved" | "pending">("pending");

  const [signupForm, setSignupForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [signinForm, setSigninForm] = useState({ email: "", password: "" });

  const { data: org, isLoading: orgLoading } = useQuery<OrganizationPublic>({
    queryKey: ["/api/organizations/by-slug", slug],
    enabled: !!slug,
  });

  const { data: inviteData, isLoading: inviteLoading, error: inviteError } = useQuery<{ invite: { id: number; token: string; organizationId: number }; organization: OrganizationPublic }>({
    queryKey: ["/api/invites", inviteToken],
    enabled: !!inviteToken,
    retry: false,
  });

  const inviteValid = !!inviteToken && !!inviteData && !inviteError;
  const organization = org || inviteData?.organization;
  const isLoading = orgLoading || (!!inviteToken && inviteLoading);

  const signupRequestMutation = useMutation({
    mutationFn: async () => {
      if (inviteValid) {
        const res = await apiRequest("POST", `/api/invites/${inviteToken}/accept`, signupForm);
        return res.json();
      }
      const createRes = await apiRequest("POST", "/api/accounts", {
        ...signupForm,
        profileComplete: false,
      });
      const account = await createRes.json();
      const orgData = organization!;
      const reqRes = await apiRequest("POST", `/api/organizations/${orgData.id}/members/request`, { accountId: account.id });
      return reqRes.json();
    },
    onSuccess: () => {
      setSuccessStatus(inviteValid ? "approved" : "pending");
      setSuccessMessage(
        inviteValid
          ? t("landing.successInviteApproved")
          : t("landing.successPendingNew")
      );
      setMode("success");
    },
    onError: (error: Error) => {
      const msg = error.message || "";
      if (msg.includes("409") || msg.includes("already exists")) {
        toast({ title: t("landing.errorAccountExistsTitle"), description: t("landing.errorAccountExistsDescription"), variant: "destructive" });
        setMode("signin");
        setSigninForm({ email: signupForm.email, password: "" });
        return;
      }
      toast({ title: t("landing.errorTitle"), description: error.message, variant: "destructive" });
    },
  });

  const signinRequestMutation = useMutation({
    mutationFn: async () => {
      const loginRes = await apiRequest("POST", "/api/auth/login", signinForm);
      const account = await loginRes.json();

      if (inviteValid) {
        const res = await apiRequest("POST", `/api/invites/${inviteToken}/accept`, { accountId: account.id });
        return res.json();
      }
      const orgData = organization!;
      const reqRes = await apiRequest("POST", `/api/organizations/${orgData.id}/members/request`, { accountId: account.id });
      return reqRes.json();
    },
    onSuccess: () => {
      setSuccessStatus(inviteValid ? "approved" : "pending");
      setSuccessMessage(
        inviteValid
          ? t("landing.successInviteApprovedExisting")
          : t("landing.successPendingExisting")
      );
      setMode("success");
    },
    onError: (error: Error) => {
      toast({ title: t("landing.errorTitle"), description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="text-center py-12">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">{t("landing.notFoundTitle")}</h2>
            <p className="text-muted-foreground">
              {t("landing.notFoundDescription")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                <Building2 className="h-7 w-7" />
              </div>
              <div>
                <h1 className="text-xl font-semibold" data-testid="text-landing-org-name">{organization.name}</h1>
                {organization.description && (
                  <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-landing-org-description">{organization.description}</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              {organization.website && (
                <div className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  <a href={organization.website} target="_blank" rel="noopener noreferrer" className="hover:underline" data-testid="link-org-website">
                    {organization.website}
                  </a>
                </div>
              )}
              {(organization.city || organization.country) && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  <span data-testid="text-landing-org-location">{[organization.city, organization.country].filter(Boolean).join(", ")}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {inviteValid && (
          <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-green-700 dark:text-green-300 font-medium" data-testid="text-invite-notice">
                {t("landing.inviteNotice")}
              </p>
            </CardContent>
          </Card>
        )}

        {inviteToken && !inviteValid && !inviteLoading && (
          <Card className="border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-red-700 dark:text-red-300 font-medium" data-testid="text-invite-invalid">
                {t("landing.inviteInvalid")}
              </p>
            </CardContent>
          </Card>
        )}

        {mode === "success" && (
          <Card>
            <CardContent className="text-center py-10">
              {successStatus === "approved" ? (
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
              ) : (
                <Clock className="h-12 w-12 mx-auto text-yellow-500 mb-4" />
              )}
              <h2 className="text-lg font-semibold mb-2" data-testid="text-success-title">
                {successStatus === "approved" ? t("landing.successAccessGranted") : t("landing.successRequestSubmitted")}
              </h2>
              <p className="text-muted-foreground" data-testid="text-success-message">{successMessage}</p>
            </CardContent>
          </Card>
        )}

        {mode === "choose" && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-center">
                {inviteValid ? t("landing.acceptInvitation") : t("landing.requestAccess")}
              </h2>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" size="lg" onClick={() => setMode("signup")} data-testid="button-new-user">
                {t("landing.newUser")}
              </Button>
              <Button className="w-full" variant="outline" size="lg" onClick={() => setMode("signin")} data-testid="button-existing-user">
                {t("landing.existingUser")}
              </Button>
            </CardContent>
          </Card>
        )}

        {mode === "signup" && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("landing.createAccountTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {inviteValid ? t("landing.createAccountInvite") : t("landing.createAccountRequest")}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-firstName">{t("landing.firstNameRequired")}</Label>
                  <Input
                    id="signup-firstName"
                    value={signupForm.firstName}
                    onChange={e => setSignupForm(f => ({ ...f, firstName: e.target.value }))}
                    data-testid="input-signup-firstname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-lastName">{t("landing.lastNameRequired")}</Label>
                  <Input
                    id="signup-lastName"
                    value={signupForm.lastName}
                    onChange={e => setSignupForm(f => ({ ...f, lastName: e.target.value }))}
                    data-testid="input-signup-lastname"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">{t("landing.emailRequired")}</Label>
                <Input
                  id="signup-email"
                  type="email"
                  value={signupForm.email}
                  onChange={e => setSignupForm(f => ({ ...f, email: e.target.value }))}
                  data-testid="input-signup-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">{t("landing.passwordRequired")}</Label>
                <Input
                  id="signup-password"
                  type="password"
                  value={signupForm.password}
                  onChange={e => setSignupForm(f => ({ ...f, password: e.target.value }))}
                  data-testid="input-signup-password"
                />
              </div>

              <Separator />

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setMode("choose")} data-testid="button-signup-back">
                  {t("common.back")}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => signupRequestMutation.mutate()}
                  disabled={signupRequestMutation.isPending || !signupForm.firstName || !signupForm.lastName || !signupForm.email || !signupForm.password}
                  data-testid="button-signup-submit"
                >
                  {signupRequestMutation.isPending ? t("landing.submitting") : (inviteValid ? t("landing.acceptAndJoin") : t("landing.createAndRequest"))}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {mode === "signin" && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{t("landing.signInTitle")}</h2>
              <p className="text-sm text-muted-foreground">
                {inviteValid ? t("landing.signInInvite") : t("landing.signInRequest")}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">{t("common.email")}</Label>
                <Input
                  id="signin-email"
                  type="email"
                  value={signinForm.email}
                  onChange={e => setSigninForm(f => ({ ...f, email: e.target.value }))}
                  data-testid="input-signin-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">{t("common.password")}</Label>
                <Input
                  id="signin-password"
                  type="password"
                  value={signinForm.password}
                  onChange={e => setSigninForm(f => ({ ...f, password: e.target.value }))}
                  data-testid="input-signin-password"
                />
              </div>

              <Separator />

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1" onClick={() => setMode("choose")} data-testid="button-signin-back">
                  {t("common.back")}
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => signinRequestMutation.mutate()}
                  disabled={signinRequestMutation.isPending || !signinForm.email || !signinForm.password}
                  data-testid="button-signin-submit"
                >
                  {signinRequestMutation.isPending ? t("auth.signingIn") : (inviteValid ? t("landing.signInAndJoin") : t("landing.signInAndRequest"))}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
