import Link from "next/link";
import { Suspense } from "react";
import QuestionsListWrapper from "./questions_list_wrapper";
import { Loader2, Settings, Dices } from "lucide-react";
import { getUserAccess } from "@/utils/actions/users";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import { Reveal } from "@components/reveal";
import Modal from "./_components/modal";

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
    <div className="bg-landing-background text-landing-foreground">
      <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
        />

        {!Array.isArray(access) && (
          <div className="relative flex justify-end gap-2">
            <Modal babyId={babyId} isAdmin={access.access_level === "admin"} />
            {access.access_level === "admin" && (
              <Link href={`/baby/${babyId}/guess/admin`}>
                <Button variant="outline" className="gap-2 rounded-2xl cursor-pointer">
                  <Settings className="h-4 w-4" />
                  <span>Administrer</span>
                </Button>
              </Link>
            )}
          </div>
        )}

        <Reveal className="relative flex flex-col items-center gap-2 pb-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Dices className="h-5 w-5" />
          </span>
          <p className="text-xs font-semibold tracking-[0.16em] text-landing-camel uppercase">
            Page — Les paris de famille
          </p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            Pronostics de la famille
          </h1>
          <p className="max-w-xs text-sm text-landing-muted sm:text-base">
            Qui verra juste ? Participez aux pronostics ou créez-en de nouveaux pour animer l&apos;attente !
          </p>
        </Reveal>

        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-landing-muted">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">Chargement des pronostics...</p>
            </div>
          }
        >
          <QuestionsListWrapper babyId={babyId} />
        </Suspense>
      </div>
    </div>
  );
}
