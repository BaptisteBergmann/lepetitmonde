import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Hash, Type } from "lucide-react";
import { getUserAccess } from "@/utils/actions/users";
import { getQuestions } from "@/utils/actions/guesses_questions";
import { logger } from "@/utils/logger";
import Modal from "../_components/modal";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

function getTypeMeta(type: string) {
  switch (type) {
    case "date":
      return { icon: <Calendar className="h-3.5 w-3.5 text-primary" />, label: "Date" };
    case "number":
      return { icon: <Hash className="h-3.5 w-3.5 text-rose" />, label: "Nombre" };
    default:
      return { icon: <Type className="h-3.5 w-3.5 text-emerald-500" />, label: "Texte" };
  }
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

  const questions = await getQuestions(babyId);
  contextLogger.debug(questions, "Questions loaded for admin page");

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
            <Modal babyId={babyId} />
          </div>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-2xl bg-muted/10">
          <p className="text-sm font-medium">Aucun pronostic créé pour le moment.</p>
          <p className="text-xs text-muted-foreground mt-1">Cliquez sur &quot;Nouveau pronostic&quot; pour en ajouter un.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((question) => {
            const { icon, label } = getTypeMeta(question.type);
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
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
