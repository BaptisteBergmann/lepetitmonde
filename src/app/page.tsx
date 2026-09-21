import { getBabiesList } from "@utils/actions/baby";
import { createClient } from "@utils/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@utils/utils";
import { Reveal } from "@components/reveal";
import Landing from "./_home/landing";
import { getTranslations } from "next-intl/server";

const AVATAR_TONES = ["bg-primary", "bg-rose", "bg-sage"];

export default async function Home() {
  const t = await getTranslations("home");
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <Landing />;
  }

  const firstName = user?.user_metadata?.full_name?.split(/\s+/)[0] || "";
  const babies = await getBabiesList();

  return (
    <div className="text-landing-foreground">
      <div className="relative mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        <Reveal className="relative text-center">
          <Image
            src="/logo_mark.svg"
            alt=""
            width={512}
            height={512}
            className="mx-auto mb-4 h-12 w-auto"
            unoptimized
          />
          <h1 className="font-display text-[clamp(1.9rem,4vw+1rem,2.75rem)] font-semibold">
            {firstName ? t('greeting', { firstName }) : t('greetingNoName')}
          </h1>
          <p className="mx-auto mt-3 max-w-xs text-landing-muted">
            {t('subtitle')}
          </p>
        </Reveal>

        {babies.length === 0 ? (
          <Reveal delay={120} className="mt-10">
            <Card>
              <CardHeader>
                <CardTitle>{t('noBabiesTitle')}</CardTitle>
                <CardDescription>
                  {t('noBabiesDescription')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Reveal>
        ) : (
          <div className="mt-10 flex flex-col gap-4">
            {babies.map((baby, index) => (
              <Reveal key={baby.id} delay={index * 80}>
                <Link
                  href={`/baby/${baby.id}`}
                  className="landing-page-card group flex items-center gap-4 rounded-[20px] border border-landing-border bg-landing-surface px-5 py-4 transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(43,53,66,0.35)] dark:hover:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.55)]"
                >
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-full font-display text-lg font-semibold text-primary-foreground",
                      AVATAR_TONES[index % AVATAR_TONES.length]
                    )}
                  >
                    {baby.baby_surname.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-lg font-semibold">{baby.baby_surname}</span>
                    <span className="block text-sm text-landing-muted">{t('viewJournal')}</span>
                  </span>
                  <ChevronRight className="size-[18px] shrink-0 text-landing-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              </Reveal>
            ))}
          </div>
        )}

        <p className="relative mt-10 text-center text-xs text-landing-muted">
          {t('footer')}
        </p>
      </div>
    </div>
  );
}
