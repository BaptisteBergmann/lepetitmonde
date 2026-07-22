import { SignupForm } from "@components/signup-form"

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  // On attend et on récupère les paramètres de l'URL
  const params = await searchParams
  const token = params.token

  if (!token) {
    return (
      <div className="max-w-md space-y-4 text-center mx-auto">
        <h1 className="font-display text-2xl font-semibold text-destructive">Lien d'invitation invalide</h1>
        <p className="text-muted-foreground">
          Vous devez utiliser un lien d'invitation valide contenant un jeton sécurisé pour pouvoir créer un compte et rejoindre Le petit monde.
        </p>
      </div>
    )
  }

  return <SignupForm token={token} />
}

