import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Trophy, Medal } from "lucide-react";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getLeaderboard } from "@/utils/actions/guesses_questions";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@components/reveal";

const RANK_STYLES = [
  "bg-amber-400/20 text-amber-600 dark:text-amber-400",
  "bg-slate-300/30 text-slate-600 dark:text-slate-300",
  "bg-orange-400/20 text-orange-600 dark:text-orange-400",
];

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ babyId: string }>;
}) {
  const { babyId } = await params;
  await assertPageAccess(babyId, "guess");

  const t = await getTranslations("guess");
  const tBoard = await getTranslations("guess.leaderboard");
  const leaderboard = await getLeaderboard(babyId);

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        <Reveal className="border-b border-landing-border pb-6 mb-8">
          <Link
            href={`/baby/${babyId}/guess`}
            className="inline-flex items-center gap-1.5 text-sm text-landing-muted hover:text-landing-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            {tBoard("back")}
          </Link>
          <p className="text-xs font-semibold tracking-[0.16em] text-landing-camel uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-primary" />
            {tBoard("title")}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-landing-muted sm:text-base">
            {tBoard("subtitle")}
          </p>
        </Reveal>

        {leaderboard.length === 0 ? (
          <div className="text-center py-12 text-landing-muted border border-dashed border-landing-border rounded-2xl bg-landing-surface">
            <p className="text-sm font-medium">{tBoard("empty")}</p>
            <p className="text-xs text-landing-muted mt-1">{tBoard("emptyHint")}</p>
          </div>
        ) : (
          <Card className="border-landing-border bg-landing-surface overflow-hidden">
            <CardContent className="p-0">
              <ol className="divide-y divide-landing-border">
                {leaderboard.map((entry, index) => (
                  <li key={entry.userId} className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                          RANK_STYLES[index] ?? "bg-landing-background text-landing-muted"
                        }`}
                      >
                        {index < 3 ? <Medal className="h-4 w-4" /> : index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-landing-foreground truncate">
                          {entry.name ?? t("unknownUser")}
                        </p>
                        <p className="text-xs text-landing-muted">
                          {tBoard("questionsWon", { count: entry.questionsWon })}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-lg font-extrabold text-primary">
                      {tBoard("points", { count: entry.points })}
                    </span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
