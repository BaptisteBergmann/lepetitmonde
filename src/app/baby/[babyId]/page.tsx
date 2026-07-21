import { getBaby } from "@utils/actions/baby";
import { getUserAccess } from "@utils/actions/users";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sparkles, Users, CalendarDays, Images } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

const SECTIONS = [
  {
    id: "guess",
    name: "Pronostics",
    description: "Devinez le prénom, la date, le poids... et comparez vos réponses.",
    role: "viewer" as const,
    icon: Sparkles,
    tone: "bg-primary",
  },
  {
    id: "calendar",
    name: "Calendrier",
    description: "Consultez les événements et jalons de bébé, passés et à venir.",
    role: "viewer" as const,
    icon: CalendarDays,
    tone: "bg-sage",
  },
  {
    id: "feed",
    name: "Journal",
    description: "Photos, réactions et commentaires partagés en famille.",
    role: "viewer" as const,
    icon: Images,
    tone: "bg-amber-400",
  },
  {
    id: "admin",
    name: "Administration",
    description: "Gérez qui a accès au journal et organisez les cercles de partage.",
    role: "admin" as const,
    icon: Users,
    tone: "bg-rose",
  },
];

export default async function BabyPage({
  params,
}: {
  params: Promise<{ babyId: string }>;
}) {
  const { babyId } = await params;
  const baby = await getBaby(babyId);
  const access = await getUserAccess(babyId);
  const accessLevel = !Array.isArray(access) ? access?.access_level : undefined;

  if (!("baby_surname" in baby)) {
    notFound();
  }

  const sections = SECTIONS.filter(
    (section) => accessLevel === "admin" || accessLevel === section.role
  );

  return (
    <div className="relative w-full max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative flex flex-col items-center text-center gap-2 pb-2">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-bold">
          {baby.baby_surname.charAt(0).toUpperCase()}
        </span>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          Le journal de {baby.baby_surname}
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-xs">
          Doucement, sans bruit. Choisissez une section à consulter.
        </p>
      </div>

      {sections.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Rien à afficher pour l&apos;instant</CardTitle>
            <CardDescription>
              Aucune section n&apos;est encore disponible avec votre niveau d&apos;accès.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {sections.map(({ id, name, description, icon: Icon, tone }) => (
            <Link key={id} href={`/baby/${babyId}/${id}`}>
              <Card className="flex-row items-center gap-4 px-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary-foreground ${tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold">{name}</div>
                  <div className="text-sm text-muted-foreground">{description}</div>
                </div>
                <span className="text-muted-foreground text-xl" aria-hidden>
                  ›
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
