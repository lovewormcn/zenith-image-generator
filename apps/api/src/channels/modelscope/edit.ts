import { Errors } from '@z-image/shared'
import type { ImageEditCapability, ImageEditRequest, ImageResult } from '../../core/types'
import { pollForResult, submitTask } from './task-client'

/** Verified to actually consume the input image — see `known-models.ts`. */
export const DEFAULT_EDIT_MODEL = 'Qwen/Qwen-Image-Edit-2511'

export const modelscopeEdit: ImageEditCapability = {
  async edit(request: ImageEditRequest, token?: string | null): Promise<ImageResult> {
    if (!token) throw Errors.authRequired('ModelScope')

    const t = token.trim()
    if (t.length < 8) throw Errors.authInvalid('ModelScope', 'Token is too short')

    if (!request.image) {
      throw Errors.invalidParams('image', 'An input image is required for editing')
    }

    const model = request.model || DEFAULT_EDIT_MODEL
    const seed = request.seed ?? Math.floor(Math.random() * 2147483647)
    const body: Record<string, unknown> = {
      prompt: request.prompt,
      model,
      image_url: request.image,
      seed,
    }

    // Only forward a size when the caller pinned one. Omitting it lets the
    // upstream follow the source image's aspect ratio instead of forcing 1:1.
    if (request.width && request.height) {
      body.size = `${request.width}x${request.height}`
    }
    if (request.steps !== undefined) body.steps = request.steps
    if (request.negativePrompt) body.negative_prompt = request.negativePrompt
    if (request.guidanceScale !== undefined) body.guidance = request.guidanceScale

    const taskId = await submitTask(t, body)
    const imageUrl = await pollForResult(t, taskId)
    return { url: imageUrl, seed, model }
  },
}
