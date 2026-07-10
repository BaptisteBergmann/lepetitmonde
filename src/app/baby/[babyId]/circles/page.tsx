import { sendInvite } from "@utils/actions/invite";
import CreateCircle from "./_components/create_circle";
import RealtimeCirclesList from "./_components/display_circles";
import { getCircles } from "@utils/actions/circles";
import CreateInvite from "./_components/create_invite";

export default async function InviteForm({
  searchParams,
}: {
  searchParams: Promise<{ babyId?: string }>;
}) {
  const params = await searchParams;
  const babyId = params.babyId;
  return (
    <div> Baby: {babyId}
      <form action={sendInvite} className="flex flex-col gap-4 p-4 border rounded">
        <h2 className="text-xl font-bold">Inviter un proche</h2>
        <input type="hidden" name="babyId" value={babyId} />

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
      <CreateInvite babyId={babyId}></CreateInvite>
      <RealtimeCirclesList babyId={babyId} initialCircles={await getCircles(babyId)}></RealtimeCirclesList>
      <CreateCircle babyId={babyId}></CreateCircle>
    </div>
  )
}
