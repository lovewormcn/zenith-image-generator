/**
 * Model Configuration
 */

import type { ModelConfig, ProviderType } from '../types/provider'

/** All model configurations */
export const MODEL_CONFIGS: ModelConfig[] = [
  // A4F models (OpenAI-compatible)
  {
    id: 'provider-4/imagen-3.5',
    name: 'Imagen 3.5 (provider-4)',
    provider: 'a4f',
    features: {
      negativePrompt: false,
      steps: { min: 1, max: 1, default: 1 },
      seed: false,
    },
  },
  {
    id: 'provider-4/imagen-4',
    name: 'Imagen 4 (provider-4)',
    provider: 'a4f',
    features: {
      negativePrompt: false,
      steps: { min: 1, max: 1, default: 1 },
      seed: false,
    },
  },
  {
    id: 'provider-8/imagen-3',
    name: 'Imagen 3 (provider-8)',
    provider: 'a4f',
    features: {
      negativePrompt: false,
      steps: { min: 1, max: 1, default: 1 },
      seed: false,
    },
  },
  {
    id: 'provider-4/flux-schnell',
    name: 'FLUX Schnell (provider-4)',
    provider: 'a4f',
    features: {
      negativePrompt: false,
      steps: { min: 1, max: 1, default: 1 },
      seed: false,
    },
  },
  {
    id: 'provider-8/z-image',
    name: 'Z-Image (provider-8)',
    provider: 'a4f',
    features: {
      negativePrompt: false,
      steps: { min: 1, max: 1, default: 1 },
      seed: false,
    },
  },
  // Gitee AI models
  {
    id: 'z-image-turbo',
    name: 'Z-Image Turbo',
    provider: 'gitee',
    features: {
      negativePrompt: true,
      steps: { min: 1, max: 20, default: 9 },
      seed: true,
    },
  },
  {
    id: 'GLM-Image',
    name: 'GLM Image',
    provider: 'gitee',
    features: {
      negativePrompt: true,
      steps: { min: 1, max: 50, default: 30 },
      guidanceScale: { min: 0, max: 20, default: 1.5 },
      seed: true,
    },
  },
  {
    id: 'Qwen-Image',
    name: 'Qwen Image',
    provider: 'gitee',
    features: {
      negativePrompt: true,
      steps: { min: 4, max: 50, default: 20 },
      seed: true,
    },
  },
  {
    id: 'Qwen-Image-2512',
    name: 'Qwen Image 2512',
    provider: 'gitee',
    features: {
      negativePrompt: true,
      steps: { min: 1, max: 50, default: 4 },
      guidanceScale: { min: 0, max: 20, default: 1 },
      seed: true,
    },
  },
  {
    id: 'flux-1-schnell',
    name: 'FLUX.1 Schnell',
    provider: 'gitee',
    features: {
      negativePrompt: false,
      steps: { min: 1, max: 50, default: 8 },
      guidanceScale: { min: 0, max: 50, default: 7.5 },
      seed: true,
    },
  },
  {
    id: 'FLUX_1-Krea-dev',
    name: 'FLUX.1 Krea',
    provider: 'gitee',
    features: {
      negativePrompt: false,
      steps: { min: 1, max: 50, default: 20 },
      guidanceScale: { min: 0, max: 20, default: 4.5 },
      seed: true,
    },
  },
  {
    id: 'FLUX.1-dev',
    name: 'FLUX.1',
    provider: 'gitee',
    features: {
      negativePrompt: false,
      steps: { min: 1, max: 50, default: 20 },
      guidanceScale: { min: 0, max: 20, default: 4.5 },
      seed: true,
    },
  },
  // HuggingFace models
  {
    id: 'z-image-turbo',
    name: 'Z-Image Turbo',
    provider: 'huggingface',
    features: {
      negativePrompt: false,
      steps: { min: 1, max: 20, default: 9 },
      seed: true,
    },
  },
  {
    id: 'qwen-image-fast',
    name: 'Qwen Image Fast',
    provider: 'huggingface',
    features: {
      negativePrompt: false,
      steps: { min: 4, max: 28, default: 8 },
      seed: true,
    },
  },
  {
    id: 'ovis-image',
    name: 'Ovis Image',
    provider: 'huggingface',
    features: {
      negativePrompt: false,
      steps: { min: 1, max: 50, default: 24 },
      seed: true,
    },
  },
  {
    id: 'flux-1-schnell',
    name: 'FLUX.1 Schnell',
    provider: 'huggingface',
    features: {
      negativePrompt: false,
      steps: { min: 1, max: 50, default: 8 },
      seed: true,
    },
  },
  // ModelScope models
  {
    id: 'Tongyi-MAI/Z-Image-Turbo',
    name: 'Z-Image Turbo',
    provider: 'modelscope',
    features: {
      negativePrompt: true,
      steps: { min: 1, max: 20, default: 9 },
      seed: true,
    },
  },
  {
    id: 'Qwen/Qwen-Image-2512',
    name: 'Qwen Image 2512',
    provider: 'modelscope',
    features: {
      negativePrompt: true,
      steps: { min: 1, max: 50, default: 4 },
      seed: true,
    },
  },
  {
    id: 'black-forest-labs/FLUX.2-dev',
    name: 'FLUX.2',
    provider: 'modelscope',
    features: {
      negativePrompt: true,
      steps: { min: 1, max: 50, default: 24 },
      guidanceScale: { min: 1, max: 10, default: 3.5 },
      seed: true,
    },
  },
  {
    id: 'black-forest-labs/FLUX.1-Krea-dev',
    name: 'FLUX.1 Krea',
    provider: 'modelscope',
    features: {
      negativePrompt: true,
      steps: { min: 1, max: 50, default: 24 },
      guidanceScale: { min: 1, max: 20, default: 3.5 },
      seed: true,
    },
  },
  {
    id: 'MusePublic/489_ckpt_FLUX_1',
    name: 'FLUX.1',
    provider: 'modelscope',
    features: {
      negativePrompt: true,
      steps: { min: 1, max: 50, default: 24 },
      guidanceScale: { min: 1, max: 20, default: 3.5 },
      seed: true,
    },
  },
  // ModelScope Global models (mirror of ModelScope, served from api-inference.modelscope.ai)
  {
    id: 'Tongyi-MAI/Z-Image-Turbo',
    name: 'Z-Image Turbo',
    provider: 'modelscope-global',
    features: {
      negativePrompt: true,
      steps: { min: 1, max: 20, default: 9 },
      seed: true,
    },
  },
  {
    id: 'Qwen/Qwen-Image-2512',
    name: 'Qwen Image 2512',
    provider: 'modelscope-global',
    features: {
      negativePrompt: true,
      steps: { min: 1, max: 50, default: 4 },
      seed: true,
    },
  },
]

