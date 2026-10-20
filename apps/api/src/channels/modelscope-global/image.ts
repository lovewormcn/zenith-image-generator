import { Errors } from '@z-image/shared'
import type { ImageCapability, ImageRequest, ImageResult } from '../../core/types'
import { pollForResult, submitTask } from './task-client'

export const modelscopeGlobalImage: ImageCapability = {
  async generate(request: ImageRequest, token?: string | null): Promise<ImageResult> {
    if (!token) throw Errors.authRequired('ModelScope Global')

    const t = token.trim()
    if (t.length < 8) throw Errors.authInvalid('ModelScope Global', 'Token is too short')

    const sizeString = `${request.width}x${request.height}`
    const seed = request.seed ?? Math.floor(Math.random() * 2147483647)
    const body: Record<string, unknown> = {
      prompt: request.prompt,
      model: request.model || 'Tongyi-MAI/Z-Image-Turbo',
      size: sizeString,
      seed,
      steps: request.steps ?? 9,
    }

    if (request.negativePrompt) body.negative_prompt = request.negativePrompt
    if (request.guidanceScale !== undefined) body.guidance = request.guidanceScale
    if (request.loras) body.loras = request.loras

    const taskId = await submitTask(t, body)
    const imageUrl = await pollForResult(t, taskId)
    return { url: imageUrl, seed, model: body.model as string }
  },
}
