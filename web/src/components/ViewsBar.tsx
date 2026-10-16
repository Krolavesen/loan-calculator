import { useState } from 'react'
import type { SavedView } from '../lib/views'

interface ViewsBarProps {
  views: SavedView[]
  /** Name of the loaded view, or null for an unsaved draft. */
  current: string | null
  onLoad: (name: string) => void
  onSave: (name: string) => void
  onDelete: (name: string) => void
  onNew: () => void
  /** Copy a link that opens with the current inputs. Resolves false if copying failed. */
  onShare: () => Promise<boolean>
}

/** Load, save and delete named views kept in this browser. */
export function ViewsBar({ views, current, onLoad, onSave, onDelete, onNew, onShare }: ViewsBarProps) {
  const [name, setName] = useState(current ?? '')
  const [shared, setShared] = useState<'copied' | 'failed' | null>(null)
  const [lastCurrent, setLastCurrent] = useState(current)

  // Follow the loaded view's name without clobbering a name being typed.
  if (current !== lastCurrent) {
    setLastCurrent(current)
    setName(current ?? '')
  }

  const trimmed = name.trim()
  const exists = views.some((v) => v.name === trimmed)

  return (
    <form
      className="views"
      onSubmit={(event) => {
        event.preventDefault()
        if (trimmed) onSave(trimmed)
      }}
    >
      <label className="views-field">
        <span className="field-label">Saved views</span>
        <select
          className="views-select"
          value={current ?? ''}
          onChange={(event) => {
            if (event.target.value) onLoad(event.target.value)
          }}
        >
          <option value="">{current ? 'Switch view…' : 'Unsaved draft'}</option>
          {views.map((view) => (
            <option key={view.name} value={view.name}>
              {view.name}
            </option>
          ))}
        </select>
      </label>

      <label className="views-field">
        <span className="field-label">Name</span>
        <input
          className="views-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Osterhaus gate 50/50"
          maxLength={60}
        />
      </label>

      <div className="views-actions">
        <button type="submit" className="button button-primary" disabled={!trimmed}>
          {exists ? 'Update' : 'Save'}
        </button>
        {current ? (
          <button type="button" className="button" onClick={() => onDelete(current)}>
            Delete
          </button>
        ) : null}
        <button type="button" className="button" onClick={onNew}>
          New
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            void onShare().then((ok) => {
              setShared(ok ? 'copied' : 'failed')
              setTimeout(() => setShared(null), 2500)
            })
          }}
        >
          {shared === 'copied' ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="field-hint views-hint" role="status">
        {shared === 'failed'
          ? 'Could not copy. The link is in the address bar instead.'
          : 'Views are kept in this browser only. Copy link shares the inputs, including salaries, with whoever opens it.'}
      </p>
    </form>
  )
}
