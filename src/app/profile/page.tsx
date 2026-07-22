import Link from 'next/link'

export default async function Profile() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-landing-background text-landing-foreground">
      <Link href="/settings" className="text-primary underline-offset-4 hover:underline">
        Paramètres
      </Link>
      bonjour
    </div>
  );
}
