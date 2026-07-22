import { createCircle } from "@utils/actions/circles";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, CircleDot } from "lucide-react";

export default async function CreateCircle({ babyId }: { babyId: string }) {
  return (
    <Card className="border-landing-border bg-landing-surface">
      <CardHeader className="pb-3">
        <CardTitle className="font-display text-base font-semibold flex items-center gap-2">
          <CircleDot className="h-4.5 w-4.5 text-rose" />
          Créer un cercle de partage
        </CardTitle>
        <CardDescription className="text-xs text-landing-muted">
          Regroupez vos proches (ex: Famille proche, Amis) pour organiser les partages.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={createCircle} className="space-y-3.5">
          <input type="hidden" name="babyId" value={babyId} />

          <div className="flex flex-col gap-1.5">
            <Input
              name="name"
              type="text"
              placeholder="Ex: Famille proche, Amis..."
              required
              className="w-full bg-input/40"
            />
          </div>

          <Button type="submit" className="w-full rounded-2xl cursor-pointer gap-2">
            <Plus className="h-4 w-4" />
            <span>Créer le cercle</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
