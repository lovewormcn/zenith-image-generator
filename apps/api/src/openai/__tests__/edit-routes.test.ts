/**
 * OpenAI-compatible image edit endpoint (POST /v1/images/edits).
 * Mocks fetch, so no real upstream calls are made.
 */

import { ApiErrorCode } from '@z-image/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../../app'
import { modelscopeConfig } from '../../channels/modelscope/config'
import { modelscopeGlobalConfig } from '../../channels/modelscope-global/config'
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

describe('multi-image fusion', () => {
  const app = createApp()
  // The rate limiter is a module-level sliding window keyed on the token, so
  // each case gets its own token to stay under the per-window limit.
  let seq = 0
  let auth = ''

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    seq += 1
    auth = `Bearer ms:fusion-token-${seq}`
    if (modelscopeConfig.asyncMode) {
      modelscopeConfig.asyncMode.pollIntervalMs = 0
      modelscopeConfig.asyncMode.maxPollAttempts = 3
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Pull the `image_url` the route sent upstream on the submit call. */
  function submittedImageUrl(mockFetch: ReturnType<typeof vi.mocked<typeof fetch>>) {
    const init = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined
    const body = JSON.parse(String(init?.body)) as { image_url?: unknown }
    return body.image_url
  }

  it('sends a bare string for a single image (unchanged behaviour)', async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const form = new FormData()
    form.set('model', 'ms/qwen-image-edit-2511')
    form.set('prompt', 'watercolor')
    form.set('image', new Blob([TINY_PNG_BYTES], { type: 'image/png' }), 'a.png')

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: auth },
      body: form,
    })

    expect(res.status).toBe(200)
    const url = submittedImageUrl(mockFetch)
    expect(typeof url).toBe('string')
  })

  it('sends an ordered array when `image` is repeated in multipart', async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const form = new FormData()
    form.set('model', 'ms/qwen-image-edit-2511')
    form.set('prompt', 'put the card from image 2 in her hand')
    form.append('image', new Blob([TINY_PNG_BYTES], { type: 'image/png' }), 'a.png')
    form.append('image', new Blob([TINY_PNG_BYTES], { type: 'image/png' }), 'b.png')

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: auth },
      body: form,
    })

    expect(res.status).toBe(200)
    const url = submittedImageUrl(mockFetch)
    expect(Array.isArray(url)).toBe(true)
    expect(url).toHaveLength(2)
  })

  it('accepts a `images` array in a JSON body', async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'ms/qwen-image-edit-2511',
        prompt: 'fuse them',
        image: `data:image/png;base64,${TINY_PNG_BASE64}`,
        images: [`data:image/png;base64,${TINY_PNG_BASE64}`],
      }),
    })

    expect(res.status).toBe(200)
    const url = submittedImageUrl(mockFetch)
    expect(Array.isArray(url)).toBe(true)
    expect(url).toHaveLength(2)
  })

  it('treats an `image` array in JSON as primary plus extras', async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'ms/qwen-image-edit-2511',
        prompt: 'fuse them',
        image: [
          `data:image/png;base64,${TINY_PNG_BASE64}`,
          `data:image/png;base64,${TINY_PNG_BASE64}`,
        ],
      }),
    })

    expect(res.status).toBe(200)
    const url = submittedImageUrl(mockFetch)
    expect(Array.isArray(url)).toBe(true)
    expect(url).toHaveLength(2)
  })

  // dsh-image-gen switches to `image[]` as soon as there is more than one
  // image. Reading only `image` would silently send a single-image edit.
  it("reads dsh-image-gen's `image[]` multipart field", async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const form = new FormData()
    form.set('model', 'ms/qwen-image-edit-2511')
    form.set('prompt', 'fuse them')
    form.append('image[]', new Blob([TINY_PNG_BYTES], { type: 'image/png' }), 'reference-1.png')
    form.append('image[]', new Blob([TINY_PNG_BYTES], { type: 'image/png' }), 'reference-2.png')

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: auth },
      body: form,
    })

    expect(res.status).toBe(200)
    const url = submittedImageUrl(mockFetch)
    expect(Array.isArray(url)).toBe(true)
    expect(url).toHaveLength(2)
  })

  it("reads dsh-image-gen's `reference_images` base64 JSON field", async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const form = new FormData()
    form.set('model', 'ms/qwen-image-edit-2511')
    form.set('prompt', 'fuse them')
    form.set('reference_images', JSON.stringify([TINY_PNG_BASE64, TINY_PNG_BASE64]))

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: auth },
      body: form,
    })

    expect(res.status).toBe(200)
    const url = submittedImageUrl(mockFetch)
    expect(Array.isArray(url)).toBe(true)
    expect(url).toHaveLength(2)
  })

  it("reads dsh-image-gen's `jsonImageUrlArray` object entries", async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const dataUrl = `data:image/png;base64,${TINY_PNG_BASE64}`
    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'ms/qwen-image-edit-2511',
        prompt: 'fuse them',
        images: [{ image_url: dataUrl }, { image_url: dataUrl }],
        response_format: 'url',
      }),
    })

    expect(res.status).toBe(200)
    const url = submittedImageUrl(mockFetch)
    expect(Array.isArray(url)).toBe(true)
    expect(url).toHaveLength(2)
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