/** Get models by provider */
export function getModelsByProvider(provider: ProviderType): ModelConfig[] {
  return MODEL_CONFIGS.filter((m) => m.provider === provider)
}

/**
 * Image-edit models (`POST /v1/images/edits`).
 *
 * Kept separate from `MODEL_CONFIGS` so they never appear in the text-to-image
 * model picker. Only models verified to actually consume the input image
 * belong here — several look-alikes silently ignore it and return an
 * unrelated picture.
 */
export const IMAGE_EDIT_MODELS: ModelConfig[] = [
  {
    id: 'Qwen/Qwen-Image-Edit-2511',
    name: 'Qwen Image Edit 2511',
    provider: 'modelscope',
    features: { negativePrompt: true, steps: { min: 1, max: 50, default: 4 }, seed: true },
  },
  {
    id: 'Qwen/Qwen-Image-Edit-2509',
    name: 'Qwen Image Edit 2509',
    provider: 'modelscope',
    features: { negativePrompt: true, steps: { min: 1, max: 50, default: 4 }, seed: true },
  },
  {
    id: 'Qwen/Qwen-Image-Edit',
    name: 'Qwen Image Edit',
    provider: 'modelscope',
    features: { negativePrompt: true, steps: { min: 1, max: 50, default: 4 }, seed: true },
  },
  // Global-endpoint fallback. Same id as the domestic one above but a
  // different upstream: the domestic copy is the real editor, this one is
  // kept only so an `msg/` call still has an escape hatch. Quality is lower
  // (tends to blow out to near-white) and it is slower (~150s).
  {
    id: 'Qwen/Qwen-Image-Edit',
    name: 'Qwen Image Edit (Global)',
    provider: 'modelscope-global',
    features: { negativePrompt: true, steps: { min: 1, max: 50, default: 4 }, seed: true },
  },
  {
    id: 'MusePublic/Qwen-Image-Edit',
    name: 'MusePublic Qwen Image Edit (Global)',
    provider: 'modelscope-global',
    features: { negativePrompt: true, steps: { min: 1, max: 50, default: 4 }, seed: true },
  },
]

/** Get image-edit models by provider */
export function getImageEditModelsByProvider(provider: ProviderType): ModelConfig[] {
  return IMAGE_EDIT_MODELS.filter((m) => m.provider === provider)
}

/** Default image-edit model (best-first ordering in `IMAGE_EDIT_MODELS`). */
export const DEFAULT_IMAGE_EDIT_MODEL_ID = IMAGE_EDIT_MODELS[0].id

/** Get model configuration by ID */
export function getModelConfig(modelId: string): ModelConfig | undefined {
  return MODEL_CONFIGS.find((m) => m.id === modelId)
}

/** Get model configuration by provider and ID */
export function getModelByProviderAndId(
  provider: ProviderType,
  modelId: string
): ModelConfig | undefined {
  return MODEL_CONFIGS.find((m) => m.provider === provider && m.id === modelId)
}
