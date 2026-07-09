import { sendInvite } from "@/src/utils/actions/invite";
import CreateCircle from "./_components/create_circle";
import RealtimeCirclesList from "./_components/display_circles";
import { getCircles } from "@/src/utils/actions/circles/circles";
import CreateInvite from "./_components/create_invite";

export default async function InviteForm({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const params = await searchParams;
  const projectId = params.projectId;
  return (
    <div> Project: {projectId}
      <form action={sendInvite} className="flex flex-col gap-4 p-4 border rounded">
        <h2 className="text-xl font-bold">Inviter un proche</h2>
        <input type="hidden" name="projectId" value={projectId} />

        <input
          name="email"
          type="email"
          placeholder="email@famille.com"
          required
          className="p-2 border rounded"
        />

        <button
          type="submit"
          className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
        >
          Envoyer l'invitation
        </button>
      </form>
      <CreateInvite projectId={projectId}></CreateInvite>
      <RealtimeCirclesList projectId={projectId} initialCircles={await getCircles(projectId)}></RealtimeCirclesList>
      <CreateCircle projectId={projectId}></CreateCircle>
    </div>
  )
}
