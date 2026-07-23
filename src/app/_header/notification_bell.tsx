'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Bell, Settings2, ArrowLeft, Smartphone, Trash2, Moon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { TimePicker } from '@/components/ui/time-picker'
import InstallCard from '@/components/install-card'
import { cn } from '@utils/utils'
import { usePushSubscription } from '@utils/hooks/use-push-subscription'
import { Tables, Enums } from '@utils/supabase/database.types'
import { getBabiesList } from '@utils/actions/baby'
import { getUserAccess } from '@utils/actions/users'
import {
  getMyNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  getMyDevices,
  removeDevice,
  getDisabledNotificationTypes,
  setNotificationPreference,
  getQuietHours,
  setQuietHours,
} from '@utils/actions/notifications'

const NOTIFICATION_LABELS: Record<Enums<'notification_type'>, string> = {
  new_post: 'Nouvelles publications',
  new_comment: 'Nouveaux commentaires',
  new_pronostic: 'Nouveaux pronostics',
  new_member: 'Nouveaux membres',
  new_reaction: 'Réactions sur vos publications',
  new_milestone: 'Nouvelles étapes du calendrier',
}
const ADMIN_ONLY_TYPES: Enums<'notification_type'>[] = ['new_member']
const ALL_TYPES = Object.keys(NOTIFICATION_LABELS) as Enums<'notification_type'>[]
const ENABLE_PROMPT_DISMISSED_KEY = 'notif-enable-prompt-dismissed'

type Device = { id: number; device_label: string | null; created_at: string; last_seen_at: string }

