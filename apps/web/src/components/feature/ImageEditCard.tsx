import type { ModelConfig } from '@z-image/shared'
import { ImagePlus, Loader2, Wand2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

interface ImageEditCardProps {
  loading: boolean
  editModel: string
  availableEditModels: ModelConfig[]
  setEditModel: (id: string) => void
  onEdit: (image: Blob, prompt: string) => void
}

/** Collapse toggle + upload + prompt, all in one card. */
export function ImageEditCard({
  loading,
  editModel,
  availableEditModels,
  setEditModel,
  onEdit,
}: ImageEditCardProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [editPrompt, setEditPrompt] = useState('')

  // Object URLs are not garbage-collected automatically; revoke the previous
  // one whenever the selection changes so repeated uploads do not leak.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const canSubmit = Boolean(file) && editPrompt.trim().length > 0 && !loading

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardContent className="p-5 space-y-4">
        <div>
          <Label className="text-zinc-300 text-sm font-medium">{t('edit.model')}</Label>
          <Select value={editModel} onValueChange={setEditModel}>
            <SelectTrigger className="mt-2 bg-zinc-950 border-zinc-800 text-zinc-100">
              <SelectValue placeholder={t('edit.modelPlaceholder')} />
            </SelectTrigger>
            <SelectContent className="bg-zinc-900 border-zinc-800">
              {availableEditModels.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-zinc-100">
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-zinc-300 text-sm font-medium">{t('edit.sourceImage')}</Label>
            {file && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFile(null)}
                className="h-7 px-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
              >
                <X className="w-4 h-4 mr-1" />
                <span className="text-xs">{t('edit.clear')}</span>
              </Button>
            )}
          </div>

          {previewUrl ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="block w-full rounded-lg border border-zinc-800 overflow-hidden hover:border-zinc-600 transition-colors"
            >
              <img
                src={previewUrl}
                alt={t('edit.sourceImage')}
                className="w-full max-h-64 object-contain bg-zinc-950"
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full h-32 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-700 text-zinc-500 hover:border-orange-500 hover:text-orange-400 transition-colors"
            >
              <ImagePlus className="w-6 h-6" />
              <span className="text-xs">{t('edit.uploadHint')}</span>
            </button>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0]
              if (picked) setFile(picked)
              // Reset so re-picking the same file still fires onChange.
              e.target.value = ''
            }}
          />
        </div>

        <div>
          <Label className="text-zinc-300 text-sm font-medium">{t('edit.instruction')}</Label>
          <Textarea
            rows={3}
            value={editPrompt}
            onChange={(e) => setEditPrompt(e.target.value)}
            placeholder={t('edit.instructionPlaceholder')}
            className="mt-2 bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 resize-none"
          />
        </div>

        <Button
          onClick={() => file && onEdit(file, editPrompt)}
          disabled={!canSubmit}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold h-12 text-base disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {t('edit.editing')}
            </>
          ) : (
            <>
              <Wand2 className="w-5 h-5 mr-2" />
              {t('edit.submit')}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
