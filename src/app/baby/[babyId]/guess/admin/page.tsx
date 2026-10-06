import { redirect } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getLocaleTag } from "@/utils/formatting";
import { formatAnswer } from "@/utils/guess_format";
import { isClosestWinsType, scoreQuestion } from "@/utils/guess_scoring";
import { ArrowLeft, Calendar, Clock, Hash, Type, User, CircleDot, Pencil, Laugh, Lock } from "lucide-react";
import { getUserAccess, getUsers } from "@/utils/actions/users";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getPendingQuestions, getQuestions } from "@/utils/actions/guesses_questions";
import { getAllGuesses } from "@/utils/actions/guesses";
import { logger } from "@/utils/logger";
import Modal from "../_components/modal";
import PendingQuestions from "./_components/pending_questions";
import DeleteQuestionButton from "./_components/delete_question_button";
import DeleteGuessButton from "./_components/delete_guess_button";
import ReorderQuestionButtons from "./_components/reorder_question_buttons";
import ResolveQuestionForm from "./_components/resolve_question_form";
import GuessVerdictToggle from "./_components/guess_verdict_toggle";
import FunnyToggle from "./_components/funny_toggle";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Reveal } from "@components/reveal";

function getTypeMeta(type: string, tType: (key: string) => string) {
  switch (type) {
    case "date":
      return { icon: <Calendar className="h-3.5 w-3.5 text-primary" />, label: tType('date') };
    case "number":
      return { icon: <Hash className="h-3.5 w-3.5 text-rose" />, label: tType('number') };
    case "option":
      return { icon: <CircleDot className="h-3.5 w-3.5 text-violet-500" />, label: tType('option') };
    case "time":
      return { icon: <Clock className="h-3.5 w-3.5 text-primary" />, label: tType('time') };
    default:
      return { icon: <Type className="h-3.5 w-3.5 text-emerald-500" />, label: tType('text') };
  }
}

