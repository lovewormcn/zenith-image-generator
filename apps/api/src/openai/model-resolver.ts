import type { ProviderType } from '@z-image/shared'
import {
  buildAliasMap,
  MODELSCOPE_EDIT_MODELS,
  MODELSCOPE_T2I_MODELS,
} from '../channels/modelscope/known-models'
import {
  MODELSCOPE_GLOBAL_EDIT_MODELS,
  MODELSCOPE_GLOBAL_T2I_MODELS,
} from '../channels/modelscope-global/known-models'

interface ResolvedModel {
  provider: ProviderType
  model: string
}

const DEFAULT_HF_MODEL = 'z-image-turbo'
const HF_MODELS = new Set(['z-image-turbo', 'qwen-image-fast', 'ovis-image', 'flux-1-schnell'])

const GITEE_MODEL_ALIASES: Record<string, string> = {
  'z-image-turbo': 'z-image-turbo',
  'qwen-image': 'Qwen-Image',
  'flux-1-krea-dev': 'FLUX_1-Krea-dev',
  'flux-1-dev': 'FLUX.1-dev',
}

// Aliases cover both text-to-image and edit models so either family can be
// addressed as `ms/<alias>`.
const MODELSCOPE_MODEL_ALIASES: Record<string, string> = {
  ...buildAliasMap(MODELSCOPE_T2I_MODELS),
  ...buildAliasMap(MODELSCOPE_EDIT_MODELS),
}

// The global host has its own, much smaller model set — the FLUX ids present
// domestically do not exist there (`Model not exists model id`), so it must
// not inherit the domestic alias map.
const MODELSCOPE_GLOBAL_MODEL_ALIASES: Record<string, string> = {
  ...buildAliasMap(MODELSCOPE_GLOBAL_T2I_MODELS),
  ...buildAliasMap(MODELSCOPE_GLOBAL_EDIT_MODELS),
}

/**
 * Resolve a requested model into a provider + upstream model id.
 *
 * An unknown bare name (no `provider/` prefix) still falls back to the
 * default HuggingFace model for backward compatibility, but a bare name that
 * matches a known ModelScope model is routed there instead — this lets
 * OpenAI-style clients that send `"model": "Qwen/Qwen-Image-Edit-2511"`
 * reach the right upstream without knowing our prefix scheme.
 */
export function resolveModel(modelParam?: string): ResolvedModel {
  const model = (modelParam || DEFAULT_HF_MODEL).trim()

  if (model.startsWith('gitee/')) {
    const raw = model.slice('gitee/'.length)
    return { provider: 'gitee', model: GITEE_MODEL_ALIASES[raw] || raw }
  }

  if (model.startsWith('ms/')) {
    const raw = model.slice('ms/'.length)
    return { provider: 'modelscope', model: MODELSCOPE_MODEL_ALIASES[raw] || raw }
  }

  if (model.startsWith('msg/')) {
    const raw = model.slice('msg/'.length)
    return { provider: 'modelscope-global', model: MODELSCOPE_GLOBAL_MODEL_ALIASES[raw] || raw }
  }

  if (model.startsWith('a4f/')) {
    const raw = model.slice('a4f/'.length)
    return { provider: 'a4f', model: raw }
  }

  // Bare ids are ModelScope's native naming; route them there so edit clients
  // that send `"model": "Qwen/Qwen-Image-Edit-2511"` work out of the box.
  // The short alias (`qwen-image-edit-2511`) deliberately does NOT route here:
  // provider prefixes (`ms/`, `hf/`, `msg/`, ...) are the project's routing
  // contract, and a bare name falls through to HuggingFace below.
  if (MODELSCOPE_EDIT_MODELS.some((m) => m.id === model)) {
    return { provider: 'modelscope', model }
  }

  return { provider: 'huggingface', model: HF_MODELS.has(model) ? model : DEFAULT_HF_MODEL }
}

/** Whether `resolveModel` would route this bare id to a ModelScope edit model. */
export function isKnownEditModel(model: string): boolean {
  return MODELSCOPE_EDIT_MODELS.some((m) => m.id === model || m.alias === model)
}
