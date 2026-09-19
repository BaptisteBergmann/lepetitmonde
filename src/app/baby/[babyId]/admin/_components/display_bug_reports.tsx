"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { format } from "date-fns";
import { getDateFnsLocale } from "@utils/formatting";
import { toast } from "sonner";
import { Tables, Enums } from "@utils/supabase/database.types";
import { updateBugReportStatus } from "@utils/actions/bug_reports";
import { ExternalLink, ImageOff, X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type BugReport = Tables<'bug_reports'> & {
  users: Pick<Tables<'users'>, 'first_name' | 'last_name'> | null;
  nickname: string | null;
};

interface DisplayBugReportsProps {
  bugReports: BugReport[];
  babyId: string;
}

const STATUS_STYLES: Record<Enums<'bug_report_status'>, string> = {
  new: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  reviewed: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  fixed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

export default function DisplayBugReports({ bugReports: initialBugReports, babyId }: DisplayBugReportsProps) {
  const t = useTranslations('admin.bugReports');
  const STATUS_LABELS: Record<Enums<'bug_report_status'>, string> = {
    new: t('statusNew'),
    reviewed: t('statusReviewed'),
    fixed: t('statusFixed'),
  };
  const tCommon = useTranslations('common');
  const dateFnsLocale = getDateFnsLocale(useLocale());
  const [bugReports, setBugReports] = useState(initialBugReports);
  const [openScreenshot, setOpenScreenshot] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleStatusChange = async (reportId: string, status: Enums<'bug_report_status'>) => {
    const previousStatus = bugReports.find((r) => r.id === reportId)?.status;
    setPendingId(reportId);
    setBugReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status } : r)));
    try {
      await updateBugReportStatus(babyId, reportId, status);
      if (status === "fixed") {
        toast.success(t('statusUpdatedNotified'));
      }
    } catch (err) {
      console.error(err);
      if (previousStatus) {
        setBugReports((prev) => prev.map((r) => (r.id === reportId ? { ...r, status: previousStatus } : r)));
      }
      toast.error(err instanceof Error ? err.message : t('statusUpdateError'));
    } finally {
      setPendingId(null);
    }
  };

  if (bugReports.length === 0) {
    return (
      <div className="text-center py-10 text-landing-muted px-4">
        <p className="text-sm font-medium">{t('empty')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-landing-border">
        {bugReports.map((report) => {
          const reporterName = [report.users?.first_name, report.users?.last_name]
            .filter(Boolean)
            .join(" ") || report.nickname || t('unknownReporter');
          const screenshotUrl = report.screenshot_path
            ? `/api/bug-reports/${report.screenshot_path}`
            : null;

          return (
            <div key={report.id} className="flex gap-4 py-3.5 px-6 hover:bg-landing-background/60 transition-colors">
              {screenshotUrl ? (
                <button
                  onClick={() => setOpenScreenshot(screenshotUrl)}
                  className="shrink-0 h-16 w-16 rounded-xl overflow-hidden border border-landing-border cursor-pointer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={screenshotUrl} alt={t('screenshotAlt')} className="h-full w-full object-cover" />
                </button>
              ) : (
                <div className="shrink-0 h-16 w-16 rounded-xl border border-dashed border-landing-border flex items-center justify-center text-landing-muted">
                  <ImageOff className="h-5 w-5" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-landing-foreground whitespace-pre-wrap break-words">
                    {report.description}
                  </p>
                  <span
                    className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[report.status]}`}
                  >
                    {STATUS_LABELS[report.status]}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-landing-muted">
                  <span className="font-semibold">{reporterName}</span>
                  <span>
                    {tCommon('dateAtTime', {
                      date: format(new Date(report.created_at), 'd MMM yyyy', { locale: dateFnsLocale }),
                      time: format(new Date(report.created_at), 'HH:mm', { locale: dateFnsLocale }),
                    })}
                  </span>
                  {report.page_url && (
                    <a
                      href={report.page_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:text-landing-foreground transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {t('pageLink')}
                    </a>
                  )}
                </div>

                <div className="mt-2">
                  <Select
                    value={report.status}
                    onValueChange={(value: string | null) =>
                      value && handleStatusChange(report.id, value as Enums<'bug_report_status'>)
                    }
                    disabled={pendingId === report.id}
                  >
                    <SelectTrigger size="sm" className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(STATUS_LABELS) as Enums<'bug_report_status'>[]).map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {openScreenshot && createPortal(
        <div
          className="fixed inset-0 w-full h-full bg-black/70 backdrop-blur-xs flex justify-center items-center z-[60] p-4"
          onClick={() => setOpenScreenshot(null)}
        >
          <button
            onClick={() => setOpenScreenshot(null)}
            aria-label={t('close')}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors cursor-pointer touch-target"
          >
            <X className="h-4 w-4" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={openScreenshot}
            alt={t('screenshotAltLarge')}
            className="max-h-[90vh] max-w-full rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </>
  );
}
