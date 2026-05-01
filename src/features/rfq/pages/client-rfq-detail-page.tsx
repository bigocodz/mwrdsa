import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, CalendarDays, Copy, Loader2, Paperclip, Send, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PortalShell } from "@/components/portal-shell";
import { DashboardCard, DataTable, StatusBadge } from "@/components/portal-ui";
import { Button } from "@/components/ui/button";
import { localize } from "@/features/rfq/data/client-workflow-data";
import { useClientNav } from "@/features/rfq/hooks/use-client-nav";
import { useRfqCart } from "@/features/rfq/hooks/use-rfq-cart";
import { useAuth } from "@/lib/auth";
import { isBetterAuthConfigured } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type Tone = "info" | "neutral" | "danger" | "warning";

function statusTone(status: string): Tone {
  if (status === "draft") return "neutral";
  if (status === "expired" || status === "cancelled") return "danger";
  return "info";
}

function attachmentTone(status: string): Tone {
  if (status === "approved") return "info";
  if (status === "rejected") return "danger";
  return "warning";
}

function attachmentLabel(status: string, language: string) {
  if (status === "approved") return localize({ en: "Approved", ar: "تمت المراجعة" }, language);
  if (status === "rejected") return localize({ en: "Rejected", ar: "مرفوض" }, language);
  return localize({ en: "Pending review", ar: "بانتظار المراجعة" }, language);
}

function localizePair(ar: string | undefined | null, en: string | undefined | null, language: string) {
  return language === "ar" ? ar || en || "" : en || ar || "";
}

