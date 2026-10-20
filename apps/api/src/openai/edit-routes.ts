/**
 * OpenAI-compatible image editing: `POST /v1/images/edits`.
 *
 * Accepts the standard multipart body (`image`, optional `mask`, `prompt`,
 * `model`, `size`) and also a JSON body carrying `image` as a data URL /
 * base64 / http(s) URL, because several clients in this project's path
 * (newapi relays, dsh-image-gen) find multipart awkward to construct.
 *
 * `mask` is accepted for wire-compatibility but ignored: none of the verified
 * upstream models implement OpenAI-style masked inpainting.
 */

import { Errors } from '@z-image/shared'
import { type Context, Hono } from 'hono'
import { ensureCustomChannelsInitialized, getChannel } from '../channels'
import {
  MODELSCOPE_DEFAULT_EDIT_MODEL,
  MODELSCOPE_EDIT_MODELS,
} from '../channels/modelscope/known-models'
import { MODELSCOPE_GLOBAL_EDIT_MODELS } from '../channels/modelscope-global/known-models'
import { parseTokens, runWithTokenRotation } from '../core/token-manager'
import { bodyLimit, rateLimitPresets, sendError, timeout } from '../middleware'
import { convertResponse, parseBearerToken, parseSize } from './adapter'
import { blobToDataUrl, normalizeImageInput } from './edit-input'
import { resolveModel } from './model-resolver'

/** Edits carry base64 image payloads, so the 50KB generation limit is far too small. */
const EDIT_BODY_LIMIT = 16 * 1024 * 1024

interface EditFields {
  prompt?: string
  model?: string
  size?: string
  image?: string
  /** Extra fusion images, in order after `image`. */
  imageExtras?: string[]
  seed?: number
  steps?: number
  negativePrompt?: string
  guidanceScale?: number
  n?: number
}

function getRequestOrigin(c: Context): string {
  const forwardedHost = c.req.header('x-forwarded-host')
  const forwardedProto = c.req.header('x-forwarded-proto')
  try {
    const parsed = new URL(c.req.url)
    const host = forwardedHost || parsed.host
    const proto = forwardedProto || parsed.protocol.replace(':', '')
    return `${proto}://${host}`
  } catch {
    return ''
  }
}

function numberField(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function stringField(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  const s = String(value).trim()
  return s ? s : undefined
}

/**
 * Normalize the many ways clients spell "more than one input image".
 *
 * OpenAI's own edits API is single-image, but multi-image fusion is a real
 * capability of the Qwen edit models, so we accept the common shapes:
 * `images` / `images[]` as strings, or as `{ image_url }` objects (the shape
 * dsh-image-gen's `jsonImageUrlArray` format sends). The primary image always
 * comes first, matching `image` then each extra.
 */
function collectExtraImages(body: Record<string, unknown>): string[] {
  const candidates: unknown[] = [body.images, body['images[]'], body.image_2, body.image2]
  const fromList = candidates.flatMap((v) => (Array.isArray(v) ? v : [v]))
  const extras: string[] = []
  for (const value of fromList) {
    const s = imageEntry(value)
    // Dedupe by identity only, never by content: the same image legitimately
    // appears twice when a caller passes it as both primary and material.
    if (s) extras.push(s)
  }
  return extras
}

/** Accept `"data:..."`, `{ image_url }`, `{ url }`, or `{ b64_json }` entries. */
function imageEntry(value: unknown): string | undefined {
  const direct = stringField(value)
  if (direct) return direct
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>
    return stringField(o.image_url) ?? stringField(o.url) ?? stringField(o.b64_json)
  }
  return undefined
}

/**
 * Parse a multipart edit request into plain fields.
 *
 * Uses `formData()` rather than `parseBody()` because Hono's `parseBody`
 * collapses repeated fields to the *last* value, which would silently drop
 * every extra fusion image. `FormData.getAll` preserves them in order.
 */
