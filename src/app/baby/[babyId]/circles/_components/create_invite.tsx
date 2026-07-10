"use client"

import { generateShortLivedLink } from "@utils/actions/invite";

export default function CreateInvite({ babyId }: { babyId: string }) {
  return (
    <div>
      <button onClick={() => generateShortLivedLink(babyId)}>
        <h2 className="text-xl font-bold">Creer une invitation</h2>
      </button>
    </div>
  )
}
