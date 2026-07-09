import { getProjectsList } from "@utils/actions/project";

export default async function Home() {
  const projects = await getProjectsList();
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      hello
      {projects.map((p) => (
        <div key={p.id}> {/* Toujours ajouter une clé unique ! */}
          {p.project_name}
        </div>
      ))}
    </div>
  );
}
