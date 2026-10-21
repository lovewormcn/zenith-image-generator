import { ApiErrorCode } from '@z-image/shared'
import { describe, expect, it } from 'vitest'
import { MAX_LORAS, normalizeLoras, splitLoraSuffix } from '../lora'

describe('normalizeLoras', () => {
  it('returns undefined when nothing was supplied', () => {
    expect(normalizeLoras(undefined)).toBeUndefined()
    expect(normalizeLoras(null)).toBeUndefined()
    expect(normalizeLoras('')).toBeUndefined()
    expect(normalizeLoras('   ')).toBeUndefined()
    expect(normalizeLoras({})).toBeUndefined()
    expect(normalizeLoras([])).toBeUndefined()
  })

  it('keeps a single unweighted id as the plain string form', () => {
    expect(normalizeLoras('ChaosMY/MYkawaii4MJ')).toBe('ChaosMY/MYkawaii4MJ')
    expect(normalizeLoras(['ChaosMY/MYkawaii4MJ'])).toBe('ChaosMY/MYkawaii4MJ')
    expect(normalizeLoras({ 'ChaosMY/MYkawaii4MJ': null })).toBe('ChaosMY/MYkawaii4MJ')
  })

  it('converts a single weighted id into an object', () => {
    expect(normalizeLoras('ChaosMY/MYkawaii4MJ@0.6')).toEqual({ 'ChaosMY/MYkawaii4MJ': 0.6 })
    expect(normalizeLoras('ChaosMY/MYkawaii4MJ:0.6')).toEqual({ 'ChaosMY/MYkawaii4MJ': 0.6 })
    expect(normalizeLoras({ 'ChaosMY/MYkawaii4MJ': 1 })).toEqual({ 'ChaosMY/MYkawaii4MJ': 1 })
  })

  it('splits weight evenly across an unweighted list', () => {
    expect(normalizeLoras(['owner/a', 'owner/b'])).toEqual({ 'owner/a': 0.5, 'owner/b': 0.5 })
    expect(normalizeLoras('owner/a,owner/b')).toEqual({ 'owner/a': 0.5, 'owner/b': 0.5 })
  })

  it('keeps explicit weights when every entry has one', () => {
    expect(normalizeLoras(['owner/a@0.6', 'owner/b@0.4'])).toEqual({
      'owner/a': 0.6,
      'owner/b': 0.4,
    })
    expect(normalizeLoras({ 'owner/a': 0.6, 'owner/b': 0.4 })).toEqual({
      'owner/a': 0.6,
      'owner/b': 0.4,
    })
  })

  it('rejects mixing weighted and unweighted entries', () => {
    expect(() => normalizeLoras(['owner/a@0.6', 'owner/b'])).toThrowError(
      /every LoRA a weight or give none/
    )
  })

  it('parses the JSON string a multipart client sends', () => {
    // dsh-image-gen stringifies extra body values, so a dictionary arrives as text.
    expect(normalizeLoras('{"owner/a":0.6,"owner/b":0.4}')).toEqual({
      'owner/a': 0.6,
      'owner/b': 0.4,
    })
    expect(normalizeLoras('["owner/a"]')).toBe('owner/a')
  })

  it('rejects malformed JSON rather than guessing', () => {
    expect(() => normalizeLoras('{"owner/a":')).toThrowError(/could not be parsed/)
  })

  it('enforces the upstream maximum of 6 adapters', () => {
    expect(MAX_LORAS).toBe(6)
    const six = Array.from({ length: 6 }, (_, i) => `owner/lora${i}`)
    expect(Object.keys(normalizeLoras(six) as Record<string, number>)).toHaveLength(6)

    const seven = Array.from({ length: 7 }, (_, i) => `owner/lora${i}`)
    expect(() => normalizeLoras(seven)).toThrowError(/At most 6 LoRAs/)
  })

  it('rejects weights outside (0, 1]', () => {
    expect(() => normalizeLoras({ 'owner/a': 0 })).toThrowError(/greater than 0/)
    expect(() => normalizeLoras({ 'owner/a': 1.5 })).toThrowError(/at most 1/)
    expect(() => normalizeLoras({ 'owner/a': 'abc' })).toThrowError(/must be a number/)
  })

  it('raises a 400-shaped error, not a generic failure', () => {
    expect(() => normalizeLoras(42)).toThrowError(
      expect.objectContaining({ code: ApiErrorCode.INVALID_PARAMS })
    )
  })
})

describe('splitLoraSuffix', () => {
  it('leaves a model id without a suffix untouched', () => {
    expect(splitLoraSuffix('ms/Qwen/Qwen-Image-Edit-2511')).toEqual({
      base: 'ms/Qwen/Qwen-Image-Edit-2511',
    })
    expect(splitLoraSuffix(undefined)).toEqual({ base: '' })
  })

  it('splits one adapter off the base model', () => {
    expect(splitLoraSuffix('ms/Qwen/Qwen-Image-Edit-2511+valiantcat/photo@0.8')).toEqual({
      base: 'ms/Qwen/Qwen-Image-Edit-2511',
      loras: { 'valiantcat/photo': 0.8 },
    })
  })

  it('splits several adapters and splits the weight evenly when unweighted', () => {
    expect(splitLoraSuffix('ms/base+owner/a+owner/b')).toEqual({
      base: 'ms/base',
      loras: { 'owner/a': 0.5, 'owner/b': 0.5 },
    })
  })

  it('ignores a dangling separator', () => {
    expect(splitLoraSuffix('ms/base+')).toEqual({ base: 'ms/base+' })
  })

  it('surfaces an unusable suffix instead of silently dropping it', () => {
    expect(() => splitLoraSuffix('ms/base+owner/a@0')).toThrowError(/greater than 0/)
  })
})
