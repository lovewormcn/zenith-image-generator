import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Header } from '@/components/feature/Header'
import { ImageEditCard } from '@/components/feature/ImageEditCard'
import { ImageHistory } from '@/components/feature/ImageHistory'
import { ImageResultCard } from '@/components/feature/ImageResultCard'
import { PromptCard } from '@/components/feature/PromptCard'
import { SettingsModal } from '@/components/feature/SettingsModal'
import { StatusCard } from '@/components/feature/StatusCard'
import { useImageGenerator } from '@/hooks/useImageGenerator'

type Mode = 'generate' | 'edit'

export default function ImageGenerator() {
  const { t } = useTranslation()
  const [showSettings, setShowSettings] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [mode, setMode] = useState<Mode>('generate')
  const {
    currentToken,
    provider,
    model,
    editModel,
    availableModels,
    availableEditModels,
    supportsEdit,
    prompt,
    negativePrompt,
    width,
    height,
    steps,
    loading,
    imageDetails,
    status,
    elapsed,
    selectedRatio,
    uhd,
    showInfo,
    isBlurred,
    isOptimizing,
    isTranslating,
    llmSettings,
    setProvider,
    setModel,
    setEditModel,
    setPrompt,
    setNegativePrompt,
    setWidth,
    setHeight,
    setSteps,
    setShowInfo,
    setIsBlurred,
    setLLMProvider,
    setLLMModel,
    setTranslateProvider,
    setTranslateModel,
    setAutoTranslate,
    setCustomSystemPrompt,
    setCustomOptimizeConfig,
    setCustomTranslateConfig,
    saveToken,
    handleRatioSelect,
    handleUhdToggle,
    handleDownload,
    handleDelete,
    handleGenerate,
    handleEdit,
    handleLoadFromHistory,
    handleOptimize,
    handleTranslate,
    historyId,
    generatedAt,
  } = useImageGenerator()

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <Header
            onSettingsClick={() => setShowSettings(true)}
            onHistoryClick={() => setShowHistory(true)}
            hasToken={!!currentToken}
          />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left Panel - Controls */}
            <div className="lg:col-span-3 space-y-4">
              {supportsEdit && (
                <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
                  <button
                    type="button"
                    onClick={() => setMode('generate')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      mode === 'generate'
                        ? 'bg-orange-500 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {t('edit.tabGenerate')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('edit')}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      mode === 'edit'
                        ? 'bg-orange-500 text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {t('edit.tabEdit')}
                  </button>
                </div>
              )}

              {mode === 'edit' && supportsEdit ? (
                <ImageEditCard
                  loading={loading}
                  editModel={editModel}
                  availableEditModels={availableEditModels}
                  setEditModel={setEditModel}
                  onEdit={handleEdit}
                />
              ) : (
                <PromptCard
                  prompt={prompt}
                  negativePrompt={negativePrompt}
                  steps={steps}
                  width={width}
                  height={height}
                  selectedRatio={selectedRatio}
                  uhd={uhd}
                  loading={loading}
                  setPrompt={setPrompt}
                  setNegativePrompt={setNegativePrompt}
                  setSteps={setSteps}
                  setWidth={setWidth}
                  setHeight={setHeight}
                  handleRatioSelect={handleRatioSelect}
                  handleUhdToggle={handleUhdToggle}
                  handleGenerate={handleGenerate}
                  onOptimize={handleOptimize}
                  onTranslate={handleTranslate}
                  isOptimizing={isOptimizing}
                  isTranslating={isTranslating}
                />
              )}
            </div>

            {/* Right Panel - Output */}
            <div className="lg:col-span-2 space-y-4">
              <ImageResultCard
                imageDetails={imageDetails}
                loading={loading}
                elapsed={elapsed}
                showInfo={showInfo}
                isBlurred={isBlurred}
                setShowInfo={setShowInfo}
                setIsBlurred={setIsBlurred}
                handleDownload={handleDownload}
                handleDelete={handleDelete}
                onRegenerate={handleGenerate}
                historyId={historyId}
                generatedAt={generatedAt}
              />

              <StatusCard status={status} />
            </div>
          </div>
        </div>
      </div>

      <ImageHistory
        open={showHistory}
        onClose={() => setShowHistory(false)}
        onSelect={handleLoadFromHistory}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        provider={provider}
        model={model}
        currentToken={currentToken}
        availableModels={availableModels}
        setProvider={setProvider}
        setModel={setModel}
        saveToken={saveToken}
        llmSettings={llmSettings}
        setLLMProvider={setLLMProvider}
        setLLMModel={setLLMModel}
        setTranslateProvider={setTranslateProvider}
        setTranslateModel={setTranslateModel}
        setAutoTranslate={setAutoTranslate}
        setCustomSystemPrompt={setCustomSystemPrompt}
        setCustomOptimizeConfig={setCustomOptimizeConfig}
        setCustomTranslateConfig={setCustomTranslateConfig}
      />
    </div>
  )
}
