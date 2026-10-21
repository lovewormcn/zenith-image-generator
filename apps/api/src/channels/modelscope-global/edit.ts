import { Errors } from '@z-image/shared'
import type { ImageEditCapability, ImageEditRequest, ImageResult } from '../../core/types'
import { MODELSCOPE_GLOBAL_DEFAULT_EDIT_MODEL } from './known-models'
import { pollForResult, submitTask } from './task-client'

/**
 * Fallback edit path for the global endpoint.
 *
 * Quality is materially below the domestic Qwen edit models — expect a
 * washed-out result — and a single edit measured ~150s. It exists so a
 * domestic outage has a usable escape hatch, not as a first choice.
 */
export const modelscopeGlobalEdit: ImageEditCapability = {
  async edit(request: ImageEditRequest, token?: string | null): Promise<ImageResult> {
    if (!token) throw Errors.authRequired('ModelScope Global')

    const t = token.trim()
    if (t.length < 8) throw Errors.authInvalid('ModelScope Global', 'Token is too short')

    if (!request.image) {
      throw Errors.invalidParams('image', 'An input image is required for editing')
    }

    const model = request.model || MODELSCOPE_GLOBAL_DEFAULT_EDIT_MODEL
    const seed = request.seed ?? Math.floor(Math.random() * 2147483647)
    const allImages = [request.image, ...(request.images ?? [])].filter(Boolean)
    const body: Record<string, unknown> = {
      prompt: request.prompt,
      model,
      image_url: allImages.length > 1 ? allImages : request.image,
      seed,
    }

    if (request.width && request.height) {
      body.size = `${request.width}x${request.height}`
    }
    if (request.steps !== undefined) body.steps = request.steps
    if (request.negativePrompt) body.negative_prompt = request.negativePrompt
    if (request.guidanceScale !== undefined) body.guidance = request.guidanceScale
    if (request.loras) body.loras = request.loras

    const taskId = await submitTask(t, body)
    // Slower than the domestic endpoint (~150s measured): 95 x 3s = 285s,
    // still inside the edit route's 300s timeout.
    const imageUrl = await pollForResult(t, taskId, 95)
    return { url: imageUrl, seed, model }
  },
}