describe('ModelScope Global as an edit fallback', () => {
  const app = createApp()
  let seq = 0
  let auth = ''

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    seq += 1
    auth = `Bearer msg:global-token-${seq}`
    if (modelscopeGlobalConfig.asyncMode) {
      modelscopeGlobalConfig.asyncMode.pollIntervalMs = 0
      modelscopeGlobalConfig.asyncMode.maxPollAttempts = 3
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    ['msg/qwen-image-edit'],
    ['msg/Qwen/Qwen-Image-Edit'],
    ['msg/muse-qwen-image-edit'],
  ])('edits through %s', async (model) => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: 'make it watercolour', image: TINY_PNG_BASE64 }),
    })

    expect(res.status).toBe(200)
    const json = (await res.json()) as { data: Array<{ url: string }> }
    expect(json.data[0]?.url).toBe('https://example.com/edited.png')
  })

  // The global host does not carry the FLUX family at all; resolving those
  // aliases there would send a request that always 400s.
  it('does not inherit the domestic alias map', () => {
    expect(resolveModel('msg/flux-2')).toEqual({ provider: 'modelscope-global', model: 'flux-2' })
    expect(resolveModel('msg/z-image-turbo')).toEqual({
      provider: 'modelscope-global',
      model: 'Tongyi-MAI/Z-Image-Turbo',
    })
    expect(resolveModel('msg/qwen-image-2512')).toEqual({
      provider: 'modelscope-global',
      model: 'Qwen/Qwen-Image-2512',
    })
  })

  it('rejects a global text-to-image model', async () => {
    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'msg/z-image-turbo',
        prompt: 'make it watercolour',
        image: TINY_PNG_BASE64,
      }),
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: { code: string } }
    expect(json.error.code).toBe(ApiErrorCode.INVALID_MODEL)
  })

  it('rejects a domestic token against a global model', async () => {
    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: 'Bearer ms:some-token-123', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'msg/qwen-image-edit',
        prompt: 'make it watercolour',
        image: TINY_PNG_BASE64,
      }),
    })

    expect(res.status).toBe(400)
  })

  it('lists the global edit models', async () => {
    const res = await app.request('/v1/models')
    const json = (await res.json()) as { data: Array<{ id: string }> }
    const ids = json.data.map((m) => m.id)
    expect(ids).toContain('msg/qwen-image-edit')
    expect(ids).toContain('msg/muse-qwen-image-edit')
    // Aliases for models the global host does not serve must be gone.
    expect(ids).not.toContain('msg/flux-2')
    expect(ids).not.toContain('msg/flux-1-krea-dev')
  })
})

/** Read the JSON body of the nth upstream call made by a mocked fetch. */
function sentBody(mockFetch: ReturnType<typeof vi.mocked<typeof fetch>>, index = 0) {
  const call = mockFetch.mock.calls[index]
  return JSON.parse((call?.[1] as RequestInit).body as string) as Record<string, unknown>
}

