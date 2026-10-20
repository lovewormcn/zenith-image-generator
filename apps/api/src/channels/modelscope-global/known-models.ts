/**
 * ModelScope Global (api-inference.modelscope.ai) catalogue — verified by live probe.
 *
 * IMPORTANT — this endpoint does NOT share its model set with the domestic
 * one. The same id can exist on both, on neither, or behave differently:
 *  - `MusePublic/Qwen-Image-Edit` is a fake edit on the domestic endpoint
 *    (returns an unrelated picture) but a real, if very washed-out, edit here.
 *  - The FLUX family does not exist here at all (`Model not exists model id`).
 * Do not copy entries between `modelscope/known-models.ts` and this file
 * without re-probing.
 *
 * Also note `/v1/models` on this host is unreliable in both directions: it
 * omits working models (`Tongyi-MAI/Z-Image-Turbo`, `Qwen/Qwen-Image-2512`
 * both render but are unlisted) and its presence guarantees nothing. The only
 * reliable check is an actual POST probe.
 *
 * Probes last run: 2026-10-20.
 */

import type { ModelEntry } from '../modelscope/known-models'

export type { ModelEntry }

/** Text-to-image models confirmed to render on the global endpoint. */
export const MODELSCOPE_GLOBAL_T2I_MODELS: ModelEntry[] = [
  { id: 'Tongyi-MAI/Z-Image-Turbo', alias: 'z-image-turbo', label: 'Z-Image Turbo', edit: false },
  { id: 'Qwen/Qwen-Image-2512', alias: 'qwen-image-2512', label: 'Qwen Image 2512', edit: false },
]

/**
 * Image-edit models confirmed to consume the supplied image here.
 * Ordered best-first; the first entry is the default for `msg/` edits.
 *
 * Quality caveat: both are markedly weaker than the domestic Qwen edit
 * models — output tends to be blown out to near-white and slow (~150s).
 */
export const MODELSCOPE_GLOBAL_EDIT_MODELS: ModelEntry[] = [
  {
    id: 'Qwen/Qwen-Image-Edit',
    alias: 'qwen-image-edit',
    label: 'Qwen Image Edit',
    edit: true,
  },
  {
    id: 'MusePublic/Qwen-Image-Edit',
    alias: 'muse-qwen-image-edit',
    label: 'MusePublic Qwen Image Edit',
    edit: true,
  },
]

export const MODELSCOPE_GLOBAL_DEFAULT_EDIT_MODEL = MODELSCOPE_GLOBAL_EDIT_MODELS[0].id
