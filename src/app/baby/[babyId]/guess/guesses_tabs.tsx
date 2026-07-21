"use client";

import { useState } from "react";
import QuestionWrapper from "./question_wrapper";
import { HelpCircle, CheckCircle2, ClipboardList, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useRouter } from "next/navigation";

export default function GuessesTabs({
  unanswered,
  answered,
}: {
  unanswered: any[];
  answered: any[];
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
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex gap-1.5 p-1 bg-muted/40 dark:bg-muted/10 rounded-2xl w-fit">
          <button
            onClick={() => setActiveTab("pending")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 cursor-pointer ${activeTab === "pending"
              ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            <HelpCircle className="h-4 w-4" />
            <span>À deviner</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-all ${activeTab === "pending"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
              }`}>
              {unanswered.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("completed")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 cursor-pointer ${activeTab === "completed"
              ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/5 dark:ring-foreground/10"
              : "text-muted-foreground hover:text-foreground"
              }`}
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Mes pronostics</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold transition-all ${activeTab === "completed"
              ? "bg-emerald-500 text-white"
              : "bg-muted text-muted-foreground"
              }`}>
              {answered.length}
            </span>
          </button>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-xl transition-colors duration-200 disabled:opacity-50 cursor-pointer"
          title="Rafraîchir"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Liste des questions */}
      {currentQuestions.length === 0 ? (
        <Card className="border-dashed border-2 py-12 bg-muted/10">
          <CardContent className="flex flex-col items-center justify-center text-center space-y-3">
            <div className="p-3.5 bg-muted/40 dark:bg-muted/20 rounded-2xl">
              {activeTab === "pending" ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              ) : (
                <ClipboardList className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-base">
                {activeTab === "pending" ? "Bravo ! Tout est deviné" : "Aucun pronostic validé"}
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {activeTab === "pending"
                  ? "Vous avez répondu à toutes les questions en cours. Revenez plus tard s'il y en a de nouvelles !"
                  : "Vous n'avez pas encore validé de pronostic. Allez dans l'onglet 'À deviner' pour commencer !"}
              </p>
            </div>
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
