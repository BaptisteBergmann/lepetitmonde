export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center bg-landing-background text-landing-foreground px-6 py-12 md:px-10 md:py-16">
      <div className="w-full max-w-sm md:max-w-4xl">
        {children}
      </div>
    </div>
  )
}
