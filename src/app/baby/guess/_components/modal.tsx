'use client'

import { useState } from 'react'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { addQuestion } from '@utils/actions/guesses_questions';
import { useSearchParams } from 'next/navigation' // <-- Importez ceci

export default function Modal() {
  const searchParams = useSearchParams()
  const projectId = searchParams.get('projectId') || "XXX"
  const [open, setOpen] = useState(false)
  const [selectValue, setSelectValue] = useState("");

  // Nouveaux états pour la question de pronostic
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedValue, setSelectedValue] = useState(""); // Contiendra la date, le texte, ou le nombre choisi

  const [isPending, setIsPending] = useState(false)

  const handleConfirm = async () => {
    setIsPending(true)
    try {
      const result = await addQuestion({
        title,
        description,
        type: selectValue,
        is_active: true,
        project_id: projectId,
      })

      if (result.success) {
        setOpen(false) // Fermer le modal si tout est OK
      } else {
        alert("Une erreur est survenue lors de la sauvegarde.")
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsPending(false)
    }
  }

  const items = [
    { label: "Texte", value: "text" },
    { label: "Date", value: "date" },
    { label: "Nombre", value: "number" },
  ]

  // Fonction de nettoyage lors du changement de type
  const handleTypeChange = (value: string) => {
    setSelectValue(value);
    setSelectedValue(""); // Reset la valeur spécifique au picker
  };

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-gray-950/5 px-2.5 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-950/10 dark:bg-white/10 dark:text-white dark:inset-ring dark:inset-ring-white/5 dark:hover:bg-white/20"
      >
        Open dialog
      </button>

      {open &&
        <div className='fixed top-0 left-0 w-full h-full bg-black/40 backdrop-blur-sm flex justify-center items-center z-50'>
          <div className='w-full max-w-[460px] bg-white shadow-xl rounded-lg overflow-hidden flex flex-col border border-gray-200'>

            <h2 className='text-base font-semibold text-gray-950 border-b border-gray-200 py-4 px-5'>
              Créer un nouveau pronostic
            </h2>

            <div className='p-5 space-y-4 flex-1 text-black'>

              {/* Champ Titre */}
              <div className='flex flex-col gap-1.5'>
                <label htmlFor="title" className='text-xs font-semibold text-gray-700 uppercase tracking-wider'>
                  Titre du pronostic
                </label>
                <input
                  type="text"
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Devinez le prénom du bébé !"
                  className='w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
                />
              </div>

              {/* Champ Description */}
              <div className='flex flex-col gap-1.5'>
                <label htmlFor="description" className='text-xs font-semibold text-gray-700 uppercase tracking-wider'>
                  Description
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ajoutez des indices ou des détails pour la famille..."
                  rows={2}
                  className='w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none'
                />
              </div>

              {/* Sélecteur du Type de Réponse attendu */}
              <div className='flex flex-col gap-1.5'>
                <label className='text-xs font-semibold text-gray-700 uppercase tracking-wider'>
                  Type de réponse attendu
                </label>
                <Select value={selectValue} onValueChange={handleTypeChange}>
                  <SelectTrigger className="w-full text-black">
                    <SelectValue placeholder="Sélectionner le type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>


            </div>

            {/* Pied de page du Modal */}
            <div className='border-t border-gray-200 bg-gray-50 flex justify-end gap-2 items-center px-5 py-3.5'>
              <button
                type='button'
                className='h-9 px-4 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                onClick={() => setOpen(false)}
              >
                Annuler
              </button>
              <button
                type='button'
                disabled={!title.trim() || !selectValue}
                className='h-9 px-4 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors'
                onClick={handleConfirm}
              >
                Confirmer
              </button>
            </div>

          </div>
        </div>
      }
    </div>
  )
}
