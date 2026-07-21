import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Hash, Type, User, CircleDot } from "lucide-react";
import { getUserAccess, getUsers } from "@/utils/actions/users";
import { getPendingQuestions, getQuestions } from "@/utils/actions/guesses_questions";
import { getAllGuesses } from "@/utils/actions/guesses";
import { logger } from "@/utils/logger";
import Modal from "../_components/modal";
import PendingQuestions from "./_components/pending_questions";
import DeleteQuestionButton from "./_components/delete_question_button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

function getTypeMeta(type: string) {
  switch (type) {
    case "date":
      return { icon: <Calendar className="h-3.5 w-3.5 text-primary" />, label: "Date" };
    case "number":
      return { icon: <Hash className="h-3.5 w-3.5 text-rose" />, label: "Nombre" };
    case "option":
      return { icon: <CircleDot className="h-3.5 w-3.5 text-violet-500" />, label: "Choix unique" };
    default:
      return { icon: <Type className="h-3.5 w-3.5 text-emerald-500" />, label: "Texte" };
  }
}

function formatAnswer(value: unknown, type: string) {
  if (value === undefined || value === null || value === "") return "-";
  if (type === "date") {
    const d = new Date(value as string);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
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
  const contextLogger = logger.child({ function: GuessAdminPage.name, babyId });

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
      .map((u) => [u.id, [u.first_name, u.last_name].filter(Boolean).join(" ") || "Utilisateur"])
  );

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <div className="border-b border-border pb-6 mb-8">
        <Link
          href={`/baby/${babyId}/guess`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux pronostics
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-primary/80 to-rose bg-clip-text text-transparent">
              Administration des pronostics
            </h1>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-xl">
              Créez et consultez les pronostics proposés à la famille.
            </p>
          </div>
          <div className="flex shrink-0">
            <Modal babyId={babyId} isAdmin />
          </div>
        </div>
      </div>

      <PendingQuestions babyId={babyId} questions={pendingQuestions} userNameById={userNameById} />

      {questions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-2xl bg-muted/10">
          <p className="text-sm font-medium">Aucun pronostic créé pour le moment.</p>
          <p className="text-xs text-muted-foreground mt-1">Cliquez sur &quot;Nouveau pronostic&quot; pour en ajouter un.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((question) => {
            const { icon, label } = getTypeMeta(question.type);
            const questionGuesses = guesses.filter((g) => g.question_id === question.id);
            return (
              <Card key={question.id} className="relative overflow-hidden border-border">
                <div className="absolute top-0 right-0 flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-bl-xl border-l border-b border-border bg-muted/40">
                  {icon}
                  <span className="text-muted-foreground">{label}</span>
                </div>
                <CardHeader className="pb-4 pt-5">
                  <CardTitle className="pr-16 text-base font-bold text-foreground">
                    {question.title}
                  </CardTitle>
                  {question.description && (
                    <CardDescription className="text-xs text-muted-foreground mt-1">
                      {question.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  {questionGuesses.length === 0 ? (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-muted-foreground italic">Aucune réponse pour le moment.</p>
                      <DeleteQuestionButton babyId={babyId} questionId={question.id} />
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {questionGuesses.map((guess) => (
                        <div
                          key={guess.id}
                          className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-3 py-2 text-sm"
                        >
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <User className="h-3.5 w-3.5" />
                            {userNameById.get(guess.user_id) ?? "Utilisateur"}
                          </span>
                          <span className="font-semibold text-foreground">
                            {formatAnswer(guess.answer, question.type)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
