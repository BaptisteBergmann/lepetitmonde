"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Tables } from "@utils/supabase/database.types";
import { Button } from "@/components/ui/button";
import { Copy, Check, Link2 } from "lucide-react";
import { getLocaleTag } from "@utils/formatting";

type Invitation = Tables<'invitations'>;

interface InvitationsListProps {
  invitations: Invitation[];
}

export default function InvitationsList({ invitations }: InvitationsListProps) {
  const t = useTranslations('admin.invitations');
  const localeTag = getLocaleTag(useLocale());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string) => {
    const link = `${window.location.origin}/invite?token=${id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  if (invitations.length === 0) {
    return (
      <div className="text-center py-10 text-landing-muted px-4">
        <p className="text-sm font-medium">{t('empty')}</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-landing-border">
      {invitations.map((invitation) => {
        const isExpired = new Date(invitation.expires_at) <= new Date();

        return (
          <div
            key={invitation.id}
            className="flex items-center justify-between py-3.5 px-6 hover:bg-landing-background/60 transition-colors gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-primary/10 text-primary p-2 rounded-xl shrink-0">
                <Link2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm text-landing-foreground truncate">
                    ID: {invitation.id.substring(0, 8)}...
                  </p>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                      isExpired
                        ? "bg-landing-background text-landing-muted"
                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {isExpired ? t('expired') : t('active')}
                  </span>
                </div>
                <p className="text-xs text-landing-muted truncate">
                  {t('expiresOn', { date: new Date(invitation.expires_at).toLocaleString(localeTag) })}
                </p>
              </div>
            </div>

            {!isExpired && (
              <Button
                onClick={() => handleCopy(invitation.id)}
                variant="outline"
                size="xs"
                className="rounded-xl flex items-center gap-1.5 cursor-pointer shrink-0"
                title={t('copyTitle')}
              >
                {copiedId === invitation.id ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
