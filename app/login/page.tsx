// app/login/page.tsx
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  // On indique à TypeScript que searchParams est maintenant une Promesse
  searchParams: Promise<{ message?: string }>
}) {
  // On "déballe" la promesse de manière asynchrone (Nouveauté Next.js 15)
  const params = await searchParams

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
          Journal de Bébé 👶
        </h1>

        <form className="flex flex-col gap-4">
          {/* On utilise maintenant 'params.message' au lieu de 'searchParams.message' */}
          {params?.message && (
            <p className="p-3 bg-red-100 text-red-700 text-sm rounded-md text-center">
              {params.message}
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">
              Courriel
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="papy@exemple.com"
              className="border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            formAction={login}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md mt-4 transition-colors"
          >
            Se connecter
          </button>
        </form>
      </div>
    </div>
  )
}
