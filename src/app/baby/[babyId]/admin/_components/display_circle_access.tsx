"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Tables } from "@utils/supabase/database.types";
import { AlbumSummary } from "@utils/actions/albums";
import { ancestorsOrSelf, orderAsTree } from "@utils/circle-tree";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Images as ImagesIcon } from "lucide-react";

type Circle = Tables<'circles'>;

interface DisplayCircleAccessProps {
  babyId: string;
  circles: Circle[];
  albums: AlbumSummary[];
}

export default function DisplayCircleAccess({ babyId, circles, albums }: DisplayCircleAccessProps) {
  const t = useTranslations('admin.groupAccess');
  const tPicker = useTranslations('circlePicker');
  const tAlbums = useTranslations('albums');
  const [selectedCircleId, setSelectedCircleId] = useState<string>("");

  const orderedCircles = useMemo(() => orderAsTree(circles), [circles]);

  // A group also sees albums shared with any wider circle above it.
  const reachedCircleIds = selectedCircleId ? ancestorsOrSelf([selectedCircleId], circles) : new Set<string>();
  const visibleAlbums = selectedCircleId
    ? albums.filter((album) => album.circleIds.some((id) => reachedCircleIds.has(id)))
    : [];
  const circleName = (id: string) => circles.find((c) => c.id === id)?.name ?? '';
  // Name of the wider circle an album is only visible through, if any.
  const viaCircle = (album: AlbumSummary) =>
    album.circleIds.includes(selectedCircleId)
      ? null
      : circleName(album.circleIds.find((id) => reachedCircleIds.has(id)) ?? '');

  return (
    <div className="px-6 pb-2 space-y-3">
      <Select value={selectedCircleId} onValueChange={(value) => setSelectedCircleId(value ?? "")}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t('selectPlaceholder')} />
        </SelectTrigger>
        <SelectContent>
          {orderedCircles.map((circle) => (
            <SelectItem key={circle.id} value={circle.id} className={circle.depth === 1 ? "pl-6" : circle.depth >= 2 ? "pl-10" : undefined}>
              {circle.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!selectedCircleId ? (
        <p className="text-sm text-landing-muted text-center py-6">{t('empty')}</p>
      ) : visibleAlbums.length === 0 ? (
        <p className="text-sm text-landing-muted text-center py-6">{t('noAlbums')}</p>
      ) : (
        <div className="divide-y divide-landing-border">
          {visibleAlbums.map((album) => (
            <Link
              key={album.id}
              href={`/baby/${babyId}/albums/${album.id}`}
              className="flex items-center gap-3 py-2.5 hover:opacity-80 transition-opacity"
            >
              <div className="relative size-10 shrink-0 rounded-lg overflow-hidden bg-landing-background flex items-center justify-center">
                {album.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={album.coverUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImagesIcon className="h-4 w-4 text-landing-muted" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-landing-foreground truncate">{album.name}</p>
                <p className="text-xs text-landing-muted">
                  {tAlbums('photoCount', { count: album.photoCount })}
                  {viaCircle(album) && ` · ${tPicker('includedVia', { name: viaCircle(album) ?? '' })}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
