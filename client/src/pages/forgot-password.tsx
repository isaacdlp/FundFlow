import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
import { Trans, useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, Mail, CheckCircle } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLocalePath } from "@/i18n/hooks";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { t } = useTranslation();
  const lp = useLocalePath();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/forgot-password", { email });
      return res.json();
    },
    onSuccess: () => setSent(true),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher variant="outline" />
      </div>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl" data-testid="text-forgot-title">{t("auth.forgotTitle")}</CardTitle>
          <CardDescription>
            {sent ? t("auth.forgotDescriptionSent") : t("auth.forgotDescriptionInitial")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-4">
                <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                <p className="text-sm text-muted-foreground text-center" data-testid="text-reset-sent">
                  <Trans i18nKey="auth.resetSentMessage" values={{ email }} components={[<strong key="0" />]} />
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setSent(false); setEmail(""); mutation.reset(); }}
                  data-testid="button-try-another"
                >
                  {t("auth.tryAnotherEmail")}
                </Button>
                <Link href={lp("dashboard")}>
                  <Button variant="ghost" className="w-full" data-testid="button-back-login">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    {t("auth.backToSignIn")}
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mutation.isError && (
                <Alert variant="destructive" data-testid="alert-error">
                  <AlertDescription>{t("auth.somethingWentWrong")}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">{t("auth.emailAddress")}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  required
                  autoFocus
                  data-testid="input-email"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={mutation.isPending}
                data-testid="button-send-reset"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("auth.sending")}
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 mr-2" />
                    {t("auth.sendResetLink")}
                  </>
                )}
              </Button>
              <Link href={lp("dashboard")}>
                <Button variant="ghost" className="w-full" data-testid="button-back-login">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("auth.backToSignIn")}
                </Button>
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
