import { getTranslations } from "next-intl/server";
import { createCircle } from "@utils/actions/circles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, CircleDot } from "lucide-react";

export default async function CreateCircle({ babyId }: { babyId: string }) {
  const t = await getTranslations('admin.createCircle');
  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
          <CircleDot className="h-4.5 w-4.5 text-rose" />
          {t('title')}
        </CardTitle>
        <CardDescription className="text-xs text-landing-muted">
          {t('description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createCircle} className="space-y-3.5">
          <input type="hidden" name="babyId" value={babyId} />

          <div className="flex flex-col gap-1.5">
            <Input
              name="name"
              type="text"
              placeholder={t('namePlaceholder')}
              required
              className="w-full bg-input/40"
            />
          </div>

          <Button type="submit" className="w-full rounded-2xl cursor-pointer gap-2">
            <Plus className="h-4 w-4" />
            <span>{t('submit')}</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
