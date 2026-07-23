import Image from "next/image";
import Link from "next/link";
import { BookOpen, CalendarDays, Dices, Users, ShieldCheck, ArrowRight, Heart } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@utils/utils";
import { Reveal } from "@components/reveal";

const PAGES = [
  {
    icon: BookOpen,
    eyebrow: "Page — Le quotidien",
    title: "Une page par jour",
    text: "Une sieste, un sourire, un premier mot : notez-les avec des photos et des vidéos, classées toutes seules par date.",
  },
  {
    icon: CalendarDays,
    eyebrow: "Page — Les grandes étapes",
    title: "Un calendrier qui grandit",
    text: "Rendez-vous, poussées de croissance, premières fois : tout ce qui compte, à l'endroit où l'on pense à le regarder.",
  },
  {
    icon: Dices,
    eyebrow: "Page — Les paris de famille",
    title: "Le jeu des pronostics",
    text: "Prénom, poids, date de naissance : papis, mamies et parrains tentent leur chance, parfois avant même le premier jour.",
  },
  {
    icon: Users,
    eyebrow: "Page — Le cercle",
    title: "Toute la famille, à sa place",
    text: "Invitez qui vous voulez, à votre rythme. Chaque page reste privée : jamais publique, jamais partagée ailleurs.",
  },
];

export default function Landing() {
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
              Le journal de bébé, à partager en famille
            </p>
            <h1 className="text-balance font-display text-[clamp(2.5rem,4.6vw+1rem,4.2rem)] leading-[1.04] font-semibold">
              Chaque petit jour
              <br />
              mérite <em className="font-display italic font-medium text-primary">sa page</em>.
            </h1>
            <p className="mt-6 max-w-[46ch] text-lg leading-relaxed text-landing-muted">
              Le petit monde est le journal privé où vous notez les progrès, les photos et les vidéos
              de bébé — et où toute la famille peut venir tourner les pages, en douceur, sans jamais
              quitter la maison.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/login"
                className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-full px-6 text-base")}
              >
                Ouvrir le journal
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="#pages"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-11 rounded-full border-landing-border px-6 text-base text-landing-foreground hover:bg-landing-surface"
                )}
              >
                Voir un exemple
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
                14 juillet · 8 mois
              </p>
              <p className="mt-1 font-display text-xl font-semibold">Premier pas</p>
              <div className="relative mt-4 h-[170px] overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_30%_30%,color-mix(in_oklch,var(--landing-dusk)_70%,transparent),transparent_60%),linear-gradient(135deg,var(--landing-background),var(--landing-camel)_140%)]">
                <Heart className="absolute bottom-3.5 left-4 size-11 text-landing-surface opacity-85" fill="currentColor" strokeWidth={1.6} />
              </div>
              <p className="mt-4 text-[0.95rem] leading-relaxed">
                Jusqu&apos;au canapé, sans tomber <em className="font-display italic text-primary">une seule fois</em>. Mamie va être fière. 🎉
              </p>
              <p className="mt-4 flex items-center gap-1.5 text-sm text-landing-muted">
                <Heart className="size-3.5 text-primary" fill="currentColor" />
                Vu par 4 membres de la famille
              </p>
            </article>
          </Reveal>
        </div>
      </section>

      {/* ---------- pages ---------- */}
      <section id="pages" className="mx-auto max-w-[1180px] px-4 py-14 sm:px-6 sm:py-20 lg:px-12">
        <Reveal className="mb-10 max-w-[52ch] sm:mb-14">
          <h2 className="text-balance font-display text-[clamp(1.9rem,2vw+1.3rem,2.6rem)] leading-[1.12] font-semibold">
            Un journal, quatre pages
          </h2>
          <p className="mt-3 text-lg text-landing-muted">
            Pas de fonctionnalités à apprendre — juste les moments qu&apos;une famille a envie de garder.
          </p>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2">
          {PAGES.map(({ icon: Icon, eyebrow, title, text }, i) => (
            <Reveal key={title} delay={i * 90}>
              <article className="landing-page-card group relative h-full overflow-hidden rounded-[20px] border border-landing-border bg-landing-surface p-8 transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(43,53,66,0.35)] dark:hover:shadow-[0_30px_60px_-30px_rgba(0,0,0,0.55)]">
                <div className="mb-5 flex size-11 items-center justify-center rounded-xl bg-landing-background text-primary">
                  <Icon className="size-[22px]" strokeWidth={1.8} />
                </div>
                <p className="text-sm font-medium tracking-[0.02em] text-landing-camel">{eyebrow}</p>
                <h3 className="mt-1.5 font-display text-[1.35rem] font-semibold">{title}</h3>
                <p className="mt-2.5 text-[0.98rem] leading-relaxed text-landing-muted">{text}</p>
              </article>
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
            Pas un réseau social
          </p>
          <h2 className="text-balance font-display text-[clamp(1.9rem,2vw+1.3rem,2.7rem)] font-semibold text-landing-night-foreground">
            Un journal qu&apos;on referme, le soir.
          </h2>
          <p className="mx-auto mt-5 max-w-[52ch] text-lg text-landing-night-muted">
            Pas de fil d&apos;actualité, pas d&apos;inconnus, pas de likes à collectionner.
            Le petit monde tourne sur votre propre serveur, pensé pour une seule famille à la fois — la vôtre.
          </p>
          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-landing-night-muted">
            <ShieldCheck className="size-[14px] text-landing-night-accent" />
            Hébergé par vos soins, pour votre tranquillité
          </p>
        </Reveal>
      </section>

      {/* ---------- final cta ---------- */}
      <section className="mx-auto max-w-[1180px] px-4 py-16 text-center sm:py-24 lg:px-12">
        <Reveal>
          <Heart className="mx-auto mb-5 size-8 text-landing-camel" fill="currentColor" />
          <h2 className="mx-auto max-w-[16ch] text-balance font-display text-[clamp(2rem,2.6vw+1rem,3rem)] font-semibold">
            La première page vous attend.
          </h2>
          <p className="mx-auto mt-4 max-w-[44ch] text-lg text-landing-muted">
            Ajoutez votre bébé, invitez la famille, et laissez le journal s&apos;écrire au fil des jours.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/login"
              className={cn(buttonVariants({ size: "lg" }), "h-11 rounded-full px-6 text-base")}
            >
              Commencer le journal
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
