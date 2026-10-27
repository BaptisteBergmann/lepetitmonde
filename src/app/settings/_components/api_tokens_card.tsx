'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useLocale, useTranslations } from 'next-intl'
import { format, formatDistanceToNow } from 'date-fns'
import { Check, Copy, KeyRound, Loader2, TriangleAlert } from 'lucide-react'
import { getDateFnsLocale } from '@utils/formatting'
import { createApiToken, revokeApiToken, type ApiTokenSummary } from '@utils/actions/api_tokens'
import { revokeOAuthGrant, type OAuthConnectionSummary } from '@utils/actions/oauth_grants'
import { API_TOKEN_EXPIRY_DAYS, INPUT_LIMITS } from '@/utils/input-limits'
import { ChoiceGroup } from '@/components/choice_group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

type Expiry = (typeof API_TOKEN_EXPIRY_DAYS)[number] | null
// 90 days first: the safer default, offered before "never".
const EXPIRY_OPTIONS: Expiry[] = [90, 30, null]
const expiryToValue = (e: Expiry) => (e === null ? 'never' : String(e))
const valueToExpiry = (v: string): Expiry => (v === 'never' ? null : (Number(v) as Expiry))

// canCreate is false for someone no longer admin of any baby: they keep the card
// to revoke leftover tokens, but createApiToken would refuse them.
export default function ApiTokensCard({
  tokens,
  connections,
  canCreate,
}: {
  tokens: ApiTokenSummary[]
  connections: OAuthConnectionSummary[]
  canCreate: boolean
}) {
  const t = useTranslations('settingsPage.apiTokens')
  const locale = useLocale()
  const dateFnsLocale = getDateFnsLocale(locale)
  const [isCreating, startCreateTransition] = useTransition()
  const [name, setName] = useState('')
  const [expiry, setExpiry] = useState<Expiry>(90)
  // The token only ever lives here, and is dropped when the reveal dialog closes.
  const [revealedToken, setRevealedToken] = useState<string | null>(null)
  const [tokenToRevoke, setTokenToRevoke] = useState<ApiTokenSummary | null>(null)
  const [connectionToRevoke, setConnectionToRevoke] = useState<OAuthConnectionSummary | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const nameInputId = useId()

  const limitReached = tokens.length >= INPUT_LIMITS.apiTokenMaxActive

  function expiryLabel(value: Expiry) {
    return value === 30 ? t('expiry30') : value === 90 ? t('expiry90') : t('expiryNever')
  }

  // onSubmit instead of a form action: React resets uncontrolled fields after
  // an action, which would wipe the name on every error.
  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startCreateTransition(async () => {
      try {
        const { token } = await createApiToken(name, expiry)
        setName('')
        setRevealedToken(token)
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : t('createError'))
      }
    })
  }

  // Focus after the dialog has unmounted: focusing in the close handler loses to
  // the dialog's own focus restoration.
  const wasRevealedRef = useRef(false)
  useEffect(() => {
    if (revealedToken !== null) { wasRevealedRef.current = true; return }
    if (!wasRevealedRef.current) return
    wasRevealedRef.current = false
    const frame = requestAnimationFrame(() => nameInputRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [revealedToken])

  function closeReveal() {
    setRevealedToken(null)
  }

  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
          <KeyRound className="h-4.5 w-4.5 text-primary" aria-hidden="true" />
          {t('title')}
        </CardTitle>
        <CardDescription className="text-xs text-landing-muted">{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {connections.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-landing-muted">{t('connectionsTitle', { count: connections.length })}</h3>
            <ul className="space-y-2">
              {connections.map((connection) => (
                <li key={connection.id} className="flex items-start justify-between gap-3 rounded-2xl border border-landing-border p-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-semibold" title={connection.client_name}>{connection.client_name}</p>
                    <p className="truncate text-xs text-landing-muted" title={connection.host ?? undefined}>
                      {connection.host ?? t('connectionLocal')}
                    </p>
                    <p className="text-xs text-landing-muted">
                      {t('connectionConnectedAt', { date: format(new Date(connection.created_at), 'PP', { locale: dateFnsLocale }) })}
                    </p>
                    <p className="text-xs text-landing-muted">
                      {connection.last_used_at ? (
                        <span
                          title={format(new Date(connection.last_used_at), 'PPp', { locale: dateFnsLocale })}
                          suppressHydrationWarning
                        >
                          {t('lastUsed', { when: formatDistanceToNow(new Date(connection.last_used_at), { addSuffix: true, locale: dateFnsLocale }) })}
                        </span>
                      ) : t('neverUsed')}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 cursor-pointer text-destructive pointer-coarse:min-h-11"
                    aria-label={t('connectionRevokeAria', { name: connection.client_name })}
                    onClick={() => setConnectionToRevoke(connection)}
                  >
                    {t('connectionRevoke')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canCreate && (
          <form
            onSubmit={handleCreate}
            className={connections.length > 0 ? 'space-y-3 border-t border-landing-border pt-4' : 'space-y-3'}
          >
            <h3 className="text-xs font-semibold text-landing-muted">{t('nameSection')}</h3>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={nameInputId}>{t('nameLabel')}</FieldLabel>
                <Input
                  id={nameInputId}
                  ref={nameInputRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={INPUT_LIMITS.apiTokenName}
                  placeholder={t('namePlaceholder')}
                  autoComplete="off"
                  required
                  className="h-11"
                />
              </Field>
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium" aria-hidden="true">{t('expiryLabel')}</p>
                <ChoiceGroup
                  value={expiryToValue(expiry)}
                  onValueChange={(v) => setExpiry(valueToExpiry(v))}
                  options={EXPIRY_OPTIONS.map((value) => ({ value: expiryToValue(value), label: expiryLabel(value) }))}
                  label={t('expiryLabel')}
                  disabled={isCreating}
                />
              </div>
            </FieldGroup>
            {limitReached && (
              <p role="status" className="text-xs text-destructive">{t('limitReached')}</p>
            )}
            <Button
              type="submit"
              className="h-11 w-full gap-2 rounded-2xl cursor-pointer sm:w-auto"
              disabled={isCreating || limitReached}
              aria-busy={isCreating}
            >
              {isCreating && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {t('create')}
            </Button>
          </form>
        )}

        <div className={canCreate || connections.length > 0 ? 'border-t border-landing-border pt-4 space-y-3' : 'space-y-3'}>
          {tokens.length > 0 ? (
            <>
              <h3 className="text-xs font-semibold text-landing-muted">{t('listTitle', { count: tokens.length })}</h3>
              <ul className="space-y-2">
                {tokens.map((token) => (
                  <li key={token.id} className="flex items-start justify-between gap-3 rounded-2xl border border-landing-border p-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm font-semibold" title={token.name}>{token.name}</p>
                      <p className="text-xs text-landing-muted">
                        {t('createdAt', { date: format(new Date(token.created_at), 'PP', { locale: dateFnsLocale }) })}
                      </p>
                      <p className="text-xs text-landing-muted">
                        {token.last_used_at ? (
                          <span
                            title={format(new Date(token.last_used_at), 'PPp', { locale: dateFnsLocale })}
                            suppressHydrationWarning
                          >
                            {t('lastUsed', { when: formatDistanceToNow(new Date(token.last_used_at), { addSuffix: true, locale: dateFnsLocale }) })}
                          </span>
                        ) : t('neverUsed')}
                      </p>
                      <p className="text-xs text-landing-muted">
                        {token.expires_at
                          ? t('expiresAt', { date: format(new Date(token.expires_at), 'PP', { locale: dateFnsLocale }) })
                          : t('neverExpires')}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 cursor-pointer text-destructive pointer-coarse:min-h-11"
                      aria-label={t('revokeAria', { name: token.name })}
                      onClick={() => setTokenToRevoke(token)}
                    >
                      {t('revoke')}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="rounded-2xl border border-dashed border-landing-border p-4 text-center text-sm text-landing-muted">
              {t('empty')}
            </p>
          )}
          <p className="text-xs text-landing-muted">{t('setupHint')}</p>
        </div>
      </CardContent>

      {revealedToken !== null && <TokenRevealDialog token={revealedToken} onClose={closeReveal} />}
      {tokenToRevoke !== null && (
        <RevokeDialog
          title={t('revokeTitle', { name: tokenToRevoke.name })}
          description={t('revokeConfirm')}
          actionLabel={t('revokeAction')}
          successMessage={t('revoked')}
          errorMessage={t('revokeError')}
          onConfirm={() => revokeApiToken(tokenToRevoke.id)}
          onClose={() => setTokenToRevoke(null)}
        />
      )}
      {connectionToRevoke !== null && (
        <RevokeDialog
          title={t('connectionRevokeTitle', { name: connectionToRevoke.client_name })}
          description={t('connectionRevokeConfirm')}
          actionLabel={t('connectionRevokeAction')}
          successMessage={t('connectionRevoked')}
          errorMessage={t('connectionRevokeError')}
          onConfirm={() => revokeOAuthGrant(connectionToRevoke.id)}
          onClose={() => setConnectionToRevoke(null)}
        />
      )}
    </Card>
  )
}

function TokenRevealDialog({ token, onClose }: { token: string; onClose: () => void }) {
  const t = useTranslations('settingsPage.apiTokens')
  const warningId = useId()
  const copyTokenRef = useRef<HTMLButtonElement>(null)
  // Safe during render: this dialog only mounts after a click, never during SSR.
  const [origin] = useState(() => window.location.origin)
  const [copied, setCopied] = useState<'token' | 'url' | 'command' | null>(null)

  const serverUrl = `${origin}/api/mcp`
  const command = `claude mcp add --transport http lepetitmonde ${serverUrl} --header "Authorization: Bearer ${token}"`

  async function copy(kind: 'token' | 'url' | 'command', text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(kind)
      setTimeout(() => setCopied((current) => (current === kind ? null : current)), 2000)
    } catch {
      // iOS often rejects the clipboard after an await; the text stays selectable.
      toast.info(t('copyFailed'))
    }
  }

  return (
    // Not dismissible by outside tap or Escape (onOpenChange is ignored): the
    // token is shown once, so the only exit is the explicit button.
    <Dialog open disablePointerDismissal onOpenChange={() => {}}>
      <DialogContent showCloseButton={false} initialFocus={copyTokenRef} aria-describedby={warningId}>
        <DialogHeader>
          <DialogTitle className="font-display">{t('revealTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto">
          <div id={warningId} className="flex items-start gap-2 rounded-2xl bg-muted/50 p-3 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p className="font-medium">{t('copyOnceWarning')}</p>
          </div>

          <div className="space-y-2">
            <Input
              readOnly
              value={token}
              aria-label={t('tokenLabel')}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 font-mono text-xs"
            />
            <Button
              ref={copyTokenRef}
              type="button"
              className="h-11 w-full gap-2 rounded-2xl cursor-pointer"
              onClick={() => copy('token', token)}
            >
              {copied === 'token' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied === 'token' ? t('copied') : t('copy')}
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-landing-muted">{t('serverUrlLabel')}</p>
            <Input
              readOnly
              value={serverUrl}
              aria-label={t('serverUrlLabel')}
              onFocus={(e) => e.currentTarget.select()}
              className="h-11 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full gap-2 rounded-2xl cursor-pointer"
              onClick={() => copy('url', serverUrl)}
            >
              {copied === 'url' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied === 'url' ? t('copied') : t('copyUrl')}
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-landing-muted">{t('commandLabel')}</p>
            <pre
              tabIndex={0}
              aria-label={t('commandLabel')}
              className="whitespace-pre-wrap break-all rounded-2xl border border-landing-border bg-muted/50 p-3 font-mono text-xs"
            >
              {command}
            </pre>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full gap-2 rounded-2xl cursor-pointer"
              onClick={() => copy('command', command)}
            >
              {copied === 'command' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied === 'command' ? t('copied') : t('copyCommand')}
            </Button>
          </div>

          {/* Announces copy results to screen readers. */}
          <p className="sr-only" aria-live="polite">{copied ? t('copied') : ''}</p>
        </div>
        <Button type="button" className="h-11 w-full rounded-2xl cursor-pointer" onClick={onClose}>
          {t('savedIt')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

// Shared by API tokens and OAuth connections.
function RevokeDialog({
  title,
  description,
  actionLabel,
  successMessage,
  errorMessage,
  onConfirm,
  onClose,
}: {
  title: string
  description: string
  actionLabel: string
  successMessage: string
  errorMessage: string
  onConfirm: () => Promise<unknown>
  onClose: () => void
}) {
  const t = useTranslations('settingsPage.apiTokens')
  const [isRevoking, startTransition] = useTransition()
  const cancelRef = useRef<HTMLButtonElement>(null)

  function handleRevoke() {
    startTransition(async () => {
      try {
        // Wait for the server: revocation is security-relevant, so no optimistic update.
        await onConfirm()
        toast.success(successMessage)
        onClose()
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : errorMessage)
      }
    })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isRevoking) onClose() }}>
      <DialogContent initialFocus={cancelRef}>
        <DialogHeader>
          <DialogTitle className="font-display">{title}</DialogTitle>
          <DialogDescription className="text-sm text-landing-muted">{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            className="h-11 rounded-2xl cursor-pointer"
            disabled={isRevoking}
            onClick={onClose}
          >
            {t('revokeCancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            className="h-11 gap-2 rounded-2xl cursor-pointer"
            disabled={isRevoking}
            aria-busy={isRevoking}
            onClick={handleRevoke}
          >
            {isRevoking && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {actionLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
