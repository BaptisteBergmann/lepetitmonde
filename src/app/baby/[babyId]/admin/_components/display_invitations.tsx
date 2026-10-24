"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/confirm_provider";
import { Copy, Check, Link2, Loader2 } from "lucide-react";
import { getLocaleTag } from "@utils/formatting";
import { revokeInvitation } from "@utils/actions/invite";
import { cn } from "@utils/utils";

type UsedByUser = { first_name: string | null; last_name: string | null };

export interface Invitation {
  id: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  used_by: string | null;
  // PostgREST returns a single object for this many-to-one embed, but the
  // generated types infer an array; accept both and normalise when reading.
  users: UsedByUser | UsedByUser[] | null;
}

interface InvitationsListProps {
  babyId: string;
  invitations: Invitation[];
}

type Status = "revoked" | "used" | "expired" | "active";

function getStatus(invitation: Invitation, now: number): Status {
  if (invitation.revoked_at) return "revoked";
  if (invitation.used_at) return "used";
  if (new Date(invitation.expires_at).getTime() <= now) return "expired";
  return "active";
}

export default function InvitationsList({ babyId, invitations: initialInvitations }: InvitationsListProps) {
  const t = useTranslations('admin.invitations');
  const localeTag = getLocaleTag(useLocale());
  const router = useRouter();
  const confirmAction = useConfirm();
  const [invitations, setInvitations] = useState(initialInvitations);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Captured once (and refreshed on revoke) to keep render pure.
  const [now, setNow] = useState(() => Date.now());
  const [syncedFrom, setSyncedFrom] = useState(initialInvitations);
  // Resync after router.refresh() hands down fresh server data.
  if (syncedFrom !== initialInvitations) {
    setSyncedFrom(initialInvitations);
    setInvitations(initialInvitations);
  }

  const handleCopy = async (id: string) => {
    const link = `${window.location.origin}/invite?token=${id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
    } catch {
      toast.error(t('copyError'));
    }
  };

  const handleRevoke = async (id: string) => {
    const confirmed = await confirmAction({
      title: t('revokeConfirmTitle'),
      description: t('revokeConfirm'),
      confirmLabel: t('revoke'),
      destructive: true,
    });
    if (!confirmed) return;

    setRevokingId(id);
    setNow(Date.now());
    const previous = invitations;
    // Optimistic: the row flips to Revoked at once, rolled back on error.
    setInvitations((prev) =>
      prev.map((i) => (i.id === id ? { ...i, revoked_at: new Date().toISOString() } : i)),
    );
    try {
      await revokeInvitation(babyId, id);
      toast.success(t('revokeSuccess'));
      router.refresh();
      // The Revoke button is gone now; keep keyboard focus on the row.
      document.getElementById(`invitation-${id}`)?.focus();
    } catch {
      setInvitations(previous);
      toast.error(t('revokeError'));
    } finally {
      setRevokingId(null);
    }
  };

  if (invitations.length === 0) {
    return (
      <div className="text-center py-10 text-landing-muted px-4">
        <p className="text-sm font-medium">{t('empty')}</p>
      </div>
    );
  }

  const statusLabel: Record<Status, string> = {
    active: t('active'),
    used: t('used'),
    expired: t('expired'),
    revoked: t('revoked'),
  };

  return (
    <div className="divide-y divide-landing-border">
      {invitations.map((invitation) => {
        const status = getStatus(invitation, now);
        const shortId = invitation.id.substring(0, 8);
        const isActive = status === "active";
        const usedByUser = Array.isArray(invitation.users) ? invitation.users[0] : invitation.users;
        const firstName = usedByUser?.first_name?.trim() ?? "";
        const lastName = usedByUser?.last_name?.trim() ?? "";
        const userName = `${firstName} ${lastName}`.trim();
        const isRevoking = revokingId === invitation.id;

        return (
          <div
            key={invitation.id}
            id={`invitation-${invitation.id}`}
            tabIndex={-1}
            className={cn(
              "flex flex-col gap-3 py-3.5 px-6 hover:bg-landing-background/60 transition-colors outline-none sm:flex-row sm:items-center sm:justify-between sm:gap-4",
              !isActive && "opacity-80",
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-primary/10 text-primary p-2 rounded-xl shrink-0">
                <Link2 className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="font-semibold text-sm text-landing-foreground truncate">
                    ID: {shortId}...
                  </p>
                  <Badge
                    variant={isActive ? "default" : status === "revoked" ? "destructive" : "secondary"}
                    className="shrink-0"
                  >
                    {statusLabel[status]}
                  </Badge>
                </div>
                <p className="text-xs text-landing-muted break-words">
                  {status === "used"
                    ? userName
                      ? t('usedBy', { name: userName })
                      : t('usedByUnknown')
                    : t('expiresOn', { date: new Date(invitation.expires_at).toLocaleString(localeTag) })}
                </p>
              </div>
            </div>

            {isActive && (
              <div className="flex gap-2 shrink-0">
                <Button
                  onClick={() => handleCopy(invitation.id)}
                  variant="outline"
                  className="h-11 rounded-2xl flex items-center gap-1.5 cursor-pointer"
                  title={t('copyTitle')}
                  aria-label={t('copyAria', { id: shortId })}
                >
                  {copiedId === invitation.id ? (
                    <Check className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  )}
                  {copiedId === invitation.id ? t('copied') : t('copy')}
                </Button>
                <Button
                  onClick={() => handleRevoke(invitation.id)}
                  variant="ghost"
                  disabled={isRevoking}
                  aria-busy={isRevoking}
                  className="h-11 rounded-2xl text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                  aria-label={t('revokeAria', { id: shortId })}
                >
                  {isRevoking ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : t('revoke')}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
