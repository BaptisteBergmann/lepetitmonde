'use client'

import { useTodoLive } from './use_todo_live'

// Renders nothing: keeps the lists index in sync with other admins' changes.
export default function TodoLive({ babyId }: { babyId: string }) {
  useTodoLive(babyId)
  return null
}
