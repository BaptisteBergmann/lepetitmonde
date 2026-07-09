import { SignupForm } from "../components/signup-form"

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
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <div className="max-w-md space-y-4">
          <h1 className="text-2xl font-bold text-red-600">Lien d'invitation invalide</h1>
          <p className="text-muted-foreground">
            Vous devez utiliser un lien d'invitation valide contenant un jeton sécurisé pour pouvoir créer un compte et rejoindre le Journal de Bébé.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="w-full max-w-sm md:max-w-4xl">
        <SignupForm token={token} />
      </div>
    </div>
  )
}

