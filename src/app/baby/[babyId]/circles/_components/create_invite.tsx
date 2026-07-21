"use client";

import { useState } from "react";
import { generateShortLivedLink } from "@utils/actions/invite";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link2, Copy, Check, Loader2 } from "lucide-react";

export default function CreateInvite({ babyId }: { babyId: string }) {
  const [link, setLink] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setIsLoading(true);
    try {
      const generatedLink = await generateShortLivedLink(babyId);
      if (generatedLink) {
        setLink(generatedLink);
      }
    } catch (err) {
      console.error(err);
      alert("Erreur lors de la génération du lien.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Link2 className="h-4.5 w-4.5 text-primary" />
          Lien d&apos;invitation unique
        </CardTitle>
        <CardDescription className="text-xs">
          Générez un lien d&apos;accès temporaire valable 24h à envoyer par SMS ou messagerie.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!link ? (
          <Button
            onClick={handleGenerate}
            disabled={isLoading}
            className="w-full rounded-2xl cursor-pointer gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Génération en cours...</span>
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4" />
                <span>Générer un lien de partage</span>
              </>
            )}
          </Button>
        ) : (
          <div className="flex gap-2 items-center">
            <Input
              value={link}
              readOnly
              className="flex-1 bg-muted/30 select-all"
            />
            <Button
              onClick={handleCopy}
              variant="outline"
              className="rounded-2xl cursor-pointer shrink-0 h-8 w-8 flex items-center justify-center p-0"
              title="Copier le lien"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-500" />
              ) : (
                <Copy className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </div>
        )}
        {copied && (
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
            Lien copié dans le presse-papiers !
          </p>
        )}
      </CardContent>
    </Card>
  );
}
