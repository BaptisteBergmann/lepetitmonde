'use client'

import { toast } from 'sonner'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { addComment } from '@utils/actions/comments'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Send } from 'lucide-react'

export default function CommentInput({
  postId,
  babyId,
  onAdded,
}: {
  postId: string
  babyId: string
  onAdded: () => void
}) {
  const t = useTranslations('feed.comments')
  const tA11y = useTranslations('a11y')
  const [body, setBody] = useState("")
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async () => {
    const trimmed = body.trim()
    if (!trimmed || isPending) return

    setIsPending(true)
    try {
      await addComment(postId, babyId, trimmed)
      setBody("")
      onAdded()
    } catch (err) {
      console.error(err)
      toast.error(t('sendError'))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
        placeholder={t('inputPlaceholder')}
        className="flex-1"
      />
      <Button
        aria-label={tA11y('send')}
        size="icon"
        variant="outline"
        className="rounded-2xl cursor-pointer shrink-0"
        onClick={handleSubmit}
        disabled={!body.trim() || isPending}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  )
}