export default async function GuessAdminPage({
  params,
}: {
  params: Promise<{ babyId: string }>;
}) {
  const { babyId } = await params;
  const localeTag = getLocaleTag(await getLocale());
  const t = await getTranslations('guess');
  const tAdmin = await getTranslations('guess.admin');
  const tType = await getTranslations('guess.answerTypes');
  const tResolve = await getTranslations('guess.admin.resolve');
  const tFunny = await getTranslations('guess.admin.funny');
  const contextLogger = logger.child({ function: GuessAdminPage.name, babyId });

  // Feature-level gate: can this member reach Pronostics at all.
  await assertPageAccess(babyId, 'guess');

  // Within Pronostics, managing questions is admin-only — a separate,
  // narrower concern from the page-level gate above.
  const access = await getUserAccess(babyId);
  if (Array.isArray(access) || access.access_level !== "admin") {
    contextLogger.warn("Non-admin attempted to access guess admin page");
    redirect(`/baby/${babyId}/guess`);
  }

  const [questions, pendingQuestions, guesses, users] = await Promise.all([
    getQuestions(babyId),
    getPendingQuestions(babyId),
    getAllGuesses(babyId),
    getUsers(babyId),
  ]);
  contextLogger.debug(questions, "Questions loaded for admin page");

  const userNameById = new Map(
    users
      .filter((u): u is NonNullable<typeof u> => !!u)
      .map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(" ") || t('unknownUser')])
  );

  return (
    <div className="text-landing-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
        <Reveal className="border-b border-landing-border pb-6 mb-8">
          <Link
            href={`/baby/${babyId}/guess`}
            className="inline-flex items-center gap-1.5 text-sm text-landing-muted hover:text-landing-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            {tAdmin('back')}
          </Link>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-display text-3xl font-semibold">
                {tAdmin('title')}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-landing-muted sm:text-base">
                {tAdmin('subtitle')}
              </p>
            </div>
            <div className="flex shrink-0">
              <Modal babyId={babyId} isAdmin />
            </div>
          </div>
        </Reveal>

        <PendingQuestions babyId={babyId} questions={pendingQuestions} userNameById={userNameById} />

        {questions.length === 0 ? (
          <div className="text-center py-12 text-landing-muted border border-dashed border-landing-border rounded-2xl bg-landing-surface">
            <p className="text-sm font-medium">{tAdmin('empty')}</p>
            <p className="text-xs text-landing-muted mt-1">{tAdmin('emptyHint')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((question, index) => {
              const { icon, label } = getTypeMeta(question.type, tType);
              const isResolved = !!question.resolved_at;
              const scores = scoreQuestion(question, guesses);
              const questionGuesses = guesses.filter((g) => g.question_id === question.id);
              if (isResolved) {
                // Best first; Array.prototype.sort is stable, so ties keep the existing order.
                questionGuesses.sort((a, b) => {
                  const sa = scores.get(a.id);
                  const sb = scores.get(b.id);
                  return (sb?.points ?? 0) - (sa?.points ?? 0)
                    || (sa?.rank ?? Number.MAX_SAFE_INTEGER) - (sb?.rank ?? Number.MAX_SAFE_INTEGER);
                });
              }
              return (
                <Card key={question.id} className="relative overflow-hidden border-landing-border bg-landing-surface">
                  <div className="absolute top-0 right-0 flex items-center gap-1.5 px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-bl-xl border-l border-b border-landing-border bg-landing-background">
                    {isResolved && (
                      <>
                        <Lock className="h-3 w-3 text-landing-muted" aria-hidden />
                        <span className="sr-only">{tResolve('closed')}</span>
                      </>
                    )}
                    {icon}
                    <span className="text-landing-muted">{label}</span>
                  </div>
                  <CardHeader className="pb-4 pt-5">
                    <div className="flex items-start gap-3">
                      <ReorderQuestionButtons
                        babyId={babyId}
                        questionId={question.id}
                        isFirst={index === 0}
                        isLast={index === questions.length - 1}
                      />
                      <div className="flex-1 min-w-0">
                        <CardTitle className="pr-10 font-display text-base font-semibold">
                          {question.title}
                        </CardTitle>
                        {question.description && (
                          <CardDescription className="text-xs text-landing-muted mt-1">
                            {question.description}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 pb-4">
                    <ResolveQuestionForm babyId={babyId} question={question} />
                    {questionGuesses.length === 0 ? (
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-landing-muted italic">{tAdmin('noAnswersYet')}</p>
                        <div className="flex items-center gap-2">
                          <Modal
                            babyId={babyId}
                            isAdmin
                            question={question}
                            trigger={
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1.5 rounded-2xl cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                {t('edit')}
                              </Button>
                            }
                          />
                          <DeleteQuestionButton babyId={babyId} questionId={question.id} />
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                          {questionGuesses.map((guess) => {
                            const guessUserName = userNameById.get(guess.user_id) ?? t('unknownUser');
                            const score = isResolved ? scores.get(guess.id) : undefined;
                            return (
                              <div
                                key={guess.id}
                                className="flex flex-col gap-2 rounded-xl bg-landing-background px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                                  <span className="flex shrink-0 items-center gap-1.5 text-landing-muted">
                                    <User className="h-3.5 w-3.5" />
                                    {guessUserName}
                                  </span>
                                  <span className="min-w-0 text-right font-semibold text-landing-foreground break-words">
                                    {formatAnswer(guess.answer, question.type, question.options, localeTag)}
                                    {guess.is_funny && (
                                      <span
                                        className="ml-1.5 inline-flex items-center gap-1 rounded-full bg-rose/15 px-2.5 py-1 align-middle text-xs font-bold uppercase tracking-wider text-rose"
                                        title={isResolved ? undefined : tFunny('hiddenUntilResolved')}
                                      >
                                        <Laugh className="h-3 w-3" aria-hidden />
                                        {tFunny('badge')}
                                        {!isResolved && <span className="sr-only">{` (${tFunny('hiddenUntilResolved')})`}</span>}
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                                  {score ? (
                                    <span
                                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${score.points > 0
                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                        : "bg-muted text-muted-foreground"
                                        }`}
                                    >
                                      {score.rank !== undefined && isClosestWinsType(question.type)
                                        ? `${tAdmin('rankShort', { rank: score.rank })} · `
                                        : null}
                                      {tAdmin('points', { count: score.points })}
                                    </span>
                                  ) : <span />}
                                  <div className="flex items-center gap-1.5">
                                    {isResolved && question.type === "text" && (
                                      <GuessVerdictToggle
                                        babyId={babyId}
                                        guessId={guess.id}
                                        userName={guessUserName}
                                        isCorrect={guess.is_correct}
                                      />
                                    )}
                                    <FunnyToggle
                                      babyId={babyId}
                                      guessId={guess.id}
                                      userName={guessUserName}
                                      isFunny={guess.is_funny}
                                    />
                                    <DeleteGuessButton babyId={babyId} guessId={guess.id} userName={guessUserName} />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-end">
                          <Modal
                            babyId={babyId}
                            isAdmin
                            question={question}
                            lockStructure
                            trigger={
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-1.5 rounded-2xl cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                {t('edit')}
                              </Button>
                            }
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
