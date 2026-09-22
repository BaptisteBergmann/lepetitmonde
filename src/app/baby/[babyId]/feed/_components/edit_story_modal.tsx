'use client'

import { Modal } from '@/components/modal'
import { toast } from 'sonner'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { updateStory, StoryWithUrl } from '@utils/actions/stories'
import { Tables } from '@utils/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Pencil } from 'lucide-react'

type Circle = Tables<'circles'>

export default function EditStoryModal({
  babyId,
  story,
  circles,
  existingGroupLabels,
  onClose,
  onSaved,
}: {
  babyId: string
  story: StoryWithUrl
  circles: Circle[]
  existingGroupLabels: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const t = useTranslations('feed.storyForm')
  const tShared = useTranslations('feed.postForm')

  const [caption, setCaption] = useState(story.caption ?? "")
  const [groupLabel, setGroupLabel] = useState(story.group_label ?? "")
  const [circleIds, setCircleIds] = useState<string[]>(story.circleIds)
  const [isPending, setIsPending] = useState(false)

  const circleItems = useMemo(
    () => Object.fromEntries(circles.map((circle) => [circle.id, circle.name])),
    [circles]
  )

  const handleConfirm = async () => {
    setIsPending(true)
    try {
      await updateStory(story.id, babyId, {
        caption: caption || null,
        groupLabel: groupLabel.trim() || null,
      }, circleIds)

      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      toast.error(t('editError'))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Modal onClose={onClose} title={<><Pencil className="h-4.5 w-4.5 text-primary" />{t('editTitle')}</>}>
      <div className="p-5 space-y-4 flex-1 overflow-y-auto">

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="story-edit-caption" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {tShared('captionLabel')}
          </Label>
          <textarea
            id="story-edit-caption"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={2}
            className="w-full border border-transparent bg-input/50 rounded-2xl p-3 text-base md:text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground resize-none transition-[color,box-shadow] duration-200"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="story-edit-group" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('groupLabel')}
          </Label>
          <input
            type="text"
            id="story-edit-group"
            list="story-edit-group-labels"
            value={groupLabel}
            onChange={(e) => setGroupLabel(e.target.value)}
            placeholder={t('groupPlaceholder')}
            className="w-full border border-transparent bg-input/50 rounded-2xl px-3 py-2 text-base md:text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground transition-[color,box-shadow] duration-200"
          />
          <datalist id="story-edit-group-labels">
            {existingGroupLabels.map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">
            {t('groupHint')}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {tShared('visibleByLabel')}
          </Label>
          <Select
            items={circleItems}
            multiple
            value={circleIds}
            onValueChange={(value) => setCircleIds(value as string[])}
          >
            <SelectTrigger className="w-full text-foreground bg-input/50">
              <SelectValue placeholder={t('visibleByPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {circles.map((circle) => (
                  <SelectItem key={circle.id} value={circle.id}>{circle.name}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('visibleByHint')}
          </p>
        </div>

      </div>

      <div className="border-t border-landing-border bg-landing-background flex justify-end gap-2 items-center px-5 py-3.5">
        <Button
          variant="outline"
          className="rounded-2xl cursor-pointer"
          onClick={onClose}
        >
          {tShared('cancel')}
        </Button>
        <Button
          disabled={isPending}
          className="rounded-2xl cursor-pointer"
          onClick={handleConfirm}
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{tShared('saving')}</span>
            </>
          ) : (
            <span>{tShared('save')}</span>
          )}
        </Button>
      </div>
    </Modal>
  )
}