async function readMultipart(c: Context): Promise<EditFields> {
  const form = await c.req.formData()
  const get = (name: string): unknown => form.get(name) ?? undefined
  const fields: EditFields = {
    prompt: stringField(get('prompt')),
    model: stringField(get('model')),
    size: stringField(get('size')),
    negativePrompt: stringField(get('negative_prompt')),
    seed: numberField(get('seed')),
    steps: numberField(get('steps') ?? get('num_inference_steps')),
    guidanceScale: numberField(get('guidance_scale') ?? get('cfg_scale')),
    n: numberField(get('n')),
  }

  // Input images arrive under several names depending on the client. The
  // OpenAI SDK sends `image`; dsh-image-gen (the primary consumer) switches to
  // `image[]` as soon as there is more than one image, and its alternative
  // `formReferenceImages` format sends a single `reference_images` JSON field
  // holding bare base64 strings. Missing any of these silently drops images.
  const imageNames = ['image', 'image[]', 'images', 'images[]', 'image_2', 'image2']
  const collected: string[] = []
  for (const name of imageNames) {
    const values: unknown[] = form.getAll(name)
    for (const value of await Promise.all(values.map(toImageValue))) {
      if (value) collected.push(value)
    }
  }
  collected.push(...(await readReferenceImages(form.get('reference_images'))))

  fields.image = collected[0]
  fields.imageExtras = collected.slice(1)

  // `mask` is intentionally not read: see the module docstring.
  return fields
}

/**
 * Decode the `reference_images` JSON field: an array of bare base64 strings
 * (no `data:` prefix), as sent by dsh-image-gen's formReferenceImages format.
 */
async function readReferenceImages(raw: unknown): Promise<string[]> {
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (!text) return []
  try {
    const parsed: unknown = JSON.parse(text)
    const list = Array.isArray(parsed) ? parsed : [parsed]
    return list
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean)
      .map((v) => (v.startsWith('data:') ? v : `data:image/png;base64,${v}`))
  } catch {
    // A malformed reference_images field is not worth failing the request
    // over when a primary `image` part may still be usable.
    return []
  }
}

/** Convert a multipart part (Blob or string) into a data URL. */
async function toImageValue(value: unknown): Promise<string | undefined> {
  if (value instanceof Blob) return blobToDataUrl(value)
  return stringField(value)
}

function readJson(body: Record<string, unknown>): EditFields {
  const imageField = body.image ?? body.image_url ?? body.init_image
  const imageList = Array.isArray(imageField) ? imageField : [imageField]
  // Extras come before `ordered` is split so `images`-only callers (such as
  // dsh-image-gen's jsonImageUrlArray) still yield a primary image.
  const extras = collectExtraImages(body)
  const ordered = [...imageList.map(imageEntry), ...extras].filter((v): v is string => Boolean(v))
  const primary = ordered[0]
  return {
    prompt: stringField(body.prompt),
    model: stringField(body.model),
    size: stringField(body.size),
    negativePrompt: stringField(body.negative_prompt),
    seed: numberField(body.seed),
    steps: numberField(body.steps ?? body.num_inference_steps),
    guidanceScale: numberField(body.guidance_scale ?? body.cfg_scale),
    n: numberField(body.n),
    image: primary,
    imageExtras: ordered.slice(1),
  }
}

/**
 * Reject models that are known to be text-to-image only. Without this an
 * "edit" call aimed at e.g. Z-Image-Turbo would silently return an unrelated
 * picture, which is exactly the failure mode the catalogue guards against.
 */
function assertEditCapable(resolved: { provider: string; model: string }): void {
  const editCatalogue =
    resolved.provider === 'modelscope'
      ? MODELSCOPE_EDIT_MODELS
      : resolved.provider === 'modelscope-global'
        ? MODELSCOPE_GLOBAL_EDIT_MODELS
        : null
  if (!editCatalogue) {
    throw Errors.invalidModel(resolved.model, resolved.provider)
  }
  const known = editCatalogue.some((m) => m.id === resolved.model)
  const looksLikeEditModel = /image-edit/i.test(resolved.model)
  if (!known && !looksLikeEditModel) {
    throw Errors.invalidModel(resolved.model, resolved.provider)
  }
}

