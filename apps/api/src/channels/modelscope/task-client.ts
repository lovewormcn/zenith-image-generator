import { Errors } from '@z-image/shared'
import { modelscopeConfig } from './config'

interface ModelScopeTaskResponse {
  task_id?: string
  task_status?: string
}

interface ModelScopeTaskStatusResponse {
  task_status?: 'PENDING' | 'RUNNING' | 'SUCCEED' | 'FAILED'
  output_images?: string[]
  error_message?: string
  errors?: { message?: string; code?: number }
}

interface ModelScopeErrorResponse {
  message?: string
  error?: string
  errors?: { message?: string }
  code?: string
}

function parseModelScopeError(status: number, data: ModelScopeErrorResponse): Error {
  const provider = 'ModelScope'
  const message = data.errors?.message || data.error || data.message || `HTTP ${status}`

  if (
    status === 401 ||
    status === 403 ||
    message.toLowerCase().includes('unauthorized') ||
    message.toLowerCase().includes('invalid token')
  ) {
    return Errors.authInvalid(provider, message)
  }

  if (
    status === 429 ||
    message.toLowerCase().includes('rate limit') ||
    message.toLowerCase().includes('too many')
  ) {
    return Errors.rateLimited(provider)
  }

  if (
    message.toLowerCase().includes('quota') ||
    message.toLowerCase().includes('exceeded') ||
    message.toLowerCase().includes('insufficient')
  ) {
    return Errors.quotaExceeded(provider)
  }

  if (message.toLowerCase().includes('expired')) {
    return Errors.authExpired(provider)
  }

  return Errors.providerError(provider, message)
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function submitTask(token: string, body: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${modelscopeConfig.baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(modelscopeConfig.asyncMode?.headers || {}),
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errData = (await response.json().catch(() => ({}))) as ModelScopeErrorResponse
    throw parseModelScopeError(response.status, errData)
  }

  const data = (await response.json()) as ModelScopeTaskResponse
  if (!data.task_id) throw Errors.generationFailed('ModelScope', 'No task_id returned')
  return data.task_id
}

export async function pollForResult(token: string, taskId: string): Promise<string> {
  const maxAttempts = modelscopeConfig.asyncMode?.maxPollAttempts ?? 35
  const pollIntervalMs = modelscopeConfig.asyncMode?.pollIntervalMs ?? 3000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await fetch(`${modelscopeConfig.baseUrl}/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-ModelScope-Task-Type': 'image_generation',
      },
    })

    if (!response.ok) {
      const errData = (await response.json().catch(() => ({}))) as ModelScopeErrorResponse
      throw parseModelScopeError(response.status, errData)
    }

    const data = (await response.json()) as ModelScopeTaskStatusResponse
    const status = data.task_status

    if (status === 'SUCCEED') {
      const url = data.output_images?.[0]
      if (!url) throw Errors.generationFailed('ModelScope', 'No image in result')
      return url
    }

    if (status === 'FAILED') {
      // The upstream frequently reports FAILED with an empty message and the
      // real cause buried in `errors`, so surface both.
      const detail = data.error_message || data.errors?.message || ''
      throw Errors.generationFailed('ModelScope', detail || 'Task failed')
    }

    await delay(pollIntervalMs)
  }

  throw Errors.timeout('ModelScope')
}
