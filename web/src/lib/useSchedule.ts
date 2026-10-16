import { useEffect, useRef, useState } from 'react'
import { fetchSchedule, type Config, type LoanInput, type Schedule } from './api'

/** How long to wait after the last edit before calling the API, in ms. */
const DEBOUNCE_MS = 200

interface ScheduleState {
  /** The last schedule the API returned, kept while a new one is in flight. */
  schedule: Schedule | null
  error: string | null
  pending: boolean
}

/**
 * Project `input` through the Python API, debouncing edits and cancelling any
 * request that a newer edit has superseded.
 */
export function useSchedule(input: LoanInput, config: Config): ScheduleState {
  const [state, setState] = useState<ScheduleState>({
    schedule: null,
    error: null,
    pending: true,
  })

  // Read inside the effect without making the effect depend on the state.
  const latest = useRef(state)
  latest.current = state

  // The effect depends on the values, not on the object identities.
  const key = JSON.stringify({ input, config })

  useEffect(() => {
    const controller = new AbortController()
    setState((prev) => ({ ...prev, pending: true }))

    // Don't make the very first paint wait out the debounce.
    const delay = latest.current.schedule === null ? 0 : DEBOUNCE_MS
    const timer = setTimeout(() => {
      fetchSchedule(input, config, controller.signal)
        .then((schedule) => setState({ schedule, error: null, pending: false }))
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setState((prev) => ({
            schedule: prev.schedule,
            error: error instanceof Error ? error.message : 'Could not reach the API',
            pending: false,
          }))
        })
    }, delay)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // `key` captures every value the request depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}
