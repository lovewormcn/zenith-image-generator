import { Errors, getModelsByProvider } from '@z-image/shared'
import { type Context, Hono } from 'hono'
import { ensureCustomChannelsInitialized, getChannel, getImageChannel } from '../channels'
import { MODELSCOPE_EDIT_MODELS } from '../channels/modelscope/known-models'
import {
  MODELSCOPE_GLOBAL_EDIT_MODELS,
  MODELSCOPE_GLOBAL_T2I_MODELS,
} from '../channels/modelscope-global/known-models'
import { parseTokens, runWithTokenRotation } from '../core/token-manager'
import { bodyLimit, rateLimitPresets, sendError, timeout } from '../middleware'
import { convertRequest, convertResponse, parseBearerToken } from './adapter'
import { handleChatCompletion } from './chat'
import { resolveModel } from './model-resolver'
import type { OpenAIImageRequest, OpenAIModelsListResponse } from './types'

/**
 * Derive the absolute origin (scheme + host) of the deployed API from the
 * incoming request. Used to build fully-qualified proxy URLs so clients can
 * access wrapped Gradio file URLs from any domain.
 *
 * Honors `X-Forwarded-Host` / `X-Forwarded-Proto` for deployments behind a
 * CDN or reverse proxy (e.g. Cloudflare Workers custom domain).
 */
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

function resolveImageChannel(modelParam?: string): { channelId: string; model: string } {
  const raw = (modelParam || '').trim()
  if (raw.startsWith('custom/')) {
    const rest = raw.slice('custom/'.length)
    const firstSlash = rest.indexOf('/')
    if (firstSlash > 0) {
      const channelId = rest.slice(0, firstSlash).trim()
      const model = rest.slice(firstSlash + 1).trim()
      if (channelId && model) return { channelId, model }
      if (channelId) return { channelId, model }
    }
  }

  const resolved = resolveModel(modelParam)
  return { channelId: resolved.provider, model: resolved.model }
}

function listModels(): OpenAIModelsListResponse {
  const created = 1700000000
  const giteeModels = getModelsByProvider('gitee').map((m) => m.id)
  const modelscopeModels = getModelsByProvider('modelscope').map((m) => m.id)
  const modelscopeGlobalModels = getModelsByProvider('modelscope-global').map((m) => m.id)
  const a4fModels = getModelsByProvider('a4f').map((m) => m.id)

  return {
    object: 'list',
    data: [
      ...['z-image-turbo', 'qwen-image-fast', 'ovis-image', 'flux-1-schnell'].map((id) => ({
        id,
        object: 'model' as const,
        created,
        owned_by: 'huggingface',
      })),
      ...giteeModels.flatMap((id) => {
        const entries = [{ id: `gitee/${id}`, owned_by: 'gitee' }]
        if (id === 'Qwen-Image') entries.push({ id: 'gitee/qwen-image', owned_by: 'gitee' })
        if (id === 'FLUX_1-Krea-dev')
          entries.push({ id: 'gitee/flux-1-krea-dev', owned_by: 'gitee' })
        if (id === 'FLUX.1-dev') entries.push({ id: 'gitee/flux-1-dev', owned_by: 'gitee' })
        return entries.map((e) => ({ ...e, object: 'model' as const, created }))
      }),
      ...modelscopeModels.flatMap((id) => {
        const entries = [{ id: `ms/${id}`, owned_by: 'modelscope' }]
        if (id === 'Tongyi-MAI/Z-Image-Turbo')
          entries.push({ id: 'ms/z-image-turbo', owned_by: 'modelscope' })
        if (id === 'black-forest-labs/FLUX.2-dev')
          entries.push({ id: 'ms/flux-2', owned_by: 'modelscope' })
        if (id === 'black-forest-labs/FLUX.1-Krea-dev')
          entries.push({ id: 'ms/flux-1-krea-dev', owned_by: 'modelscope' })
        if (id === 'MusePublic/489_ckpt_FLUX_1')
          entries.push({ id: 'ms/flux-1', owned_by: 'modelscope' })
        return entries.map((e) => ({ ...e, object: 'model' as const, created }))
      }),
      // Image-edit models (served by POST /v1/images/edits).
      ...MODELSCOPE_EDIT_MODELS.flatMap((m) => {
        const ids = [`ms/${m.id}`]
        if (m.alias) ids.push(`ms/${m.alias}`)
        return ids.map((id) => ({
          id,
          object: 'model' as const,
          created,
          owned_by: 'modelscope',
        }))
      }),
      ...modelscopeGlobalModels.flatMap((id) => {
        const entries = [{ id: `msg/${id}`, owned_by: 'modelscope-global' }]
        const alias = MODELSCOPE_GLOBAL_T2I_MODELS.find((m) => m.id === id)?.alias
        if (alias) entries.push({ id: `msg/${alias}`, owned_by: 'modelscope-global' })
        return entries.map((e) => ({ ...e, object: 'model' as const, created }))
      }),
      // Global-endpoint edit models (fallback path; see known-models.ts).
      ...MODELSCOPE_GLOBAL_EDIT_MODELS.flatMap((m) => {
        const ids = [`msg/${m.id}`]
        if (m.alias) ids.push(`msg/${m.alias}`)
        return ids.map((id) => ({
          id,
          object: 'model' as const,
          created,
          owned_by: 'modelscope-global',
        }))
      }),
      ...a4fModels.map((id) => ({
        id: `a4f/${id}`,
        object: 'model' as const,
        created,
        owned_by: 'a4f',
      })),
    ],
  }
}

