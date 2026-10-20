/**
 * Helpers for the OpenAI-compatible `POST /v1/images/edits` endpoint.
 *
 * OpenAI's image-edit request is `multipart/form-data` with an `image` file,
 * an optional `mask`, and a `prompt`. We accept that shape plus a couple of
 * permissive fallbacks (JSON body with a base64 string, or a remote URL) so
 * the endpoint is usable from clients that don't speak multipart.
 */

const MAX_INPUT_BYTES = 8 * 1024 * 1024

/** Minimal sniffing: upstream needs a correct MIME type in the data URL. */
export function detectImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 8) {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    if (png.every((b, i) => bytes[i] === b)) return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.slice(0, 4))
    const webp = String.fromCharCode(...bytes.slice(8, 12))
    if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp'
  }
  if (bytes.length >= 6 && String.fromCharCode(...bytes.slice(0, 3)) === 'GIF') {
    return 'image/gif'
  }
  return 'image/png'
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Build a `data:` URL from raw bytes, sniffing the MIME type. */
export function toDataUrl(bytes: Uint8Array): string {
  return `data:${detectImageMime(bytes)};base64,${bytesToBase64(bytes)}`
}

/**
 * Normalize a caller-supplied image string into a `data:` URL.
 *
 * Accepts an existing data URL, a bare base64 payload, or an http(s) URL
 * (which is downloaded here so the upstream never has to reach a third-party
 * host — ModelScope's fetcher commonly gets 403 from them).
 */
export async function normalizeImageInput(
  raw: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const value = raw.trim()
  if (!value) throw new Error('Empty image input')

  if (value.startsWith('data:')) return value

  if (/^https?:\/\//i.test(value)) {
    const res = await fetchImpl(value)
    if (!res.ok) throw new Error(`Failed to download input image: HTTP ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength > MAX_INPUT_BYTES) throw new Error('Input image is too large')
    return toDataUrl(buf)
  }

  // Bare base64 (no prefix) — assume PNG if we can't sniff it.
  return `data:image/png;base64,${value}`
}

/**
 * Read an image out of a multipart form part (or any Blob-like value).
 * Returns a data URL ready to hand to a provider.
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer())
  if (buf.byteLength === 0) throw new Error('Uploaded image is empty')
  if (buf.byteLength > MAX_INPUT_BYTES) {
    throw new Error(`Uploaded image exceeds ${MAX_INPUT_BYTES} bytes`)
  }
  return toDataUrl(buf)
}
