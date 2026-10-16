import type { Config } from './api'
import { EMPTY_FORM, type FormValues } from './form'

/**
 * Share a calculation as a link. The inputs are encoded into the URL's hash,
 * which the browser never sends to the server, so the link carries the data
 * and nothing is stored anywhere.
 */

export interface SharedState {
  form: FormValues
  config: Config
  stressed: boolean
}

const PARAM = 'v'

function encode(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decode(text: string): string {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

/** Build a link to this page that opens with `state` filled in. */
export function buildShareUrl(state: SharedState): string {
  const url = new URL(window.location.href)
  url.hash = `${PARAM}=${encode(JSON.stringify(state))}`
  return url.toString()
}

/**
 * Read a shared state from the current URL, if there is one. Missing fields
 * fall back to the blank form and `defaults`, so an older link still opens.
 */
export function readSharedState(defaults: Config): SharedState | null {
  const value = new URLSearchParams(window.location.hash.slice(1)).get(PARAM)
  if (!value) return null

  try {
    const parsed = JSON.parse(decode(value)) as Partial<SharedState>
    return {
      form: { ...EMPTY_FORM, ...parsed.form },
      config: { ...defaults, ...parsed.config },
      stressed: parsed.stressed === true,
    }
  } catch {
    return null
  }
}

/** Drop the shared state from the address bar once it has been loaded. */
export function clearSharedState() {
  const url = new URL(window.location.href)
  url.hash = ''
  window.history.replaceState(null, '', url.toString())
}