export function registerOpenAIRoutes(app: Hono) {
  const v1 = new Hono().basePath('/v1')

  // Scoped to this module's paths on purpose: a blanket `/*` mount here is
  // evaluated before the separately-registered edits sub-app and would cap
  // edits at 120s, which is below their real render time.
  v1.use('/models', timeout(120000))
  v1.use('/images/generations', timeout(120000))
  v1.use('/chat/completions', timeout(120000))

  v1.post('/images/generations', bodyLimit(50 * 1024), rateLimitPresets.generate, async (c) => {
    ensureCustomChannelsInitialized(
      c.env as unknown as Record<string, string | undefined> | undefined
    )

    let body: OpenAIImageRequest
    try {
      body = (await c.req.json()) as OpenAIImageRequest
    } catch {
      return sendError(c, Errors.invalidParams('body', 'Invalid JSON body'))
    }

    if (!body?.prompt) {
      return sendError(c, Errors.invalidPrompt('Prompt is required'))
    }

    if (body.n !== undefined && body.n !== 1) {
      return sendError(c, Errors.invalidParams('n', 'Only n=1 is supported'))
    }

    if (body.response_format !== undefined && body.response_format !== 'url') {
      return sendError(
        c,
        Errors.invalidParams('response_format', "Only response_format='url' is supported")
      )
    }

    const { channelId, model } = resolveImageChannel(body.model)
    const auth = parseBearerToken(c.req.header('Authorization'))

    if (auth.providerHint && auth.providerHint !== channelId) {
      return sendError(
        c,
        Errors.invalidParams(
          'Authorization',
          'Token prefix does not match requested model provider'
        )
      )
    }

    const channel = getChannel(channelId)
    const imageChannel = getImageChannel(channelId)
    if (!channel || !imageChannel) {
      return sendError(c, Errors.invalidProvider(channelId))
    }

    const resolvedModel = model || channel.config.imageModels?.[0]?.id

    const allowAnonymous =
      channel.config.auth.type === 'none' || channel.config.auth.optional === true
    const headerTokens = parseTokens(auth.token)
    const tokens = headerTokens.length ? headerTokens : channel.config.tokens || []
    if (!allowAnonymous && tokens.length === 0) {
      return sendError(c, Errors.authRequired(channel.name))
    }

    try {
      const internalReq = convertRequest(body)
      const result = await runWithTokenRotation(
        channel.id,
        tokens,
        (token) => imageChannel.generate({ ...internalReq, model: resolvedModel }, token),
        { allowAnonymous }
      )
      // Convert to OpenAI-compatible response. Pass the request origin so
      // Gradio file URLs are wrapped with a fully-qualified proxy URL.
      return c.json(convertResponse(result, getRequestOrigin(c)))
    } catch (err) {
      return sendError(c, err)
    }
  })

  v1.get('/models', rateLimitPresets.readonly, (c) => c.json(listModels()))

  v1.post(
    '/chat/completions',
    bodyLimit(50 * 1024),
    rateLimitPresets.optimize,
    handleChatCompletion
  )

  app.route('/', v1)
}
