"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ChangelogGroup } from '@utils/changelog';

export default function VersionFooter({
  commitSha,
  changelog,
}: {
  commitSha: string;
  changelog: ChangelogGroup[];
}) {
  return (
    <Dialog>
      <DialogTrigger className="underline-offset-2 outline-hidden hover:underline">
        v{commitSha}
      </DialogTrigger>
      <DialogContent className="gap-3">
        <DialogHeader>
          <DialogTitle>Historique des versions</DialogTitle>
        </DialogHeader>
        <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1 text-left">
          {changelog.length === 0 && (
            <p className="text-sm text-muted-foreground">Historique indisponible.</p>
          )}
          {changelog.map((group) => (
            <div key={group.date}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{group.date}</p>
              <ul className="space-y-1">
                {group.commits.map((commit) => (
                  <li key={commit.hash} className="flex gap-2 text-sm">
                    <code className="mt-0.5 shrink-0 text-xs text-muted-foreground">{commit.hash}</code>
                    <span>{commit.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
