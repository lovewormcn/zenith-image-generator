/**
 * ModelScope catalogue (verified by live probe).
 *
 * IMPORTANT — read before adding a model here.
 *
 * A successful task submission proves nothing about a model's capability:
 *  - Several text-to-image models silently accept `image_url`, ignore it and
 *    return an unrelated image. `MusePublic/Qwen-Image-Edit` is one of these
 *    despite the name. Never list a model under `editModels` without feeding
 *    it a distinctive source image and confirming the output actually
 *    derives from it.
 *  - Rate-limited or unknown models answer HTTP 429, not 404, so a 429 probe
 *    result is not evidence of absence.
 *
 * Probes last run: 2026-10-20.
 */

export interface ModelEntry {
  /** Upstream ModelScope model id. */
  id: string
  /** Short alias exposed as `ms/<alias>` for backward compatibility. */
  alias?: string
  label: string
  /** Whether this model consumes an input image (verified). */
  edit: boolean
}

/** Text-to-image models confirmed to respond. */
export const MODELSCOPE_T2I_MODELS: ModelEntry[] = [
  { id: 'Tongyi-MAI/Z-Image-Turbo', alias: 'z-image-turbo', label: 'Z-Image Turbo', edit: false },
  { id: 'black-forest-labs/FLUX.2-dev', alias: 'flux-2', label: 'FLUX.2 dev', edit: false },
  { id: 'Qwen/Qwen-Image-2512', label: 'Qwen Image 2512', edit: false },
  {
    id: 'black-forest-labs/FLUX.1-Krea-dev',
    alias: 'flux-1-krea-dev',
    label: 'FLUX.1 Krea',
    edit: false,
  },
  { id: 'MusePublic/489_ckpt_FLUX_1', alias: 'flux-1', label: 'FLUX.1', edit: false },
]

/**
 * Image-edit models confirmed to actually apply the supplied image.
 * Ordered best-first; the first entry is the default for `/v1/images/edits`.
 */
export const MODELSCOPE_EDIT_MODELS: ModelEntry[] = [
  {
    id: 'Qwen/Qwen-Image-Edit-2511',
    alias: 'qwen-image-edit-2511',
    label: 'Qwen Image Edit 2511',
    edit: true,
  },
  {
    id: 'Qwen/Qwen-Image-Edit-2509',
    alias: 'qwen-image-edit-2509',
    label: 'Qwen Image Edit 2509',
    edit: true,
  },
  { id: 'Qwen/Qwen-Image-Edit', alias: 'qwen-image-edit', label: 'Qwen Image Edit', edit: true },
]

export const MODELSCOPE_DEFAULT_EDIT_MODEL = MODELSCOPE_EDIT_MODELS[0].id

/** Build a `ms/<alias>` → upstream id map. */
export function buildAliasMap(entries: ModelEntry[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const entry of entries) {
    if (entry.alias) map[entry.alias] = entry.id
  }
  return map
}