describe('LoRA adapters', () => {
  const app = createApp()
  // A unique token per test keeps each request in its own rate-limit bucket
  // (the limiter keys on the bearer token, 10 requests/min).
  let seq = 0
  let auth = ''

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    seq += 1
    auth = `Bearer ms:lora-token-${seq}`
    if (modelscopeConfig.asyncMode) {
      modelscopeConfig.asyncMode.pollIntervalMs = 0
      modelscopeConfig.asyncMode.maxPollAttempts = 3
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards a multipart loras field as a JSON string to the upstream', async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const form = new FormData()
    form.set('model', 'ms/qwen-image-edit-2511')
    form.set('prompt', 'apply the style')
    form.set('image', new Blob([TINY_PNG_BYTES], { type: 'image/png' }), 'in.png')
    // dsh-image-gen stringifies extra body values, so a dict arrives as text.
    form.set('loras', '{"valiantcat/Qwen-Image-Edit-2509-photous":1}')

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: auth },
      body: form,
    })

    expect(res.status).toBe(200)
    expect(sentBody(mockFetch).loras).toEqual({
      'valiantcat/Qwen-Image-Edit-2509-photous': 1,
    })
  })

  it('forwards a JSON loras object', async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'ms/qwen-image-edit-2511',
        prompt: 'apply the style',
        image: TINY_PNG_BASE64,
        loras: { 'owner/a': 0.6, 'owner/b': 0.4 },
      }),
    })

    expect(res.status).toBe(200)
    expect(sentBody(mockFetch).loras).toEqual({ 'owner/a': 0.6, 'owner/b': 0.4 })
  })

  it('accepts a LoRA suffix on the model id', async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'ms/qwen-image-edit-2511+valiantcat/photo@0.8',
        prompt: 'apply the style',
        image: TINY_PNG_BASE64,
      }),
    })

    expect(res.status).toBe(200)
    const sent = sentBody(mockFetch)
    // The suffix must be stripped: it is not part of the upstream model id.
    expect(sent.model).toBe('Qwen/Qwen-Image-Edit-2511')
    expect(sent.loras).toEqual({ 'valiantcat/photo': 0.8 })
  })

  it('lets an explicit loras field win over the model suffix', async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'ms/qwen-image-edit-2511+owner/fromModel',
        prompt: 'apply the style',
        image: TINY_PNG_BASE64,
        loras: 'owner/fromField',
      }),
    })

    expect(res.status).toBe(200)
    expect(sentBody(mockFetch).loras).toBe('owner/fromField')
  })

  it('rejects more than six adapters before calling the upstream', async () => {
    const mockFetch = vi.mocked(fetch)

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'ms/qwen-image-edit-2511',
        prompt: 'apply the style',
        image: TINY_PNG_BASE64,
        loras: Array.from({ length: 7 }, (_, i) => `owner/lora${i}`),
      }),
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: { code: string; param?: string } }
    expect(json.error.code).toBe(ApiErrorCode.INVALID_PARAMS)
    expect(json.error.param).toBe('loras')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('turns an upstream "model does not exist" into a 400 with a clear hint', async () => {
    const mockFetch = vi.mocked(fetch)
    // Verified live: an unexposed LoRA id fails the submit with HTTP 500 and
    // this message, not with a 404.
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({
        errors: {
          message: 'apiInferModelDownload call failed: Model Exception: 模型不存在',
        },
      }),
    } as Response)

    const res = await app.request('/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'ms/qwen-image-edit-2511',
        prompt: 'apply the style',
        image: TINY_PNG_BASE64,
        loras: 'someone/not-exposed-lora',
      }),
    })

    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: { code: string; message: string } }
    expect(json.error.code).toBe(ApiErrorCode.INVALID_PARAMS)
    expect(json.error.message).toMatch(/does not expose this model or LoRA adapter/)
  })
})

describe('LoRA adapters on /v1/images/generations', () => {
  const app = createApp()
  let seq = 0
  let auth = ''

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    seq += 1
    auth = `Bearer ms:gen-lora-token-${seq}`
    if (modelscopeConfig.asyncMode) {
      modelscopeConfig.asyncMode.pollIntervalMs = 0
      modelscopeConfig.asyncMode.maxPollAttempts = 3
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('forwards a text-to-image loras field to the upstream', async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const res = await app.request('/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'ms/z-image-turbo',
        prompt: 'a portrait',
        size: '1024x1024',
        loras: 'ChaosMY/MYkawaii4MJ',
      }),
    })

    expect(res.status).toBe(200)
    const sent = sentBody(mockFetch)
    expect(sent.model).toBe('Tongyi-MAI/Z-Image-Turbo')
    expect(sent.loras).toBe('ChaosMY/MYkawaii4MJ')
  })

  it('accepts a LoRA suffix on a generation model id', async () => {
    const mockFetch = vi.mocked(fetch)
    mockUpstreamSuccess(mockFetch)

    const res = await app.request('/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'ms/flux-2+owner/style@0.5',
        prompt: 'a portrait',
        size: '1024x1024',
      }),
    })

    expect(res.status).toBe(200)
    const sent = sentBody(mockFetch)
    expect(sent.model).toBe('black-forest-labs/FLUX.2-dev')
    expect(sent.loras).toEqual({ 'owner/style': 0.5 })
  })
})