/**
 * Edits are slower than generation, and multi-image fusion slower still:
 * measured runs take ~70s for one image and 110-160s for two on the domestic
 * endpoint, and ~150s for a single edit on the global fallback. The route
 * timeout must exceed the channel's poll budget or the worker kills a task
 * that is still rendering — the global channel's budget is 195s.
 */
const EDIT_TIMEOUT_MS = 300000

export function registerOpenAIEditRoutes(app: Hono) {
  const v1 = new Hono().basePath('/v1')

  v1.use('/*', timeout(EDIT_TIMEOUT_MS))

  v1.post('/images/edits', bodyLimit(EDIT_BODY_LIMIT), rateLimitPresets.generate, async (c) => {
    ensureCustomChannelsInitialized(
      c.env as unknown as Record<string, string | undefined> | undefined
    )

    const contentType = c.req.header('content-type') || ''

    let fields: EditFields
    try {
      if (contentType.includes('multipart/form-data')) {
        fields = await readMultipart(c)
      } else if (contentType.includes('application/json')) {
        const raw = (await c.req.json()) as Record<string, unknown>
        fields = readJson(raw || {})
      } else {
        return sendError(
          c,
          Errors.invalidParams('Content-Type', 'Expected multipart/form-data or application/json')
        )
      }
    } catch (err) {
      return sendError(
        c,
        Errors.invalidParams('body', err instanceof Error ? err.message : 'Invalid request body')
      )
    }

    if (!fields.prompt) {
      return sendError(c, Errors.invalidPrompt('Prompt is required'))
    }

    if (!fields.image) {
      return sendError(c, Errors.invalidParams('image', 'An input image is required'))
    }

    if (fields.n !== undefined && fields.n !== 1) {
      return sendError(c, Errors.invalidParams('n', 'Only n=1 is supported'))
    }

    const resolved = resolveModel(fields.model?.trim() || `ms/${MODELSCOPE_DEFAULT_EDIT_MODEL}`)
    try {
      assertEditCapable(resolved)
    } catch (err) {
      return sendError(c, err)
    }

    const auth = parseBearerToken(c.req.header('Authorization'))
    if (auth.providerHint && auth.providerHint !== resolved.provider) {
      return sendError(
        c,
        Errors.invalidParams(
          'Authorization',
          'Token prefix does not match requested model provider'
        )
      )
    }

    const channel = getChannel(resolved.provider)
    const editChannel = channel?.imageEdit
    if (!channel || !editChannel) {
      return sendError(c, Errors.invalidProvider(resolved.provider))
    }

    let image: string
    let images: string[]
    try {
      image = await normalizeImageInput(fields.image)
      images = await Promise.all((fields.imageExtras ?? []).map((src) => normalizeImageInput(src)))
    } catch (err) {
      return sendError(
        c,
        Errors.invalidParams(
          'image',
          err instanceof Error ? err.message : 'Could not read the input image'
        )
      )
    }

    const { width, height } = fields.size
      ? parseSize(fields.size)
      : { width: undefined, height: undefined }

    const headerTokens = parseTokens(auth.token)
    const tokens = headerTokens.length ? headerTokens : channel.config.tokens || []
    const allowAnonymous =
      channel.config.auth.type === 'none' || channel.config.auth.optional === true
    if (!allowAnonymous && tokens.length === 0) {
      return sendError(c, Errors.authRequired(channel.name))
    }

    try {
      const result = await runWithTokenRotation(
        channel.id,
        tokens,
        (token) =>
          editChannel.edit(
            {
              prompt: fields.prompt!,
              image,
              images,
              model: resolved.model,
              width,
              height,
              seed: fields.seed,
              steps: fields.steps,
              negativePrompt: fields.negativePrompt,
              guidanceScale: fields.guidanceScale,
            },
            token
          ),
        { allowAnonymous }
      )
      return c.json(convertResponse(result, getRequestOrigin(c)))
    } catch (err) {
      return sendError(c, err)
    }
  })

  app.route('/', v1)
}
