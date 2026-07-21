import Link from "next/link";
import { Suspense } from "react";
import QuestionsListWrapper from "./questions_list_wrapper";
import { Loader2, Settings, Sparkles } from "lucide-react";
import { getUserAccess, getUsers } from "@/utils/actions/users";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";

export default async function GuessesPage({
  params,
}: {
  params: Promise<{ babyId: string }>
}) {
  const { babyId } = await params;
  const access = await getUserAccess(babyId)
  const contextLogger = logger.child({ function: GuessesPage.name, params })
  contextLogger.debug(access, "User Access")

  return (
    <div className="relative w-full max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
      />

      {access.access_level === "admin" && (
        <div className="relative flex justify-end">
          <Link href={`/baby/${babyId}/guess/admin`}>
            <Button variant="outline" className="gap-2 rounded-2xl cursor-pointer">
              <Settings className="h-4 w-4" />
              <span>Administrer</span>
            </Button>
          </Link>
        </div>
      )}

      <div className="relative flex flex-col items-center text-center gap-2 pb-2">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Sparkles className="h-5 w-5" />
        </span>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Pronostics de la famille
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-xs">
          Qui verra juste ? Participez aux pronostics ou créez-en de nouveaux pour animer l&apos;attente !
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Chargement des pronostics...</p>
          </div>
        }
      >
        <QuestionsListWrapper babyId={babyId} />
      </Suspense>
    </div>
  );
}
