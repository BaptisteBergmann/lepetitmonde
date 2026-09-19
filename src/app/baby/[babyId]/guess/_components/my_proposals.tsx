import { getTranslations } from "next-intl/server";
import { Clock, XCircle } from "lucide-react";
import { Tables } from "@/utils/supabase/database.types";

export default async function MyProposals({
  proposals,
}: {
  proposals: Tables<'guess_questions'>[];
}) {
  if (proposals.length === 0) return null;
  const t = await getTranslations('guess.myProposals');

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-landing-camel px-1">
        {t('title')}
      </h2>
      <div className="flex flex-col gap-2">
        {proposals.map((proposal) => {
          const isPending = proposal.status === "pending";
          return (
            <div
              key={proposal.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-landing-border bg-landing-surface px-4 py-3"
            >
              <span className="text-sm font-medium text-landing-foreground truncate">{proposal.title}</span>
              {isPending ? (
                <span className="flex items-center gap-1.5 shrink-0 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Clock className="h-3 w-3" />
                  {t('pending')}
                </span>
              ) : (
                <span className="flex items-center gap-1.5 shrink-0 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-destructive/15 text-destructive">
                  <XCircle className="h-3 w-3" />
                  {t('rejected')}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
