import { getBabiesList } from "@utils/actions/baby";
import { createClient } from "@utils/supabase/server";
import { logger } from "@/utils/logger";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";

export default async function Home() {
  const contextLogger = logger.child({ function: Home.name });
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    contextLogger.warn("No authenticated user on home page");
  }

  const firstName = user?.user_metadata?.full_name?.split(/\s+/)[0] || "";
  const babies = await getBabiesList();

  return (
    <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="border-b border-border pb-6">
        <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-primary via-primary/80 to-purple-600 bg-clip-text text-transparent flex items-center gap-2">
          👋 {firstName ? `Bonjour, ${firstName}` : "Bonjour"}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-xl">
          Choisissez un bébé pour accéder à son journal.
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
        <div className="grid gap-4 sm:grid-cols-2">
          {babies.map((baby) => (
            <Link key={baby.id} href={`/baby/${baby.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle>{baby.baby_surname}</CardTitle>
                  <CardDescription>Voir le journal</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
