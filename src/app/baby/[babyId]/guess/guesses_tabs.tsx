"use client";

import { useState } from "react";
import QuestionWrapper, { QuestionWithGuess } from "./question_wrapper";
import { HelpCircle, CheckCircle2, ClipboardList, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import Modal from "./_components/modal";

export default function GuessesTabs({
  unanswered,
  answered,
  babyId,
  isAdmin = false,
}: {
  unanswered: QuestionWithGuess[];
  answered: QuestionWithGuess[];
  babyId: string;
  isAdmin?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending");
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const currentQuestions = activeTab === "pending" ? unanswered : answered;

  return (
    <div className="space-y-6">
      {/* Sélecteur d'onglets et bouton de rafraîchissement */}
      <div className="flex items-center justify-between border-b border-landing-border pb-2">
        <div className="flex w-fit gap-1.5 rounded-2xl bg-landing-surface p-1">
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer ${activeTab === "pending"
              ? "bg-landing-background text-landing-foreground shadow-sm"
              : "text-landing-muted hover:text-landing-foreground"
              }`}
          >
            <HelpCircle className="h-4 w-4" />
            <span>À deviner</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-all ${activeTab === "pending"
              ? "bg-primary text-primary-foreground"
              : "bg-landing-background text-landing-muted"
              }`}>
              {unanswered.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("completed")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer ${activeTab === "completed"
              ? "bg-landing-background text-landing-foreground shadow-sm"
              : "text-landing-muted hover:text-landing-foreground"
              }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Mes pronostics</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-all ${activeTab === "completed"
              ? "bg-emerald-500 text-white"
              : "bg-landing-background text-landing-muted"
              }`}>
              {answered.length}
            </span>
          </button>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 text-landing-muted hover:text-landing-foreground hover:bg-landing-surface rounded-xl transition-colors duration-200 disabled:opacity-50 cursor-pointer"
          title="Rafraîchir"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Liste des questions */}
      {currentQuestions.length === 0 ? (
        <Card className="border-2 border-dashed border-landing-border bg-landing-surface py-12">
          <CardContent className="flex flex-col items-center justify-center text-center space-y-3">
            <div className="p-3.5 bg-landing-background rounded-2xl">
              {activeTab === "pending" ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              ) : (
                <ClipboardList className="h-8 w-8 text-landing-muted" />
              )}
            </div>
            <div className="space-y-1">
              <h3 className="font-display text-base font-semibold">
                {activeTab === "pending" ? "Bravo ! Tout est deviné" : "Aucun pronostic validé"}
              </h3>
              <p className="text-sm text-landing-muted max-w-sm">
                {activeTab === "pending"
                  ? "Vous avez répondu à toutes les questions en cours. Revenez plus tard s'il y en a de nouvelles !"
                  : "Vous n'avez pas encore validé de pronostic. Allez dans l'onglet 'À deviner' pour commencer !"}
              </p>
            </div>
            {activeTab === "pending" && (
              <Modal babyId={babyId} isAdmin={isAdmin} />
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="columns-1 md:columns-2 gap-4">
          {currentQuestions.map((question) => (
            <div key={question.id} className="mb-4 break-inside-avoid transition-all duration-200">
              <QuestionWrapper questionWithGuess={question} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
