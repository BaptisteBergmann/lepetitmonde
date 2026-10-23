import { getTranslations } from "next-intl/server";
import { assertPageAccess } from "@/utils/actions/page_settings";
import { Reveal } from "@components/reveal";

export default async function TrackerPage({
  params,
}: {
  params: Promise<{ babyId: string }>;
}) {
  const { babyId } = await params;
  const t = await getTranslations('tracker');

  await assertPageAccess(babyId, 'tracker');

  return (
    <div className="text-landing-foreground">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-16">
        <Reveal className="border-b border-landing-border pb-4 mb-6">
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-2 hidden max-w-xl text-sm text-landing-muted sm:block sm:text-base">
            {t('subtitle')}
          </p>
        </Reveal>
      </div>
    </div>
  );
}
