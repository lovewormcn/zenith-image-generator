/**
 * OpenAI-compatible image edit endpoint (POST /v1/images/edits).
 * Mocks fetch, so no real upstream calls are made.
 */

import { ApiErrorCode } from '@z-image/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app'
import { modelscopeConfig } from '../../channels/modelscope/config'
import { resolveModel } from '../model-resolver'

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** 1x1 transparent PNG as raw bytes, for multipart uploads. */
const TINY_PNG_BYTES = Uint8Array.from(atob(TINY_PNG_BASE64), (c) => c.charCodeAt(0))

const TOKEN = 'test-token-12345'

function mockUpstreamSuccess(mockFetch: ReturnType<typeof vi.mocked<typeof fetch>>) {
  // Task submission
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ task_id: 'task-1' }),
  } as Response)
  // Task polling
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      task_status: 'SUCCEED',
      output_images: ['https://example.com/edited.png'],
    }),
  } as Response)
}

describe('POST /v1/images/edits', () => {
  const app = createApp()

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    if (modelscopeConfig.asyncMode) {
      modelscopeConfig.asyncMode.pollIntervalMs = 0
      modelscopeConfig.asyncMode.maxPollAttempts = 3
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('accepts multipart/form-data and returns an OpenAI-style payload', async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const form = new FormData()
    form.set('model', 'ms/qwen-image-edit-2511')
    form.set('prompt', 'make it watercolor')
    form.set('image', new Blob([TINY_PNG_BYTES], { type: 'image/png' }), 'in.png')

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ms:${TOKEN}` },
      body: form,
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as { created: number; data: Array<{ url: string }> }
    expect(json.created).toBeTypeOf('number')
    expect(json.data[0]?.url).toBe('https://example.com/edited.png')

    // The upstream request must carry the model and a data URL for the image.
    const submitCall = mockFetch.mock.calls[0]
    expect(submitCall?.[0]).toContain('/images/generations')
    const sent = JSON.parse((submitCall?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >
    expect(sent.model).toBe('Qwen/Qwen-Image-Edit-2511')
    expect(sent.prompt).toBe('make it watercolor')
    expect(String(sent.image_url)).toMatch(/^data:image\/png;base64,/)
  })

  it('accepts a JSON body with a base64 image', async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ms:${TOKEN}`,
      },
      body: JSON.stringify({
        model: 'Qwen/Qwen-Image-Edit-2511',
        prompt: 'add a hat',
        image: `data:image/png;base64,${TINY_PNG_BASE64}`,
      }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: Array<{ url: string }> }
    expect(json.data[0]?.url).toBe('https://example.com/edited.png')
  })

  it('defaults to the Qwen edit model when no model is given', async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const form = new FormData()
    form.set('prompt', 'repaint')
    form.set('image', new Blob([TINY_PNG_BYTES], { type: 'image/png' }), 'in.png')

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ms:${TOKEN}` },
      body: form,
    })

    expect(res.status).toBe(200)
    const sent = JSON.parse((mockFetch.mock.calls[0]?.[1] as RequestInit).body as string) as Record<
      string,
      unknown
    >
    expect(sent.model).toBe('Qwen/Qwen-Image-Edit-2511')
  })

  it('rejects a text-to-image-only model instead of silently generating something new', async () => {
    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ms:${TOKEN}`,
      },
      body: JSON.stringify({
        model: 'ms/z-image-turbo',
        prompt: 'make it watercolor',
        image: `data:image/png;base64,${TINY_PNG_BASE64}`,
      }),
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: { code: string } }
    expect(json.error.code).toBe(ApiErrorCode.INVALID_MODEL)
    // No upstream call should have been attempted.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it('requires an input image', async () => {
    const form = new FormData()
    form.set('prompt', 'do something')

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ms:${TOKEN}` },
      body: form,
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: { code: string } }
    expect(json.error.code).toBe(ApiErrorCode.INVALID_PARAMS)
  })

  it('requires a prompt', async () => {
    const form = new FormData()
    form.set('image', new Blob([TINY_PNG_BYTES], { type: 'image/png' }), 'in.png')

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ms:${TOKEN}` },
      body: form,
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: { code: string } }
    expect(json.error.code).toBe(ApiErrorCode.INVALID_PROMPT)
  })

  it('requires a ModelScope token', async () => {
    const form = new FormData()
    form.set('prompt', 'x')
    form.set('image', new Blob([TINY_PNG_BYTES], { type: 'image/png' }), 'in.png')

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      body: form,
    })

    expect(res.status).toBe(401)
    const json = (await res.json()) as { error: { code: string } }
    expect(json.error.code).toBe(ApiErrorCode.AUTH_REQUIRED)
  })

  it('rejects n != 1', async () => {
    const form = new FormData()
    form.set('prompt', 'x')
    form.set('n', '2')
    form.set('image', new Blob([TINY_PNG_BYTES], { type: 'image/png' }), 'in.png')

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ms:${TOKEN}` },
      body: form,
    })

    expect(res.status).toBe(400)
  })

  it('rejects an unsupported content type', async () => {
    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Authorization: `Bearer ms:${TOKEN}` },
      body: 'hello',
    })

    expect(res.status).toBe(400)
  })

  it('rejects a token prefix that contradicts the routed provider', async () => {
    const form = new FormData()
    form.set('prompt', 'x')
    form.set('model', 'ms/qwen-image-edit-2511')
    form.set('image', new Blob([TINY_PNG_BYTES], { type: 'image/png' }), 'in.png')

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer gitee:${TOKEN}` },
      body: form,
    })

    expect(res.status).toBe(400)
  })
})

describe('GET /v1/models includes edit models', () => {
  it('lists the Qwen edit models', async () => {
    const app = createApp()
    const res = await app.request('/v1/models')
    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: Array<{ id: string }> }
    const ids = json.data.map((m) => m.id)
    expect(ids).toContain('ms/qwen-image-edit-2511')
    expect(ids).toContain('ms/Qwen/Qwen-Image-Edit-2511')
  })
})

describe('resolveModel: provider prefixes are the routing contract', () => {
  it.each([
    ['ms/qwen-image-edit-2511', 'Qwen/Qwen-Image-Edit-2511'],
    ['ms/qwen-image-edit-2509', 'Qwen/Qwen-Image-Edit-2509'],
  ])('routes prefixed %s to modelscope/%s', (input, expected) => {
    expect(resolveModel(input)).toEqual({ provider: 'modelscope', model: expected })
  })

  it('routes a bare upstream id to ModelScope', () => {
    expect(resolveModel('Qwen/Qwen-Image-Edit-2511')).toEqual({
      provider: 'modelscope',
      model: 'Qwen/Qwen-Image-Edit-2511',
    })
  })

  // No prefix means HuggingFace: a bare short alias must NOT be captured by
  // ModelScope, otherwise the `hf/` semantics are bypassed.
  it('falls back to HuggingFace for unprefixed short aliases', () => {
    expect(resolveModel('qwen-image-edit-2511').provider).toBe('huggingface')
    expect(resolveModel('totally-unknown').provider).toBe('huggingface')
    expect(resolveModel(undefined).provider).toBe('huggingface')
  })
})
