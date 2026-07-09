import { createCircle } from "@utils/actions/circles";

export default async function CreateCircle({ projectId }: { projectId: string }) {
  return (
    <div>
      <form action={createCircle} className="flex flex-col gap-4 p-4 border rounded">
        <h2 className="text-xl font-bold">Creer un cercle</h2>
        <input type="hidden" name="projectId" value={projectId} />

        <input
          name="name"
          type="text"
          placeholder="Family"
          required
          className="p-2 border rounded"
        />

        <button
          type="submit"
          className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
        >
        </button>
      </form>
    </div>
  )
}
