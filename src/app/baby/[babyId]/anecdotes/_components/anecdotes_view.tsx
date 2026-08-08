'use client'

import { useState } from 'react'
import { Tables } from '@utils/supabase/database.types'
import { AnecdoteWithDetails, getAnecdotes } from '@utils/actions/anecdotes'
import { Button } from '@/components/ui/button'
import { Loader2, Plus } from 'lucide-react'
import AnecdoteCard from './anecdote_card'
import CreateAnecdoteModal from './create_anecdote_modal'

type Circle = Tables<'circles'>

export default function AnecdotesView({
  babyId,
  isAdmin,
  circles,
  initialAnecdotes,
  pageSize,
}: {
  babyId: string
  isAdmin: boolean
  circles: Circle[]
  initialAnecdotes: AnecdoteWithDetails[]
  pageSize: number
}) {
  const [anecdotes, setAnecdotes] = useState<AnecdoteWithDetails[]>(initialAnecdotes)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(initialAnecdotes.length === pageSize)
  const [createOpen, setCreateOpen] = useState(false)

  const loadMore = async () => {
    if (anecdotes.length === 0) return
    setLoadingMore(true)
    try {
      const last = anecdotes[anecdotes.length - 1]
      const before = { happenedAt: last.happened_at, createdAt: last.created_at }
      const next = await getAnecdotes(babyId, { limit: pageSize, before })
      setAnecdotes((prev) => [...prev, ...next])
      setHasMore(next.length === pageSize)
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="relative space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button className="gap-2 rounded-2xl cursor-pointer" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            <span>Nouvelle anecdote</span>
          </Button>
        </div>
      )}

      {anecdotes.length === 0 && (
        <p className="text-sm text-landing-muted text-center py-12">
          Aucune anecdote pour l&apos;instant.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {anecdotes.map((anecdote) => (
          <AnecdoteCard
            key={anecdote.id}
            babyId={babyId}
            anecdote={anecdote}
            circles={circles}
            isAdmin={isAdmin}
          />
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            className="gap-2 rounded-2xl cursor-pointer"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>Charger plus</span>
          </Button>
        </div>
      )}

      {createOpen && (
        <CreateAnecdoteModal
          babyId={babyId}
          circles={circles}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  )
}
