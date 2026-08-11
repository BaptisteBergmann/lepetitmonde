"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Enums } from "@utils/supabase/database.types";
import { updatePageSetting } from "@utils/actions/page_settings";
import { PageId } from "@utils/page_registry";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PageRow = {
  id: PageId;
  name: string;
  enabled: boolean;
  role: Enums<'role'>;
};

export default function DisplayPageSettings({ babyId, pages: initialPages }: { babyId: string; pages: PageRow[] }) {
  const t = useTranslations();
  const ROLE_LABELS: Record<Enums<'role'>, string> = {
    viewer: t('roles.viewer'),
    admin: t('roles.admin'),
  };
  const [pages, setPages] = useState(initialPages);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleChange = async (pageId: PageId, next: { enabled: boolean; role: Enums<'role'> }) => {
    const previous = pages.find((p) => p.id === pageId);
    setPendingId(pageId);
    setPages((prev) => prev.map((p) => (p.id === pageId ? { ...p, ...next } : p)));
    try {
      await updatePageSetting(babyId, pageId, next);
    } catch (err) {
      console.error(err);
      if (previous) {
        setPages((prev) => prev.map((p) => (p.id === pageId ? previous : p)));
      }
      toast.error(err instanceof Error ? err.message : t('pages.updateError'));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="divide-y divide-landing-border">
      {pages.map((page) => (
        <div key={page.id} className="flex flex-wrap items-center justify-between gap-3 py-3.5 px-6">
          <label className="flex items-center gap-2.5 text-sm font-semibold text-landing-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={page.enabled}
              disabled={pendingId === page.id}
              onChange={(e) => handleChange(page.id, { enabled: e.target.checked, role: page.role })}
              className="h-4 w-4 rounded border-landing-border accent-primary cursor-pointer"
            />
            {page.name}
          </label>

          <Select
            value={page.role}
            onValueChange={(value: string | null) =>
              value && handleChange(page.id, { enabled: page.enabled, role: value as Enums<'role'> })
            }
            disabled={pendingId === page.id || !page.enabled}
          >
            <SelectTrigger size="sm" className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as Enums<'role'>[]).map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}
