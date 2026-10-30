import { useEffect, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ExternalLink, FileText, Pencil, Save, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { CountrySelect } from "@/components/country-select";

/** An account's or an entity's: the two tabs edit the same fields on both. */
export type ProfileKind = "account" | "entity";

type Values = Record<string, string>;

function useProfileForm(kind: ProfileKind, profile: Record<string, any>, fields: readonly string[], onSaved: () => void) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const toForm = () => Object.fromEntries(fields.map(f => [f, profile[f] == null ? "" : String(profile[f])]));
  const [values, setValues] = useState<Values>(toForm);
  const [editing, setEditing] = useState(false);
  const path = kind === "account" ? "accounts" : "entities";

  useEffect(() => { setValues(toForm()); }, [profile]);

  const save = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("PATCH", `/api/${path}/${profile.id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/${path}`, String(profile.id)] });
      setEditing(false);
      onSaved();
      toast({ title: t("profile.saved") });
    },
    onError: (error: Error) => {
      toast({ title: t("profile.saveFailed"), description: error.message, variant: "destructive" });
    },
  });

  return { values, setValues, editing, setEditing, save, reset: () => { setValues(toForm()); setEditing(false); } };
}

function EditButtons({ form, canEdit, onSave, testId }: {
  form: ReturnType<typeof useProfileForm>; canEdit: boolean; onSave: () => void; testId: string;
}) {
  const { t } = useTranslation();
  if (!canEdit) return null;
  if (!form.editing) {
    return (
      <Button variant="outline" size="sm" onClick={() => form.setEditing(true)} data-testid={`button-edit-${testId}`}>
        <Pencil className="h-3.5 w-3.5 mr-1.5" />
        {t("common.edit")}
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      <Button variant="ghost" size="sm" onClick={form.reset} data-testid={`button-cancel-${testId}`}>
        <X className="h-3.5 w-3.5 mr-1.5" />
        {t("common.cancel")}
      </Button>
      <Button size="sm" onClick={onSave} disabled={form.save.isPending} data-testid={`button-save-${testId}`}>
        <Save className="h-3.5 w-3.5 mr-1.5" />
        {form.save.isPending ? t("common.saving") : t("common.save")}
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function OpenLink({ href, children, testId }: { href: string; children: ReactNode; testId: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all" data-testid={testId}>
      <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
      {children}
    </a>
  );
}

const CREDENTIAL_FIELDS = [
  "accreditation", "qualification", "taxCountry", "idExpiration",
  "taxFormStatus", "taxFormDocumentId", "taxFormUrl", "kycUrl", "notes",
] as const;

/** Everything here is changed by admins only; KYC, the Concord link and notes are also only shown to them. */
export function CredentialsTab({ kind, profile, isAdmin }: { kind: ProfileKind; profile: Record<string, any>; isAdmin: boolean }) {
  const { t } = useTranslation();
  const fields = kind === "account" ? CREDENTIAL_FIELDS : CREDENTIAL_FIELDS.filter(f => f !== "notes");
  const form = useProfileForm(kind, profile, fields, () => {});
  const { values, editing } = form;
  const set = (field: string) => (value: string) => form.setValues(prev => ({ ...prev, [field]: value }));
  const input = (field: string, testId: string) => (
    <Input value={values[field] ?? ""} onChange={e => set(field)(e.target.value)} disabled={!editing} data-testid={testId} />
  );

  const handleSave = () => {
    const documentId = values.taxFormDocumentId.trim();
    form.save.mutate({
      ...values,
      idExpiration: values.idExpiration || null,
      taxFormDocumentId: documentId ? parseInt(documentId, 10) : null,
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
        <h2 className="text-lg font-semibold">{t("profile.credentials")}</h2>
        <EditButtons form={form} canEdit={isAdmin} onSave={handleSave} testId="credentials" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={t("profile.accreditation")}>{input("accreditation", "input-accreditation")}</Field>
          <Field label={t("profile.qualification")}>{input("qualification", "input-qualification")}</Field>
          <Field label={t("profile.taxCountry")}>
            <CountrySelect value={values.taxCountry ?? ""} onValueChange={set("taxCountry")} disabled={!editing} data-testid="input-tax-country" />
          </Field>
          <Field label={t("profile.idExpiration")}>
            <Input type="date" value={values.idExpiration ?? ""} onChange={e => set("idExpiration")(e.target.value)} disabled={!editing} data-testid="input-id-expiration" />
          </Field>
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="font-medium">{t("profile.taxForm")}</h3>
          <div className="flex flex-wrap items-center gap-4">
            {profile.taxFormDocumentId ? (
              <a href={`/api/documents/${profile.taxFormDocumentId}/download`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline" data-testid="link-tax-form-document">
                <FileText className="h-3.5 w-3.5" />
                {t("profile.signedTaxForm")}
              </a>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-no-tax-form">{t("profile.noSignedTaxForm")}</p>
            )}
            {isAdmin && profile.taxFormUrl && !editing && (
              <OpenLink href={profile.taxFormUrl} testId="link-tax-form-concord">{t("profile.openInConcord")}</OpenLink>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label={t("profile.taxFormStatus")}>{input("taxFormStatus", "input-tax-form-status")}</Field>
            {isAdmin && <Field label={t("profile.taxFormDocumentId")}>{input("taxFormDocumentId", "input-tax-form-document")}</Field>}
          </div>
          {isAdmin && <Field label={t("profile.taxFormUrl")}>{input("taxFormUrl", "input-tax-form-url")}</Field>}
        </div>

        {isAdmin && (
          <div className="space-y-3 pt-2" data-testid="section-admin-credentials">
            <h3 className="font-medium">{t("profile.adminOnly")}</h3>
            <Field label={t("profile.kycUrl")}>
              {editing || !profile.kycUrl || !/^https?:\/\//i.test(profile.kycUrl)
                ? input("kycUrl", "input-kyc-url")
                : <div><OpenLink href={profile.kycUrl} testId="link-kyc">{t("profile.openKyc")}</OpenLink></div>}
            </Field>
            {kind === "account" && (
              <Field label={t("profile.notes")}>
                <Textarea value={values.notes ?? ""} onChange={e => set("notes")(e.target.value)} disabled={!editing} data-testid="input-notes" />
              </Field>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const BANK_FIELDS = [
  "bankName", "bankCountry", "bankCurrency", "bankAddress", "bankRoutingNumber", "bankSwiftCode",
  "bankAccountNumber", "bankAccountName", "xeStatus",
] as const;
const ENTITY_BANK_FIELDS = [...BANK_FIELDS, "disbursementMethod", "forFurtherCreditTo"] as const;

export function BanksTab({ kind, profile, canEdit, isAdmin }: {
  kind: ProfileKind; profile: Record<string, any>; canEdit: boolean; isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const form = useProfileForm(kind, profile, kind === "entity" ? ENTITY_BANK_FIELDS : BANK_FIELDS, () => {});
  const { values, editing } = form;
  const set = (field: string) => (value: string) => form.setValues(prev => ({ ...prev, [field]: value }));
  const input = (field: string, testId: string, disabled = !editing) => (
    <Input value={values[field] ?? ""} onChange={e => set(field)(e.target.value)} disabled={disabled} data-testid={testId} />
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
        <h2 className="text-lg font-semibold">{t("profile.banks")}</h2>
        <EditButtons form={form} canEdit={canEdit} onSave={() => form.save.mutate(values)} testId="banks" />
      </CardHeader>
      <CardContent className="space-y-4">
        {kind === "entity" && (
          <Field label={t("entityDetail.disbursementMethod")}>
            <RadioGroup value={values.disbursementMethod || "wire_transfer"} onValueChange={set("disbursementMethod")} className="flex gap-4" disabled={!editing}>
              {([["wire_transfer", "wireTransfer"], ["check", "check"], ["other", "other"]] as const).map(([value, label]) => (
                <div key={value} className="flex items-center space-x-2">
                  <RadioGroupItem value={value} id={`bank-${value}`} disabled={!editing} />
                  <Label htmlFor={`bank-${value}`} className="font-normal">{t(`createEntity.${label}`)}</Label>
                </div>
              ))}
            </RadioGroup>
          </Field>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={t("createEntity.bankName")}>{input("bankName", "input-bank-name")}</Field>
          <Field label={t("profile.bankCountry")}>
            <CountrySelect value={values.bankCountry ?? ""} onValueChange={set("bankCountry")} disabled={!editing} data-testid="input-bank-country" />
          </Field>
        </div>
        <Field label={t("profile.bankCurrency")}>{input("bankCurrency", "input-bank-currency")}</Field>
        <Field label={t("createEntity.bankAddress")}>
          <Textarea value={values.bankAddress ?? ""} onChange={e => set("bankAddress")(e.target.value)} disabled={!editing} data-testid="input-bank-address" />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={t("createEntity.bankRoutingNumber")}>{input("bankRoutingNumber", "input-routing")}</Field>
          <Field label={t("createEntity.bankSwiftCode")}>{input("bankSwiftCode", "input-swift")}</Field>
        </div>
        <Field label={t("createEntity.bankAccountNumber")}>{input("bankAccountNumber", "input-account-number")}</Field>
        <Field label={t("createEntity.bankAccountName")}>{input("bankAccountName", "input-account-name")}</Field>
        {kind === "entity" && (
          <Field label={t("createEntity.forFurtherCreditTo")}>{input("forFurtherCreditTo", "input-ffc")}</Field>
        )}
        <Field label={t("profile.xeStatus")}>{input("xeStatus", "input-xe-status", !editing || !isAdmin)}</Field>
      </CardContent>
    </Card>
  );
}
