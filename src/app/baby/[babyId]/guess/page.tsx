import Link from "next/link";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import QuestionsListWrapper from "./questions_list_wrapper";
import { Loader2, Settings } from "lucide-react";
import { getUserAccess } from "@/utils/actions/users";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { logger } from "@/utils/logger";
import { Button } from "@/components/ui/button";
import Modal from "./_components/modal";

export default async function GuessesPage({
  params,
}: {
  params: Promise<{ babyId: string }>
}) {
  const { babyId } = await params;
  const t = await getTranslations('guess')

  await assertPageAccess(babyId, 'guess')

  const access = await getUserAccess(babyId)
  const contextLogger = logger.child({ function: GuessesPage.name, params })
  contextLogger.debug(access, "User Access")

  return (
    <div className="overflow-hidden text-landing-foreground">
      <div className="relative mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
        {!Array.isArray(access) && (
          <div className="relative flex justify-end gap-2">
            <Modal babyId={babyId} isAdmin={access.access_level === "admin"} />
            {access.access_level === "admin" && (
              <Link href={`/baby/${babyId}/guess/admin`}>
                <Button variant="outline" className="gap-2 rounded-2xl cursor-pointer">
                  <Settings className="h-4 w-4" />
                  <span>{t('manage')}</span>
                </Button>
              </Link>
            )}
          </div>
        )}

        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-landing-muted">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm">{t('loading')}</p>
            </div>
          }
        >
          <QuestionsListWrapper babyId={babyId} />
        </Suspense>
      </div>
    </div>
  );
}
