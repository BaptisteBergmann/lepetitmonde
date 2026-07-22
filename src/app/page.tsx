import { getBabiesList } from "@utils/actions/baby";
import { createClient } from "@utils/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";
import { cn } from "@utils/utils";
import Landing from "./_home/landing";

const AVATAR_TONES = ["bg-primary", "bg-rose", "bg-sage"];

export default async function Home() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <Landing />;
  }

  const firstName = user?.user_metadata?.full_name?.split(/\s+/)[0] || "";
  const babies = await getBabiesList();

  return (
    <div className="relative w-full max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative flex flex-col items-center text-center gap-2 pb-2">
        <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-primary">
          <path
            d="M15.5 3.5c-4.6 0-8.3 3.7-8.3 8.3s3.7 8.3 8.3 8.3c1.6 0 3.1-.45 4.35-1.25-.9.25-1.85.4-2.85.4-5 0-9-4-9-9 0-3.35 1.8-6.25 4.5-7.8-.6-.1-1.3-.15-2-.15z"
            fill="currentColor"
          />
        </svg>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
          {firstName ? `Tout va bien, ${firstName}.` : "Tout va bien."}
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base max-w-xs">
          Un écran doux pour ne réveiller personne. Choisissez qui consulter.
        </p>
      </div>

      {babies.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Aucun bébé pour l&apos;instant</CardTitle>
            <CardDescription>
              Vous n&apos;avez encore accès à aucun profil de bébé.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {babies.map((baby, index) => (
            <Link key={baby.id} href={`/baby/${baby.id}`}>
              <Card className="flex-row items-center gap-4 px-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary-foreground font-bold",
                    AVATAR_TONES[index % AVATAR_TONES.length]
                  )}
                >
                  {baby.baby_surname.charAt(0).toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold">{baby.baby_surname}</div>
                  <div className="text-sm text-muted-foreground">Voir le journal</div>
                </div>
                <span className="text-muted-foreground text-xl" aria-hidden>
                  ›
                </span>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <p className="relative text-center text-xs text-muted-foreground pt-2">
        Bonne nuit, à tout à l&apos;heure 🌙
      </p>
    </div>
  );
}
