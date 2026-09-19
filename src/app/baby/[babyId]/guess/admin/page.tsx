import { redirect } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { getLocaleTag } from "@/utils/formatting";
import { ArrowLeft, Calendar, Hash, Type, User, CircleDot, Pencil, Trophy } from "lucide-react";
import { getUserAccess, getUsers } from "@/utils/actions/users";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { getPendingQuestions, getQuestions } from "@/utils/actions/guesses_questions";
import { getAllGuesses } from "@/utils/actions/guesses";
import { logger } from "@/utils/logger";
import { computeWinners } from "@/utils/guess_scoring";
import Modal from "../_components/modal";
import PendingQuestions from "./_components/pending_questions";
import DeleteQuestionButton from "./_components/delete_question_button";
import DeleteGuessButton from "./_components/delete_guess_button";
import ReorderQuestionButtons from "./_components/reorder_question_buttons";
import ResolveQuestionModal from "./_components/resolve_question_modal";
import UnresolveQuestionButton from "./_components/unresolve_question_button";
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
    default:
      return { icon: <Type className="h-3.5 w-3.5 text-emerald-500" />, label: tType('text') };
  }
}

function formatAnswer(value: unknown, type: string, options: unknown, localeTag: string) {
  if (value === undefined || value === null || value === "") return "-";
  if (type === "date") {
    const d = new Date(value as string);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(localeTag, { day: "numeric", month: "long", year: "numeric" });
    }
  }
  if (type === "number") {
    const num = Number(value);
    if (!isNaN(num)) {
      const precision = (options as { precision?: number } | null)?.precision;
      if (typeof precision === "number") {
        return num.toLocaleString(localeTag, { minimumFractionDigits: precision, maximumFractionDigits: precision });
      }
    }
  }
  return String(value);
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
    <div className="bg-landing-background text-landing-foreground">
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
              <p className="text-xs font-semibold tracking-[0.16em] text-landing-camel uppercase">
                {t('eyebrow')}
              </p>
              <h1 className="mt-1 font-display text-3xl font-semibold">
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
              const questionGuesses = guesses.filter((g) => g.question_id === question.id);
              const isResolved = !!question.resolved_at;
              const pointsByUserId = new Map(
                isResolved
                  ? computeWinners(question, questionGuesses).map((winner) => [winner.userId, winner.points])
                  : []
              );
              return (
                <Card key={question.id} className="relative overflow-hidden border-landing-border bg-landing-surface">
                  <div className="absolute top-0 right-0 flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-bl-xl border-l border-b border-landing-border bg-landing-background">
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
                    {questionGuesses.length === 0 ? (
                      <p className="text-xs text-landing-muted italic mb-3">{tAdmin('noAnswersYet')}</p>
                    ) : (
                      <div className="flex flex-col gap-1.5 mb-3">
                        {questionGuesses.map((guess) => {
                          const guessUserName = userNameById.get(guess.user_id) ?? t('unknownUser');
                          const points = pointsByUserId.get(guess.user_id);
                          return (
                            <div
                              key={guess.id}
                              className="flex items-center justify-between gap-3 rounded-xl bg-landing-background px-3 py-2 text-sm"
                            >
                              <span className="flex items-center gap-1.5 text-landing-muted">
                                <User className="h-3.5 w-3.5" />
                                {guessUserName}
                              </span>
                              <div className="flex items-center gap-2">
                                {points && (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                                    <Trophy className="h-3.5 w-3.5" />
                                    +{points}
                                  </span>
                                )}
                                <span className="font-semibold text-landing-foreground">
                                  {formatAnswer(guess.answer, question.type, question.options, localeTag)}
                                </span>
                                <DeleteGuessButton babyId={babyId} guessId={guess.id} userName={guessUserName} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 pt-3 border-t border-landing-border">
                      <div className="text-xs min-w-0">
                        {isResolved ? (
                          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                            <Trophy className="h-3.5 w-3.5" />
                            {tAdmin('correctAnswer')}:{" "}
                            <span className="text-landing-foreground">
                              {formatAnswer(question.correct_answer, question.type, question.options, localeTag)}
                            </span>
                          </span>
                        ) : (
                          <span className="text-landing-muted italic">{tAdmin('notResolvedYet')}</span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Modal
                          babyId={babyId}
                          isAdmin
                          question={question}
                          lockStructure={questionGuesses.length > 0}
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
                        {questionGuesses.length === 0 && !isResolved && (
                          <DeleteQuestionButton babyId={babyId} questionId={question.id} />
                        )}
                        <ResolveQuestionModal babyId={babyId} question={question} />
                        {isResolved && <UnresolveQuestionButton babyId={babyId} questionId={question.id} />}
                      </div>
                    </div>
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