function formatDateTime(timestamp: number, language: string) {
  return new Intl.DateTimeFormat(language === "ar" ? "ar-SA" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

export function ClientRfqDetailPage() {
  const { rfqId } = useParams<{ rfqId: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation(["common", "rfq"]);
  const navItems = useClientNav();
  const { user } = useAuth();
  const language = i18n.language;
  const queryArgs = isBetterAuthConfigured && user && rfqId ? { actorUserId: user.id as Id<"users">, rfqId: rfqId as Id<"rfqs"> } : "skip";
  const detail = useQuery(api.rfqs.getRfqDetailForActor, queryArgs);
  const submitRfq = useMutation(api.rfqs.submitRfq);
  const generateUploadUrl = useMutation(api.rfqs.generateAttachmentUploadUrl);
  const attachRfqFile = useMutation(api.rfqs.attachRfqFile);
  const removeAttachment = useMutation(api.rfqs.removeRfqAttachment);
  const attachments = useQuery(api.rfqs.listRfqAttachments, queryArgs);
  const cart = useRfqCart();
  const [submitMessage, setSubmitMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !isBetterAuthConfigured || !user || !rfqId) {
      return;
    }
    setIsUploading(true);
    setUploadMessage(null);
    try {
      if (file.size > 25 * 1024 * 1024) {
        throw new Error(localize({ en: "File exceeds the 25 MB limit.", ar: "الملف يتجاوز الحد الأقصى 25 ميغابايت." }, language));
      }
      const uploadUrl = await generateUploadUrl({ actorUserId: user.id as Id<"users">, rfqId: rfqId as Id<"rfqs"> });
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file
      });
      if (!response.ok) {
        throw new Error(localize({ en: "Upload failed.", ar: "فشل رفع الملف." }, language));
      }
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await attachRfqFile({
        actorUserId: user.id as Id<"users">,
        rfqId: rfqId as Id<"rfqs">,
        storageId,
        originalFilename: file.name
      });
      setUploadMessage({ tone: "success", text: localize({ en: "Attachment uploaded — pending review.", ar: "تم رفع المرفق — بانتظار المراجعة." }, language) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setUploadMessage({ tone: "error", text: message || localize({ en: "Could not upload the file.", ar: "تعذر رفع الملف." }, language) });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleRemoveAttachment(attachmentId: Id<"rfqAttachments">) {
    if (!isBetterAuthConfigured || !user) {
      return;
    }
    setPendingRemoveId(attachmentId);
    setUploadMessage(null);
    try {
      await removeAttachment({ actorUserId: user.id as Id<"users">, attachmentId });
      setUploadMessage({ tone: "success", text: localize({ en: "Attachment removed.", ar: "تم حذف المرفق." }, language) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setUploadMessage({ tone: "error", text: message || localize({ en: "Could not remove the attachment.", ar: "تعذر حذف المرفق." }, language) });
    } finally {
      setPendingRemoveId(null);
    }
  }

  function handleDuplicate() {
    if (!detail) {
      return;
    }
    cart.replaceAll(
      detail.lineItems.map((item) => ({
        productId: item.product?._id,
        sku: item.product?.sku,
        nameAr: item.product?.nameAr,
        nameEn: item.product?.nameEn,
        descriptionAr: item.descriptionAr,
        descriptionEn: item.descriptionEn,
        quantity: item.quantity,
        unit: item.unit
      }))
    );
    navigate("/client/rfqs");
  }

  async function handleSubmitDraft() {
    if (!isBetterAuthConfigured || !user || !rfqId) {
      return;
    }
    setIsSubmitting(true);
    setSubmitMessage(null);
    try {
      await submitRfq({ rfqId: rfqId as Id<"rfqs">, actorUserId: user.id as Id<"users"> });
      setSubmitMessage({ tone: "success", text: localize({ en: "RFQ submitted to MWRD.", ar: "تم إرسال طلب التسعير إلى مورد." }, language) });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setSubmitMessage({ tone: "error", text: message || localize({ en: "Could not submit the RFQ.", ar: "تعذر إرسال طلب التسعير." }, language) });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PortalShell
      title={t("rfq:pages.rfqs_title")}
      description={t("rfq:pages.rfqs_description")}
      navItems={navItems}
      primaryActionLabel={localize({ en: "Back to RFQs", ar: "العودة إلى الطلبات" }, language)}
      primaryActionIcon={<ArrowLeft className="size-4" aria-hidden="true" />}
      onPrimaryAction={() => navigate("/client/rfqs")}
    >
      {detail === undefined ? (
        <DashboardCard title={localize({ en: "Loading...", ar: "جار التحميل..." }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "Loading RFQ details...", ar: "جار تحميل تفاصيل الطلب..." }, language)}</p>
        </DashboardCard>
      ) : detail === null ? (
        <DashboardCard title={localize({ en: "Not found", ar: "غير موجود" }, language)}>
          <p className="text-sm text-muted-foreground">{localize({ en: "This RFQ does not exist or you cannot access it.", ar: "هذا الطلب غير موجود أو لا يمكنك الوصول إليه." }, language)}</p>
          <Link className="mt-3 inline-block text-sm font-semibold text-primary" to="/client/rfqs">
            {localize({ en: "Back to RFQs", ar: "العودة إلى الطلبات" }, language)}
          </Link>
        </DashboardCard>
      ) : (
        <section className="grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
          <div className="flex flex-col gap-5">
            <DashboardCard
              title={`${localize({ en: "RFQ", ar: "طلب" }, language)} ${detail._id.slice(-6).toUpperCase()}`}
              description={detail.notes ?? localize({ en: "No notes provided.", ar: "لا توجد ملاحظات." }, language)}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Status", ar: "الحالة" }, language)}</span>
                  <StatusBadge tone={statusTone(detail.status)}>{t(`rfq:status.${detail.status}` as const)}</StatusBadge>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Type", ar: "النوع" }, language)}</span>
                  <span className="text-sm font-semibold">
                    {detail.isNonCatalog ? localize({ en: "Non-catalog", ar: "خارج الكتالوج" }, language) : localize({ en: "Catalog", ar: "كتالوج" }, language)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Created", ar: "تاريخ الإنشاء" }, language)}</span>
                  <span className="inline-flex items-center gap-2 text-sm">
                    <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
                    {formatDateTime(detail.createdAt, language)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Required by", ar: "مطلوب بحلول" }, language)}</span>
                  <span className="text-sm">{detail.requiredDeliveryDate ?? localize({ en: "Not specified", ar: "غير محدد" }, language)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Department", ar: "القسم" }, language)}</span>
                  <span className="text-sm">{detail.department ?? localize({ en: "Not specified", ar: "غير محدد" }, language)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Branch", ar: "الفرع" }, language)}</span>
                  <span className="text-sm">{detail.branch ?? localize({ en: "Not specified", ar: "غير محدد" }, language)}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">{localize({ en: "Cost center", ar: "مركز التكلفة" }, language)}</span>
                  <span className="text-sm">{detail.costCenter ?? localize({ en: "Not specified", ar: "غير محدد" }, language)}</span>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-3 border-t border-border/70 pt-4">
                {submitMessage ? (
                  <p
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-semibold",
                      submitMessage.tone === "success"
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    )}
                  >
                    {submitMessage.text}
                  </p>
                ) : null}
                <div className="flex flex-col gap-2 sm:flex-row">
                  {detail.status === "draft" ? (
                    <Button type="button" disabled={isSubmitting || !isBetterAuthConfigured} onClick={() => void handleSubmitDraft()} className="flex-1">
                      {isSubmitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
                      {t("rfq:form.submit")}
                    </Button>
                  ) : null}
                  <Button type="button" variant="outline" onClick={handleDuplicate} className="flex-1" disabled={detail.lineItems.length === 0}>
                    <Copy className="size-4" aria-hidden="true" />
                    {localize({ en: "Duplicate as new RFQ", ar: "تكرار كطلب جديد" }, language)}
                  </Button>
                </div>
              </div>
            </DashboardCard>

            <DashboardCard title={localize({ en: "Attachments", ar: "المرفقات" }, language)} description={localize({ en: "Files stay in MWRD secure storage and are released after sanitization review.", ar: "تبقى الملفات في تخزين مورد الآمن وتصدر بعد مراجعة الفحص." }, language)}>
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <input ref={fileInputRef} className="hidden" type="file" onChange={(event) => void handleUpload(event)} disabled={isUploading || !isBetterAuthConfigured || detail.status !== "draft"} />
                  <Button type="button" variant="outline" disabled={isUploading || !isBetterAuthConfigured || detail.status !== "draft"} onClick={() => fileInputRef.current?.click()}>
                    {isUploading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Upload className="size-4" aria-hidden="true" />}
                    {localize({ en: "Upload file", ar: "رفع ملف" }, language)}
                  </Button>
                  <span className="text-xs text-muted-foreground">{localize({ en: "Max 25 MB. Files are scanned before being shared.", ar: "الحد الأقصى 25 ميغابايت. يتم فحص الملفات قبل المشاركة." }, language)}</span>
                </div>
                {uploadMessage ? (
                  <p
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-semibold",
                      uploadMessage.tone === "success"
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    )}
                  >
                    {uploadMessage.text}
                  </p>
                ) : null}
                {attachments === undefined ? (
                  <p className="text-sm text-muted-foreground">{localize({ en: "Loading attachments...", ar: "جار تحميل المرفقات..." }, language)}</p>
                ) : attachments.length === 0 ? (
                  <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <Paperclip className="size-4" aria-hidden="true" />
                    {localize({ en: "No attachments yet.", ar: "لا توجد مرفقات بعد." }, language)}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {attachments.map((attachment) => (
                      <li key={attachment._id} className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Paperclip className="size-4 text-muted-foreground" aria-hidden="true" />
                          <span className="truncate text-sm font-semibold">{attachment.originalFilename}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge tone={attachmentTone(attachment.sanitizationStatus)}>{attachmentLabel(attachment.sanitizationStatus, language)}</StatusBadge>
                          {detail.status === "draft" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              disabled={pendingRemoveId === attachment._id}
                              onClick={() => void handleRemoveAttachment(attachment._id)}
                              aria-label={localize({ en: "Remove attachment", ar: "حذف المرفق" }, language)}
                            >
                              {pendingRemoveId === attachment._id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Trash2 className="size-4" aria-hidden="true" />}
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </DashboardCard>

            <DashboardCard title={localize({ en: "Line items", ar: "بنود الطلب" }, language)}>
              <DataTable
                rows={detail.lineItems}
                emptyLabel={localize({ en: "No line items.", ar: "لا توجد بنود." }, language)}
                getRowKey={(item) => item._id}
                columns={[
                  {
                    header: localize({ en: "Item", ar: "البند" }, language),
                    cell: (item) => (
                      <div className="flex flex-col">
                        <span className="font-semibold">{item.product ? localizePair(item.product.nameAr, item.product.nameEn, language) : localizePair(item.descriptionAr, item.descriptionEn, language) || localize({ en: "Custom item", ar: "بند مخصص" }, language)}</span>
                        {item.product ? <span className="text-xs text-muted-foreground">{item.product.sku}</span> : null}
                      </div>
                    )
                  },
                  {
                    header: localize({ en: "Quantity", ar: "الكمية" }, language),
                    cell: (item) => <span>{`${item.quantity} ${item.unit}`}</span>
                  }
                ]}
              />
            </DashboardCard>
          </div>

          <DashboardCard title={localize({ en: "Timeline", ar: "السجل الزمني" }, language)} description={localize({ en: "Audit events for this RFQ.", ar: "سجل أحداث هذا الطلب." }, language)}>
            {detail.timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground">{localize({ en: "No events yet.", ar: "لا توجد أحداث بعد." }, language)}</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {detail.timeline.map((event) => (
                  <li key={event._id} className="flex flex-col gap-1 border-s-2 border-primary/40 ps-3">
                    <span className="text-sm font-semibold">{event.summary}</span>
                    <span className="text-xs text-muted-foreground">{event.action}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(event.createdAt, language)}</span>
                  </li>
                ))}
              </ol>
            )}
          </DashboardCard>
        </section>
      )}
    </PortalShell>
  );
}
