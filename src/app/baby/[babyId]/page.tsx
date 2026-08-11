import { getBaby } from "@utils/actions/baby";
import { getUserAccess } from "@utils/actions/users";
import { getPageSettings } from "@utils/actions/page_settings";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ChevronRight, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getLocale, getTranslations } from "next-intl/server";
import { getDateFnsLocale } from "@utils/formatting";
import { Reveal } from "@components/reveal";

export default async function BabyPage({
  params,
}: {
  params: Promise<{ babyId: string }>;
}) {
  const { babyId } = await params;
  const locale = await getLocale();
  const dateFnsLocale = getDateFnsLocale(locale);
  const t = await getTranslations("babyHub");
  const baby = await getBaby(babyId);
  const access = await getUserAccess(babyId);
  const accessLevel = !Array.isArray(access) ? access?.access_level : undefined;

  if (!("baby_surname" in baby)) {
    notFound();
  }

  const pages = await getPageSettings(babyId);
  const sections = pages.filter(
    (page) => page.enabled && (accessLevel === "admin" || accessLevel === page.role)
  );

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="relative mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-10 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
        />

        <Reveal className="relative text-center">
          <Image
            src="/logo_mark.svg"
            alt=""
            width={512}
            height={512}
            className="mx-auto mb-5 h-14 w-auto"
            unoptimized
          />
          <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            {t("eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-[clamp(3rem,9vw,4.5rem)] leading-none font-medium italic">
            {baby.baby_surname}
          </h1>
          <p className="mt-4 text-sm text-landing-muted">
            {t("memberSince", { date: format(new Date(baby.created_at), "d MMMM yyyy", { locale: dateFnsLocale }) })}
          </p>
          <p className="mt-2 text-landing-muted">{t("chooseSection")}</p>
        </Reveal>

        {sections.length === 0 ? (
          <Reveal delay={120} className="mt-10">
            <Card>
              <CardHeader>
                <CardTitle>{t("emptyTitle")}</CardTitle>
                <CardDescription>
                  {t("emptyDescription")}
                </CardDescription>
              </CardHeader>
            </Card>
          </Reveal>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {sections.map(({ id, name, eyebrow, description, icon: Icon }, i) => (
              <Reveal key={id} delay={i * 80}>
                <Link
                  href={`/baby/${babyId}/${id}`}
                  className="landing-page-card group flex h-full items-start gap-4 rounded-[20px] border border-landing-border bg-landing-surface p-6 transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(43,53,66,0.35)] dark:hover:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.55)]"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-landing-background text-primary">
                    <Icon className="size-[22px]" strokeWidth={1.8} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold tracking-[0.06em] text-landing-camel uppercase">
                      {eyebrow}
                    </span>
                    <span className="mt-1 block font-display text-lg font-semibold">{name}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-landing-muted">
                      {description}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 size-[18px] shrink-0 text-landing-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              </Reveal>
            ))}
          </div>
        )}

        <p className="mt-10 flex items-center justify-center gap-2 text-center text-sm text-landing-muted">
          <ShieldCheck className="size-[14px] text-landing-camel" />
          {t("footer")}
        </p>
      </div>
    </div>
  );
}