export default function NotificationBell() {
  const params = useParams<{ babyId?: string }>()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'list' | 'settings'>('list')
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<Tables<'notifications'>[]>([])
  const [devices, setDevices] = useState<Device[]>([])
  const [disabledTypes, setDisabledTypes] = useState<Set<Enums<'notification_type'>>>(new Set())
  const [quietStart, setQuietStart] = useState('')
  const [quietEnd, setQuietEnd] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [babyId, setBabyId] = useState<string | null>(null)

  const { isSupported, subscription, isPending, subscribe, unsubscribe } = usePushSubscription()

  useEffect(() => {
    getUnreadNotificationCount().then(setUnreadCount)
  }, [])

  // One-time soft nudge, not the native browser permission dialog: shown at
  // most once per browser (localStorage flag set as soon as it's shown,
  // regardless of what the user does with it) so it never nags. Skipped
  // entirely if the user already said no at the OS/browser level.
  useEffect(() => {
    if (!isSupported || subscription) return
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return
    if (localStorage.getItem(ENABLE_PROMPT_DISMISSED_KEY)) return

    const timeout = setTimeout(() => {
      localStorage.setItem(ENABLE_PROMPT_DISMISSED_KEY, '1')
      toast('Activez les notifications', {
        description: 'Soyez averti des nouvelles publications, commentaires et pronostics.',
        action: { label: 'Activer', onClick: () => subscribe() },
        duration: 15000,
      })
    }, 2000)

    return () => clearTimeout(timeout)
  }, [isSupported, subscription, subscribe])

  // No baby switcher here: falls back to the caller's first baby when not
  // browsing a /baby/[babyId] route (e.g. from /settings). Fine for the
  // common single-baby-per-family case this app is built around.
  useEffect(() => {
    async function resolveBabyId() {
      if (params.babyId) return params.babyId
      const babies = await getBabiesList()
      return babies[0]?.id ?? null
    }
    resolveBabyId().then((id) => {
      setBabyId(id)
      if (!id) return
      getUserAccess(id).then((access) => setIsAdmin(!Array.isArray(access) && access.access_level === 'admin'))
      getDisabledNotificationTypes(id).then((types) => setDisabledTypes(new Set(types)))
    })
  }, [params.babyId])

  useEffect(() => {
    if (!open) return
    if (view === 'list') {
      getMyNotifications(20).then(setNotifications)
    } else {
      getMyDevices().then(setDevices)
      getQuietHours().then((qh) => {
        setQuietStart(qh?.quiet_hours_start?.slice(0, 5) ?? '')
        setQuietEnd(qh?.quiet_hours_end?.slice(0, 5) ?? '')
      })
    }
  }, [open, view])

  async function handleOpenNotification(notif: Tables<'notifications'>) {
    if (!notif.read_at) {
      await markNotificationRead(notif.id)
      setUnreadCount((c) => Math.max(0, c - 1))
      setNotifications((list) =>
        list.map((n) => (n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n))
      )
    }
    setOpen(false)
    if (notif.url) router.push(notif.url)
  }

  async function handleMarkAllRead() {
    if (!babyId) return
    await markAllNotificationsRead(babyId)
    setUnreadCount(0)
    setNotifications((list) => list.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
  }

  async function togglePreference(type: Enums<'notification_type'>) {
    if (!babyId) return
    const nowEnabled = disabledTypes.has(type)
    await setNotificationPreference(babyId, type, nowEnabled)
    setDisabledTypes((prev) => {
      const next = new Set(prev)
      if (nowEnabled) next.delete(type)
      else next.add(type)
      return next
    })
  }

  async function handleRemoveDevice(id: number) {
    await removeDevice(id)
    setDevices((list) => list.filter((d) => d.id !== id))
  }

  async function handleSaveQuietHours() {
    await setQuietHours(quietStart || null, quietEnd || null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted transition-colors outline-none cursor-pointer">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 mt-2 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="font-display text-sm font-semibold">
            {view === 'list' ? 'Notifications' : 'Réglages'}
          </p>
          <div className="flex items-center gap-1">
            {view === 'list' && notifications.some((n) => !n.read_at) && (
              <Button variant="ghost" size="sm" className="text-xs cursor-pointer" onClick={handleMarkAllRead}>
                Tout lire
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              className="cursor-pointer"
              onClick={() => setView(view === 'list' ? 'settings' : 'list')}
            >
              {view === 'list' ? <Settings2 className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {view === 'list' ? (
          <div className="flex flex-col gap-1">
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Rien de nouveau.</p>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleOpenNotification(notif)}
                  className={cn(
                    'flex flex-col gap-0.5 rounded-2xl px-3 py-2 text-left text-sm transition-colors cursor-pointer hover:bg-muted',
                    !notif.read_at && 'bg-primary/5'
                  )}
                >
                  <span className="font-medium">{notif.title}</span>
                  <span className="text-xs text-muted-foreground">{notif.body}</span>
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-muted-foreground">Cet appareil</p>
              {!isSupported ? (
                <InstallCard
                  title="Installez l'application"
                  description="Sur iPhone, les notifications ne sont disponibles qu'une fois le journal installé sur l'écran d'accueil."
                />
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant={subscription ? 'outline' : 'default'}
                  className="cursor-pointer"
                  onClick={subscription ? unsubscribe : subscribe}
                  disabled={isPending}
                >
                  {subscription ? 'Désactiver les notifications' : 'Activer les notifications'}
                </Button>
              )}
            </div>

            {devices.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Appareils enregistrés</p>
                {devices.map((device) => (
                  <div key={device.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 truncate">
                      <Smartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      {device.device_label ?? 'Appareil inconnu'}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 cursor-pointer"
                      onClick={() => handleRemoveDevice(device.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {babyId && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-muted-foreground">Me notifier pour</p>
                {ALL_TYPES.filter((type) => isAdmin || !ADMIN_ONLY_TYPES.includes(type)).map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!disabledTypes.has(type)}
                      onChange={() => togglePreference(type)}
                      className="cursor-pointer"
                    />
                    {NOTIFICATION_LABELS[type]}
                  </label>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Moon className="h-3.5 w-3.5" /> Heures silencieuses
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0 w-3">De</span>
                <TimePicker value={quietStart || undefined} onChange={setQuietStart} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground shrink-0 w-3">à</span>
                <TimePicker value={quietEnd || undefined} onChange={setQuietEnd} />
                <Button size="sm" variant="outline" className="shrink-0 cursor-pointer ml-auto" onClick={handleSaveQuietHours}>
                  OK
                </Button>
              </div>
            </div>

            <Link href="/settings" className="text-xs text-primary hover:underline text-center">
              Plus de réglages
            </Link>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
