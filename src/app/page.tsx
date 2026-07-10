import { getBabiesList } from "@utils/actions/baby";

export default async function Home() {
  const babies = await getBabiesList();
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      hello
      {babies.map((p) => (
        <div key={p.id}> {/* Toujours ajouter une clé unique ! */}
          {p.baby_name}
        </div>
      ))}
    </div>
  );
}
