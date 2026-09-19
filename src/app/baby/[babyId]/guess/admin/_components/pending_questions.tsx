'use client'

import { toast } from 'sonner'
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { reviewQuestion } from "@/utils/actions/guesses_questions";
import { Tables } from "@/utils/supabase/database.types";
import Modal from "../../_components/modal";

export default function PendingQuestions({
  babyId,
  questions,
  userNameById,
}: {
  babyId: string;
  questions: Tables<'guess_questions'>[];
  userNameById: Map<string, string>;
}) {
  const t = useTranslations('guess');
  const tPending = useTranslations('guess.pendingQuestions');
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (questions.length === 0) return null;

  const handleReview = async (questionId: string, decision: "approved" | "rejected") => {
    setPendingId(questionId);
    try {
      await reviewQuestion(babyId, questionId, decision);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error(tPending('reviewError'));
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="space-y-3 mb-8">
      <h2 className="font-display text-sm font-semibold text-landing-foreground px-1">
        {tPending('titleWithCount', { count: questions.length })}
      </h2>
      <div className="space-y-3">
        {questions.map((question) => {
          const isProcessing = pendingId === question.id;
          return (
            <Card key={question.id} className="border-amber-500/30 bg-amber-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="font-display text-base font-semibold text-landing-foreground">
                  {question.title}
                </CardTitle>
                {question.description && (
                  <CardDescription className="text-xs text-landing-muted mt-1">
                    {question.description}
                  </CardDescription>
                )}
                <CardDescription className="text-xs mt-1">
                  {tPending('proposedBy', { name: question.created_by ? userNameById.get(question.created_by) ?? t('unknownUser') : t('unknownUser') })}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex gap-2 justify-end">
                <Modal
                  babyId={babyId}
                  isAdmin
                  question={question}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isProcessing}
                      className="gap-1.5 rounded-2xl cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      {t('edit')}
                    </Button>
                  }
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isProcessing}
                  className="gap-1.5 rounded-2xl cursor-pointer"
                  onClick={() => handleReview(question.id, "rejected")}
                >
                  <X className="h-3.5 w-3.5" />
                  {tPending('reject')}
                </Button>
                <Button
                  size="sm"
                  disabled={isProcessing}
                  className="gap-1.5 rounded-2xl cursor-pointer"
                  onClick={() => handleReview(question.id, "approved")}
                >
                  {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  {tPending('approve')}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
