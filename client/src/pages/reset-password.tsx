import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, KeyRound, CheckCircle } from "lucide-react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useLocalePath } from "@/i18n/hooks";

export default function ResetPassword() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const { t } = useTranslation();
  const lp = useLocalePath();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/reset-password", { token, password });
      return res.json();
    },
    onSuccess: () => setSuccess(true),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return;
    if (password.length < 6) return;
    mutation.mutate();
  };

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher variant="outline" />
      </div>
      <Card className="w-full max-w-md">{children}</Card>
    </div>
  );

  if (!token) {
    return (
      <Wrapper>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("auth.invalidLink")}</CardTitle>
          <CardDescription>{t("auth.invalidLinkDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={lp("dashboard")}>
            <Button className="w-full" data-testid="button-back-login">{t("auth.backToSignIn")}</Button>
          </Link>
        </CardContent>
      </Wrapper>
    );
  }

  if (success) {
    return (
      <Wrapper>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("auth.passwordReset")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-4">
            <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
            <p className="text-sm text-muted-foreground text-center mb-4" data-testid="text-reset-success">
              {t("auth.resetSuccessMessage")}
            </p>
            <Link href={lp("dashboard")}>
              <Button className="w-full" data-testid="button-go-login">{t("auth.signIn")}</Button>
            </Link>
          </div>
        </CardContent>
      </Wrapper>
    );
  }

  const passwordMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const passwordTooShort = password.length > 0 && password.length < 6;

  return (
    <Wrapper>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl" data-testid="text-reset-title">{t("auth.resetTitle")}</CardTitle>
        <CardDescription>{t("auth.resetDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mutation.isError && (
            <Alert variant="destructive" data-testid="alert-error">
              <AlertDescription>
                {mutation.error?.message?.includes("expired")
                  ? t("auth.linkExpired")
                  : mutation.error?.message?.includes("already been used")
                  ? t("auth.linkAlreadyUsed")
                  : t("auth.resetFailed")}
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">{t("common.newPassword")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t("auth.passwordMinChars")}
              required
              minLength={6}
              autoFocus
              data-testid="input-password"
            />
            {passwordTooShort && <p className="text-xs text-destructive">{t("auth.passwordTooShort")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">{t("common.confirmPassword")}</Label>
            <Input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder={t("auth.reEnterPassword")}
              required
              data-testid="input-confirm-password"
            />
            {passwordMismatch && <p className="text-xs text-destructive">{t("auth.passwordsDoNotMatch")}</p>}
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={mutation.isPending || passwordMismatch || passwordTooShort || !password}
            data-testid="button-reset"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("auth.resetting")}
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4 mr-2" />
                {t("auth.resetPassword")}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Wrapper>
  );
}
