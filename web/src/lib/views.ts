import type { Config } from './api'
import type { FormValues } from './form'

/**
 * Named views, and the draft you were last working on, kept in this
 * browser's localStorage. Nothing leaves the device, and every read and
 * write is guarded because storage can be blocked or full.
 */

export interface SavedView {
  name: string
  savedAt: string
  form: FormValues
  config: Config
  stressed: boolean
}

export interface Draft {
  form: FormValues
  config: Config
  stressed: boolean
  /** The saved view this draft was loaded from, if any. */
  viewName: string | null
}

const VIEWS_KEY = 'loan-calculator.views'
const DRAFT_KEY = 'loan-calculator.draft'

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function loadViews(): SavedView[] {
  const views = read<SavedView[]>(VIEWS_KEY)
  return Array.isArray(views) ? views : []
}

/** Save a view under its name, replacing any view with the same name. */
export function saveView(view: SavedView): SavedView[] {
  const views = [...loadViews().filter((v) => v.name !== view.name), view].sort((a, b) =>
    a.name.localeCompare(b.name, 'nb'),
  )
  write(VIEWS_KEY, views)
  return views
}

export function deleteView(name: string): SavedView[] {
  const views = loadViews().filter((v) => v.name !== name)
  write(VIEWS_KEY, views)
  return views
}

export const loadDraft = () => read<Draft>(DRAFT_KEY)

export const saveDraft = (draft: Draft) => write(DRAFT_KEY, draft)
