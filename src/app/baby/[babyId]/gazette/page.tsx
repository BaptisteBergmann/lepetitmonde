import { getBaby } from "@/utils/actions/baby";
import { getUserAccess } from "@/utils/actions/users";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper } from "lucide-react";
import { Reveal } from "@components/reveal";
import Link from "next/link";

export default async function GazettePage({
  params,
}: {
  params: Promise<{ babyId: string }>
}) {
  const { babyId } = await params;

  const [access, baby] = await Promise.all([
    getUserAccess(babyId),
    getBaby(babyId),
  ]);

  if (Array.isArray(access) || Array.isArray(baby)) return null;

  const lastSentLabel = baby.last_gazette_sent_at
    ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(baby.last_gazette_sent_at))
    : "Pas encore envoyée";

  return (
    <div className="bg-landing-background text-landing-foreground">
      <div className="relative mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16 space-y-8">
        <Reveal className="relative flex flex-col items-center gap-2 pb-2 text-center">
          <p className="text-xs font-semibold tracking-[0.16em] text-landing-camel uppercase">
            Page — La Gazette
          </p>
          <h1 className="font-display text-2xl font-semibold sm:text-3xl">
            La Gazette
          </h1>
          <p className="max-w-md text-sm text-landing-muted sm:text-base">
            Un résumé par email des nouvelles publications de {baby.baby_surname}, envoyé chaque semaine aux membres du journal.
          </p>
        </Reveal>

        <Card className="border-landing-border bg-landing-surface">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
              <Newspaper className="h-4.5 w-4.5 text-primary" />
              Dernier envoi
            </CardTitle>
            <CardDescription className="text-xs text-landing-muted">
              {lastSentLabel}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-landing-muted">
            Vous pouvez désactiver ces emails depuis vos{" "}
            <Link href="/settings" className="underline hover:text-landing-foreground">
              réglages de notifications
            </Link>.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
