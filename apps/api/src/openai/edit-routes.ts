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

/** Parse a multipart edit request into plain fields. */
async function readMultipart(c: Context): Promise<EditFields> {
  const body = await c.req.parseBody()
  const fields: EditFields = {
    prompt: stringField(body.prompt),
    model: stringField(body.model),
    size: stringField(body.size),
    negativePrompt: stringField(body.negative_prompt),
    seed: numberField(body.seed),
    steps: numberField(body.steps ?? body.num_inference_steps),
    guidanceScale: numberField(body.guidance_scale ?? body.cfg_scale),
    n: numberField(body.n),
  }

  const image = body.image
  if (typeof image === 'string') {
    fields.image = image
  } else if (image instanceof Blob) {
    fields.image = await blobToDataUrl(image)
  } else if (Array.isArray(image)) {
    const first: unknown = image[0]
    if (first instanceof Blob) fields.image = await blobToDataUrl(first)
    else if (typeof first === 'string') fields.image = first
  }

  // `mask` is intentionally not read: see the module docstring.
  return fields
}

function readJson(body: Record<string, unknown>): EditFields {
  const imageField = body.image ?? body.image_url ?? body.init_image
  return {
    prompt: stringField(body.prompt),
    model: stringField(body.model),
    size: stringField(body.size),
    negativePrompt: stringField(body.negative_prompt),
    seed: numberField(body.seed),
    steps: numberField(body.steps ?? body.num_inference_steps),
    guidanceScale: numberField(body.guidance_scale ?? body.cfg_scale),
    n: numberField(body.n),
    image: stringField(imageField),
  }
}

/**
 * Reject models that are known to be text-to-image only. Without this an
 * "edit" call aimed at e.g. Z-Image-Turbo would silently return an unrelated
 * picture, which is exactly the failure mode the catalogue guards against.
 */
function assertEditCapable(resolved: { provider: string; model: string }): void {
  if (resolved.provider !== 'modelscope') {
    throw Errors.invalidModel(resolved.model, resolved.provider)
  }
  const known = MODELSCOPE_EDIT_MODELS.some((m) => m.id === resolved.model)
  const looksLikeEditModel = /image-edit/i.test(resolved.model)
  if (!known && !looksLikeEditModel) {
    throw Errors.invalidModel(resolved.model, resolved.provider)
  }
}

export function registerOpenAIEditRoutes(app: Hono) {
  const v1 = new Hono().basePath('/v1')

  v1.use('/*', timeout(120000))

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
    try {
      image = await normalizeImageInput(fields.image)
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
