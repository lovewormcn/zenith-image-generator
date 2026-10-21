/**
 * LoRA adapter handling.
 *
 * ModelScope's async image API accepts a `loras` field in two shapes:
 *
 *   single:   "owner/lora-name"
 *   weighted: { "owner/lora-name": 0.6, "owner/other": 0.4 }
 *
 * Clients reach us in far more shapes than that, so everything is funnelled
 * through `normalizeLoras` first:
 *
 * - a bare string, comma-separated list, or `id@0.8` / `id:0.8` weighted form
 * - an array of those strings
 * - an object of id -> weight
 * - a JSON *string* of the object form, which is what a multipart client ends
 *   up sending: dsh-image-gen appends extra body fields with `String(value)`,
 *   so a dictionary arrives as text.
 *
 * Two upstream behaviours are worth remembering (both verified live):
 *
 * 1. A LoRA trained for a different base model is accepted and then SILENTLY
 *    IGNORED — the output is pixel-identical to a run without it. Nothing here
 *    can detect that; the docs on `known-models.ts` and the README warn about it.
 * 2. An unknown adapter id fails the submit with HTTP 500 and a message
 *    containing `模型不存在` / `Model Exception`, not a 404.
 */

import { Errors } from '@z-image/shared'

/** ModelScope rejects anything above this: "too many LoRAs: got 7, maximum allowed is 6". */
export const MAX_LORAS = 6

/** Normalized upstream shape: a single id, or id -> weight. */
export type NormalizedLoras = string | Record<string, number>

interface ParsedEntry {
  id: string
  weight?: number
}

function fail(reason: string): never {
  throw Errors.invalidParams('loras', reason)
}

/**
 * Split `owner/name@0.8` (or `owner/name:0.8`) into id and weight.
 *
 * Only a trailing numeric suffix counts, so an id that legitimately contains
 * an `@` or `:` is left intact.
 */
function parseEntry(token: string): ParsedEntry {
  const text = token.trim()
  if (!text) fail('LoRA ids must not be empty')

  for (const sep of ['@', ':']) {
    const at = text.lastIndexOf(sep)
    if (at <= 0) continue
    const suffix = text.slice(at + 1).trim()
    if (!suffix) continue
    const weight = Number(suffix)
    if (Number.isFinite(weight)) {
      return { id: text.slice(0, at).trim(), weight }
    }
  }

  return { id: text }
}

function assertWeight(id: string, weight: number): number {
  if (!Number.isFinite(weight)) fail(`Weight for "${id}" must be a number`)
  if (weight <= 0 || weight > 1) {
    fail(`Weight for "${id}" must be greater than 0 and at most 1 (got ${weight})`)
  }
  return weight
}

function assertCount(entries: ParsedEntry[]): void {
  if (entries.length > MAX_LORAS) {
    fail(`At most ${MAX_LORAS} LoRAs are supported (got ${entries.length})`)
  }
}

/**
 * Build the upstream value from an ordered list of entries.
 *
 * A single unweighted adapter collapses to the plain string form, which is the
 * shape the upstream documents for the single case. Several adapters always
 * become an object: unweighted lists split the weight evenly, and mixing
 * weighted and unweighted entries is rejected rather than guessed at.
 */
function buildFromEntries(entries: ParsedEntry[]): NormalizedLoras {
  assertCount(entries)
  if (entries.length === 0) fail('At least one LoRA id is required')

  const weighted = entries.filter((e) => e.weight !== undefined)
  if (entries.length === 1) {
    const only = entries[0]
    return only.weight === undefined ? only.id : { [only.id]: assertWeight(only.id, only.weight) }
  }

  if (weighted.length > 0 && weighted.length !== entries.length) {
    fail('Either give every LoRA a weight or give none (weights are then split evenly)')
  }

  const share = 1 / entries.length
  const result: Record<string, number> = {}
  for (const entry of entries) {
    result[entry.id] = assertWeight(entry.id, entry.weight ?? share)
  }
  return result
}

function buildFromList(parts: string[]): NormalizedLoras {
  return buildFromEntries(parts.map(parseEntry))
}

function buildFromObject(raw: Record<string, unknown>): NormalizedLoras {
  const entries: ParsedEntry[] = []
  for (const [key, value] of Object.entries(raw)) {
    const id = key.trim()
    if (!id) fail('LoRA ids must not be empty')
    if (value === null || value === undefined || value === '') {
      // `{ "owner/name": null }` is a common way of saying "just this one".
      entries.push({ id })
      continue
    }
    entries.push({ id, weight: assertWeight(id, Number(value)) })
  }
  return buildFromEntries(entries)
}

/**
 * Normalize any accepted client shape into the upstream `loras` value.
 *
 * Returns `undefined` when nothing was supplied, so callers can simply omit
 * the field from the upstream body.
 */
export function normalizeLoras(raw: unknown): NormalizedLoras | undefined {
  if (raw === undefined || raw === null) return undefined

  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return undefined
    // Multipart clients stringify structured values, so try JSON first.
    if (text.startsWith('{') || text.startsWith('[')) {
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        return fail('`loras` looks like JSON but could not be parsed')
      }
      return normalizeLoras(parsed)
    }
    return buildFromList(
      text
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  }

  if (Array.isArray(raw)) {
    const parts = raw.map((v) => String(v ?? '').trim()).filter(Boolean)
    if (parts.length === 0) return undefined
    return buildFromList(parts)
  }

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>
    if (Object.keys(obj).length === 0) return undefined
    return buildFromObject(obj)
  }

  return fail(`Unsupported \`loras\` value of type ${typeof raw}`)
}

/** A model string split into its upstream id and any LoRA suffix. */
export interface ModelWithLoras {
  base: string
  loras?: NormalizedLoras
}

/**
 * Split a LoRA suffix off a model id: `ms/<base>+<lora>@0.8+<lora2>`.
 *
 * Some clients (and newapi relays that rebuild the body) can only pass a model
 * name, never an extra field, so the suffix form lets them reach LoRAs too.
 * A model string without `+` is returned untouched.
 */
export function splitLoraSuffix(modelParam?: string): ModelWithLoras {
  const model = (modelParam ?? '').trim()
  if (!model.includes('+')) return { base: model }

  const plusAt = model.indexOf('+')
  const base = model.slice(0, plusAt).trim()
  const specs = model
    .slice(plusAt + 1)
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean)

  // `base+` with nothing after it is not a LoRA suffix; keep the id as-is.
  if (!base || specs.length === 0) return { base: model }

  return { base, loras: buildFromList(specs) }
}
