"use client"

import { generateShortLivedLink } from "@/src/utils/actions/invite";

export default function CreateInvite({ projectId }: { projectId: string }) {
  return (
    <div>
      <button onClick={() => generateShortLivedLink(projectId)}>
        <h2 className="text-xl font-bold">Creer une invitation</h2>
      </button>
    </div>
  )
}
