'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlbumWithDetails, assignPhotoToAlbum, createAlbum } from '@utils/actions/albums'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, FolderPlus, X } from 'lucide-react'

export default function AssignToAlbumModal({
  babyId,
  photoId,
  albums,
  onClose,
}: {
  babyId: string
  photoId: string
  albums: AlbumWithDetails[]
  onClose: () => void
}) {
  const router = useRouter()
  const t = useTranslations('albums.assignToAlbumForm')

  const [existingAlbumId, setExistingAlbumId] = useState<string>("")
  const [newAlbumName, setNewAlbumName] = useState("")
  const [isPending, setIsPending] = useState(false)

  const albumItems = Object.fromEntries(albums.map((album) => [album.id, album.name]))

  const handleAddToExisting = async () => {
    if (!existingAlbumId) return
    setIsPending(true)
    try {
      await assignPhotoToAlbum(photoId, existingAlbumId, babyId)
      onClose()
      router.refresh()
    } catch (err) {
      console.error(err)
      alert(t('error'))
    } finally {
      setIsPending(false)
    }
  }

  const handleCreateAndAdd = async () => {
    if (!newAlbumName.trim()) return
    setIsPending(true)
    try {
      const albumId = crypto.randomUUID()
      await createAlbum(albumId, babyId, newAlbumName.trim(), [])
      await assignPhotoToAlbum(photoId, albumId, babyId)
      onClose()
      router.refresh()
    } catch (err) {
      console.error(err)
      alert(t('error'))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 animate-in fade-in-0 duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] bg-landing-surface text-landing-foreground shadow-2xl rounded-3xl overflow-hidden flex flex-col border border-landing-border animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b border-landing-border py-4 px-5">
          <h2 className="font-display text-base font-semibold flex items-center gap-2">
            <FolderPlus className="h-4.5 w-4.5 text-primary" />
            {t('title')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-landing-background rounded-lg text-landing-muted hover:text-landing-foreground transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {albums.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('existingLabel')}
              </Label>
              <div className="flex items-center gap-2">
                <Select
                  items={albumItems}
                  value={existingAlbumId}
                  onValueChange={(value) => setExistingAlbumId(value as string)}
                >
                  <SelectTrigger className="flex-1 text-foreground bg-input/50">
                    <SelectValue placeholder={t('existingPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {albums.map((album) => (
                        <SelectItem key={album.id} value={album.id}>{album.name}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <Button
                  className="rounded-2xl cursor-pointer shrink-0"
                  disabled={!existingAlbumId || isPending}
                  onClick={handleAddToExisting}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('add')}
                </Button>
              </div>
            </div>
          )}

          {albums.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-landing-border" />
              {t('orDivider')}
              <div className="h-px flex-1 bg-landing-border" />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('newAlbumLabel')}
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                placeholder={t('newAlbumPlaceholder')}
                className="flex-1 border border-transparent bg-input/50 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:ring-3 focus:ring-ring/30 focus:border-ring placeholder:text-muted-foreground transition-[color,box-shadow] duration-200"
              />
              <Button
                variant="outline"
                className="rounded-2xl cursor-pointer shrink-0"
                disabled={!newAlbumName.trim() || isPending}
                onClick={handleCreateAndAdd}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t('createAndAdd')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
