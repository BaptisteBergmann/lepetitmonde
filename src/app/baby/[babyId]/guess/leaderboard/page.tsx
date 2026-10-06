import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowLeft, Laugh, Quote, Trophy } from "lucide-react";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getLeaderboard } from "@/utils/actions/guesses";
import { getLocaleTag } from "@/utils/formatting";
import { formatAnswer } from "@/utils/guess_format";
import { logger } from "@/utils/logger";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "@components/reveal";
import { cn } from "@utils/utils";

export default async function GuessLeaderboardPage({
  params,
}: {
  params: Promise<{ babyId: string }>;
}) {
  const { babyId } = await params;
  const contextLogger = logger.child({ function: GuessLeaderboardPage.name, babyId });

  // Same gate as guess/page.tsx: anyone who can open Pronostics sees the
  // leaderboard; getLeaderboard only ever returns resolved questions.
  await assertPageAccess(babyId, 'guess');

  const t = await getTranslations('guess.leaderboard');
  const localeTag = getLocaleTag(await getLocale());
  const { standings, funnyAnswers, resolvedCount, totalCount, currentUserId } = await getLeaderboard(babyId);
  contextLogger.debug({ resolvedCount, totalCount, players: standings.length }, "Leaderboard loaded");

  // Ties are visible in the data itself: another row with the same rank.
  const rankCounts = new Map<number, number>();
  for (const s of standings) rankCounts.set(s.rank, (rankCounts.get(s.rank) ?? 0) + 1);

  const progress = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;
  const guessHref = `/baby/${babyId}/guess`;

  const emptyCard = (title: string, hint?: string) => (
    <Card className="border-2 border-dashed border-landing-border bg-landing-surface py-12">
      <CardContent className="flex flex-col items-center justify-center text-center space-y-3">
        <div className="p-3.5 bg-landing-background rounded-2xl">
          <Trophy className="h-8 w-8 text-landing-camel" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-base font-semibold">{title}</h2>
          {hint && <p className="text-sm text-landing-muted max-w-sm">{hint}</p>}
        </div>
        <Link href={guessHref} className={buttonVariants({ className: "rounded-2xl cursor-pointer" })}>
          {t('emptyCta')}
        </Link>
      </CardContent>
    </Card>
  );

  return (
    <div className="text-landing-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <Reveal className="border-b border-landing-border pb-6 mb-8">
          <Link
            href={guessHref}
            className="inline-flex items-center gap-1.5 text-sm text-landing-muted hover:text-landing-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('back')}
          </Link>
          <h1 className="font-display text-3xl font-semibold">{t('title')}</h1>
          <p className="mt-2 max-w-xl text-sm text-landing-muted sm:text-base">{t('subtitle')}</p>
          {totalCount > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold text-landing-muted">
                {t('resolvedProgress', { resolved: resolvedCount, total: totalCount })}
              </p>
              <div aria-hidden className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
              </div>
            </>
          )}
        </Reveal>

        {resolvedCount === 0 ? (
          emptyCard(t('empty'), t('emptyHint'))
        ) : standings.length === 0 ? (
          emptyCard(t('noPlayers'))
        ) : (
          <div className="space-y-10">
            <Card className="max-w-2xl border-landing-border bg-landing-surface p-2">
              <ol className="divide-y divide-landing-border">
                {standings.map((standing) => {
                  const isMe = standing.userId === currentUserId;
                  const isTied = (rankCounts.get(standing.rank) ?? 0) > 1;
                  return (
                    <li
                      key={standing.userId}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-3 min-h-14",
                        isMe && "bg-primary/10 ring-1 ring-inset ring-primary/25"
                      )}
                    >
                      <span className="sr-only">
                        {isTied ? t('rankTied', { rank: standing.rank }) : t('rank', { rank: standing.rank })}
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-full font-display text-base font-semibold",
                          standing.rank <= 3 ? "bg-primary/15 text-primary" : "bg-landing-background text-landing-muted"
                        )}
                      >
                        {standing.rank}
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold text-landing-foreground break-words">
                          {standing.name}
                        </span>
                        {isMe && (
                          <Badge variant="default" className="ml-1.5 align-middle">{t('you')}</Badge>
                        )}
                        {standing.funnyCount > 0 && (
                          <Badge
                            className="ml-1.5 align-middle bg-rose/15 text-rose"
                            aria-label={t('funnyBadge', { count: standing.funnyCount })}
                          >
                            <Laugh aria-hidden />
                            <span aria-hidden>{standing.funnyCount}</span>
                          </Badge>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <span aria-hidden>
                          <span className="font-display text-lg font-semibold">{standing.points}</span>
                          {" "}
                          <span className="text-xs text-landing-muted">
                            {t('pointsUnit', { count: standing.points })}
                          </span>
                        </span>
                        <span className="sr-only">{t('pointsLong', { count: standing.points })}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>

            <section>
              <h2 className="font-display text-xl font-semibold mb-1">{t('funnyTitle')}</h2>
              <p className="text-sm text-landing-muted mb-4">{t('funnySubtitle')}</p>
              {funnyAnswers.length === 0 ? (
                <p className="text-sm text-landing-muted italic">{t('funnyEmpty')}</p>
              ) : (
                <div className="columns-1 sm:columns-2 gap-4">
                  {funnyAnswers.map((funny) => (
                    <Card
                      key={funny.guessId}
                      className="border-landing-border bg-landing-surface p-4 mb-4 break-inside-avoid"
                    >
                      <figure>
                        <p className="text-xs font-semibold uppercase tracking-wider text-landing-camel break-words">
                          {funny.questionTitle}
                        </p>
                        <blockquote className="mt-2 flex gap-2 font-display text-lg italic text-landing-foreground break-words">
                          <Quote className="mt-1 h-4 w-4 shrink-0 text-rose" aria-hidden />
                          <span className="min-w-0">
                            {formatAnswer(funny.answer, funny.questionType, funny.questionOptions, localeTag)}
                          </span>
                        </blockquote>
                        <figcaption className="text-xs text-landing-muted mt-2">
                          {t('by', { name: funny.authorName })}
                        </figcaption>
                      </figure>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
