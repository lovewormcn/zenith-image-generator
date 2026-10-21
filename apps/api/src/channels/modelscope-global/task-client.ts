import { Errors } from '@z-image/shared'
import { modelscopeGlobalConfig } from './config'

interface TaskResponse {
  task_id?: string
  task_status?: string
}

interface TaskStatusResponse {
  task_status?: 'PENDING' | 'RUNNING' | 'SUCCEED' | 'FAILED'
  output_images?: string[]
  error_message?: string
  errors?: { message?: string; code?: number }
}

interface ErrorResponse {
  message?: string
  error?: string
  errors?: { message?: string }
  code?: string
}

const PROVIDER = 'ModelScope Global'

function parseModelScopeGlobalError(status: number, data: ErrorResponse): Error {
  const message = data.errors?.message || data.error || data.message || `HTTP ${status}`

  if (
    status === 401 ||
    status === 403 ||
    message.toLowerCase().includes('unauthorized') ||
    message.toLowerCase().includes('invalid token')
  ) {
    return Errors.authInvalid(PROVIDER, message)
  }

  if (
    status === 429 ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('too many')
  ) {
    return Errors.rateLimited(PROVIDER)
  }

  if (
    message.toLowerCase().includes('quota') ||
    message.toLowerCase().includes('exceeded') ||
    message.toLowerCase().includes('insufficient')
  ) {
    return Errors.quotaExceeded(PROVIDER)
  }

  if (message.toLowerCase().includes('expired')) {
    return Errors.authExpired(PROVIDER)
  }

  // See the domestic channel's task-client: an unknown model or LoRA id is
  // reported as HTTP 500 with "Model Exception" / "模型不存在", never a 404.
  if (
    message.includes('模型不存在') ||
    /model exception/i.test(message) ||
    /apiInferModelDownload/i.test(message) ||
    /model not exist/i.test(message)
  ) {
    return Errors.invalidParams(
      'model',
      `${PROVIDER} does not expose this model or LoRA adapter for API inference: ${message}`
    )
  }

  return Errors.providerError(PROVIDER, message)
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function submitTask(token: string, body: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${modelscopeGlobalConfig.baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(modelscopeGlobalConfig.asyncMode?.headers || {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errData = (await response.json().catch(() => ({}))) as ErrorResponse
    throw parseModelScopeGlobalError(response.status, errData)
  }

  const data = (await response.json()) as TaskResponse
  if (!data.task_id) throw Errors.generationFailed(PROVIDER, 'No task_id returned')
  return data.task_id
}

/**
 * Poll until the async task finishes.
 *
 * The global endpoint renders far slower than the domestic one: a single
 * edit measured ~150s, so the edit channel passes a larger `maxAttempts`
 * than the default generation budget.
 */
export async function pollForResult(
  token: string,
  taskId: string,
  maxAttemptsOverride?: number
): Promise<string> {
  const maxAttempts = maxAttemptsOverride ?? modelscopeGlobalConfig.asyncMode?.maxPollAttempts ?? 35
  const pollIntervalMs = modelscopeGlobalConfig.asyncMode?.pollIntervalMs ?? 3000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`${modelscopeGlobalConfig.baseUrl}/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-ModelScope-Task-Type': 'image_generation',
      },
    })

    if (!response.ok) {
      const errData = (await response.json().catch(() => ({}))) as ErrorResponse
      throw parseModelScopeGlobalError(response.status, errData)
    }

    const data = (await response.json()) as TaskStatusResponse
    const status = data.task_status

    if (status === 'SUCCEED') {
      const url = data.output_images?.[0]
      if (!url) throw Errors.generationFailed(PROVIDER, 'No image in result')
      return url
    }

    if (status === 'FAILED') {
      const detail = data.error_message || data.errors?.message || ''
      throw Errors.generationFailed(PROVIDER, detail || 'Task failed')
    }

    await delay(pollIntervalMs)
  }

  throw Errors.timeout(PROVIDER)
}
