"use client";

import { useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Tables } from "@utils/supabase/database.types";
import { ExternalLink, ImageOff, X } from "lucide-react";

type BugReport = Tables<'bug_reports'> & {
  users: Pick<Tables<'users'>, 'first_name' | 'last_name' | 'nickname'> | null;
};

interface DisplayBugReportsProps {
  bugReports: BugReport[];
}

export default function DisplayBugReports({ bugReports }: DisplayBugReportsProps) {
  const [openScreenshot, setOpenScreenshot] = useState<string | null>(null);

  if (bugReports.length === 0) {
    return (
      <div className="text-center py-10 text-landing-muted px-4">
        <p className="text-sm font-medium">Aucun bug signalé pour le moment.</p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-landing-border">
        {bugReports.map((report) => {
          const reporterName = [report.users?.first_name, report.users?.last_name]
            .filter(Boolean)
            .join(" ") || report.users?.nickname || "Utilisateur inconnu";
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
                  <img src={screenshotUrl} alt="Capture d'écran du bug" className="h-full w-full object-cover" />
                </button>
              ) : (
                <div className="shrink-0 h-16 w-16 rounded-xl border border-dashed border-landing-border flex items-center justify-center text-landing-muted">
                  <ImageOff className="h-5 w-5" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-sm text-landing-foreground whitespace-pre-wrap break-words">
                  {report.description}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-landing-muted">
                  <span className="font-semibold">{reporterName}</span>
                  <span>{format(new Date(report.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}</span>
                  {report.page_url && (
                    <a
                      href={report.page_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:text-landing-foreground transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      Page
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {openScreenshot && (
        <div
          className="fixed inset-0 w-full h-full bg-black/70 backdrop-blur-xs flex justify-center items-center z-50 p-4"
          onClick={() => setOpenScreenshot(null)}
        >
          <button
            onClick={() => setOpenScreenshot(null)}
            aria-label="Fermer"
            className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={openScreenshot}
            alt="Capture d'écran du bug en grand"
            className="max-h-[90vh] max-w-full rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
