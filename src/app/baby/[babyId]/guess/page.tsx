import Link from "next/link";
import { Suspense } from "react";
import QuestionsListWrapper from "./questions_list_wrapper";
import { Loader2, Settings } from "lucide-react";
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
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-6 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-primary/80 to-rose bg-clip-text text-transparent flex items-center gap-2">
            🍼 Pronostics de la Famille
          </h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-xl">
            Qui verra juste ? Participez aux pronostics ou créez-en de nouveaux pour animer l&apos;attente en famille !
          </p>
        </div>
        {access.access_level === "admin" &&
          <div className="flex shrink-0">
            <Link href={`/baby/${babyId}/guess/admin`}>
              <Button variant="outline" className="gap-2 rounded-2xl cursor-pointer">
                <Settings className="h-4 w-4" />
                <span>Administrer</span>
              </Button>
            </Link>
          </div>
        }
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
