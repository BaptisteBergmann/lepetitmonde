import Image from "next/image";
import Link from "next/link";
import { BookOpen, CalendarDays, Dices, Users, ShieldCheck, ArrowRight, Heart, Baby, Camera } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@utils/utils";
import { Reveal } from "@components/reveal";
import { getTranslations } from "next-intl/server";

const PAGES = [
  { id: "daily", icon: BookOpen },
  { id: "calendar", icon: CalendarDays },
  { id: "guessing", icon: Dices },
] as const;

const STEPS = [
  { id: "create", icon: Baby },
  { id: "circles", icon: Users },
  { id: "publish", icon: Camera },
  { id: "calendar", icon: CalendarDays },
] as const;

export default async function Landing() {
  const t = await getTranslations();

  return (
    <div className="bg-landing-background text-landing-foreground">
      {/* ---------- hero ---------- */}
      <section className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6 sm:py-16 lg:px-12 lg:py-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <Reveal>
            <Image
              src="/logo_mark.svg"
              alt=""
              width={512}
              height={512}
              className="mb-6 h-16 w-auto sm:h-20"
              priority
              unoptimized
            />
            <p className="mb-4 inline-flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-primary uppercase before:inline-block before:h-px before:w-6 before:bg-primary before:content-['']">
              {t('landing.hero.eyebrow')}
            </p>
            <h1 className="text-balance font-display text-[clamp(2.5rem,4.6vw+1rem,4.2rem)] leading-[1.04] font-semibold">
              {t.rich('landing.hero.title', { em: (chunks) => <em className="font-display italic font-medium text-primary">{chunks}</em> })}
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-landing-muted">
              {t('landing.hero.intro')}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/login"
                className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-full px-6 text-base")}
              >
                {t('landing.hero.cta')}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </Reveal>

          <Reveal delay={120} className="flex justify-center">
            <article
              className="relative w-full max-w-[360px] rotate-3 rounded-[22px] border border-landing-border bg-landing-surface p-6 pb-7 shadow-[0_30px_60px_-30px_rgba(43,53,66,0.35)] dark:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.55)]"
            >
              <span
                aria-hidden
                className="absolute -top-3.5 right-8 h-13 w-6 bg-primary shadow-md"
                style={{ clipPath: "polygon(0 0,100% 0,100% 100%,50% 78%,0 100%)" }}
              />
              <p className="text-xs font-semibold tracking-[0.1em] text-landing-muted uppercase">
                {t('landing.hero.mockDate')}
              </p>
              <p className="mt-1 font-display text-xl font-semibold">{t('landing.hero.mockTitle')}</p>
              <div className="relative mt-4 h-[170px] overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_30%_30%,color-mix(in_oklch,var(--landing-dusk)_70%,transparent),transparent_60%),linear-gradient(135deg,var(--landing-background),var(--landing-camel)_140%)]">
                <Heart className="absolute bottom-3.5 left-4 size-11 text-landing-surface opacity-85" fill="currentColor" strokeWidth={1.6} />
              </div>
              <p className="mt-4 text-[0.95rem] leading-relaxed">
                {t.rich('landing.hero.mockCaption', { em: (chunks) => <em className="font-display italic text-primary">{chunks}</em> })}
              </p>
              <p className="mt-4 flex items-center gap-1.5 text-sm text-landing-muted">
                <Heart className="size-3.5 text-primary" fill="currentColor" />
                {t('landing.hero.mockSeenBy')}
              </p>
            </article>
          </Reveal>
        </div>
      </section>

      {/* ---------- pages ---------- */}
      <section className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 sm:py-20 lg:px-12">
        <Reveal className="mb-10 max-w-[52ch] sm:mb-14">
          <h2 className="text-balance font-display text-[clamp(1.9rem,2vw+1.3rem,2.6rem)] leading-[1.12] font-semibold">
            {t('landing.pages.title')}
          </h2>
          <p className="mt-3 text-lg text-landing-muted">
            {t('landing.pages.subtitle')}
          </p>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-3">
          {PAGES.map(({ id, icon: Icon }, i) => (
            <Reveal key={id} delay={i * 90}>
              <article className="landing-page-card group relative h-full overflow-hidden rounded-[20px] border border-landing-border bg-landing-surface p-8 transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(43,53,66,0.35)] dark:hover:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.55)]">
                <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-landing-background text-primary">
                  <Icon className="size-[22px]" strokeWidth={1.8} />
                </div>
                <p className="text-sm font-medium tracking-[0.02em] text-landing-camel">{t(`landing.pages.${id}.eyebrow`)}</p>
                <h3 className="mt-1.5 font-display text-[1.35rem] font-semibold">{t(`landing.pages.${id}.title`)}</h3>
                <p className="mt-2.5 text-[0.98rem] leading-relaxed text-landing-muted">{t(`landing.pages.${id}.text`)}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 sm:py-20 lg:px-12">
        <Reveal className="mb-10 max-w-[52ch] sm:mb-14">
          <h2 className="text-balance font-display text-[clamp(1.9rem,2vw+1.3rem,2.6rem)] leading-[1.12] font-semibold">
            {t('landing.steps.title')}
          </h2>
          <p className="mt-3 text-lg text-landing-muted">
            {t('landing.steps.subtitle')}
          </p>
        </Reveal>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ id, icon: Icon }, i) => (
            <Reveal key={id} delay={i * 90}>
              <div className="flex size-11 items-center justify-center rounded-xl bg-landing-surface text-primary">
                <Icon className="size-[22px]" strokeWidth={1.8} />
              </div>
              <p className="mt-4 text-xs font-semibold tracking-[0.12em] text-landing-camel uppercase">
                {t('landing.steps.stepLabel', { number: i + 1 })}
              </p>
              <h3 className="mt-1.5 font-display text-[1.2rem] font-semibold">{t(`landing.steps.${id}.title`)}</h3>
              <p className="mt-2 text-[0.95rem] leading-relaxed text-landing-muted">{t(`landing.steps.${id}.text`)}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- night interlude — deliberately fixed dark, in both themes ---------- */}
      <section
        className="relative overflow-hidden px-4 py-16 text-landing-night-foreground sm:py-24"
        style={{
          background:
            "radial-gradient(120% 140% at 50% -10%, var(--landing-night-bg-2), var(--landing-night-bg) 60%)",
        }}
      >
        <Reveal className="relative z-10 mx-auto max-w-[640px] text-center">
          <p className="mb-4 inline-flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-landing-night-accent uppercase before:inline-block before:h-px before:w-6 before:bg-landing-night-accent before:content-['']">
            {t('landing.night.eyebrow')}
          </p>
          <h2 className="text-balance font-display text-[clamp(1.9rem,2vw+1.3rem,2.7rem)] font-semibold text-landing-night-foreground">
            {t('landing.night.title')}
          </h2>
          <p className="mx-auto mt-5 max-w-[52ch] text-lg text-landing-night-muted">
            {t('landing.night.text', { appName: t('common.appName') })}
          </p>
          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-landing-night-muted">
            <ShieldCheck className="size-[14px] text-landing-night-accent" />
            {t('landing.night.hosted')}
          </p>
        </Reveal>
      </section>

      {/* ---------- final cta ---------- */}
      <section className="mx-auto max-w-[1180px] px-4 py-16 text-center sm:py-24 lg:px-12">
        <Reveal>
          <Heart className="mx-auto mb-5 size-8 text-landing-camel" fill="currentColor" />
          <h2 className="mx-auto max-w-[16ch] text-balance font-display text-[clamp(2rem,2.6vw+1rem,3rem)] font-semibold">
            {t('landing.finalCta.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-[44ch] text-lg text-landing-muted">
            {t('landing.finalCta.text')}
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/login"
              className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-full px-6 text-base")}
            >
              {t('landing.finalCta.cta')}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
