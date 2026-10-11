import { useCallback, useEffect, useRef, useState } from 'react'
import { audioMimeFor, type AudioPayload } from '@shared/domain/auditorium'
import type { SectionId } from '@shared/domain/navigation'
import { createConsultGraph, type ConsultGraph, type Tools } from '@shared/consult/audio'
import { surveyPeaks } from './survey'

export interface LoadedSource {
  path: string
  name: string
  extension: string
  size: number
  modifiedAt: number
  /**
   * The department that opened it, which the transport bar names and leads
   * back to: AUDITORIUM for a file admitted there or played from the
   * ARCHIVE, CONSULTATION for a shared track heard with someone's feedback.
   */
  home: SectionId
  /** What the opener knows it by, so it can tell it is still the one loaded. Null from a path. */
  key: string | null
  /** Whether `path` is a file on this machine, which the popout and Reveal can open. */
  local: boolean
}

/** How `openFrom` files what it opens. */
export interface OpenOptions {
  home: SectionId
  key: string
}

/** Someone's tools on the track: a producer's feedback, heard. */
export interface InsertSpec {
  /** What the opener knows them by (a piece of feedback's id), to tell later whose are on. */
  key: string
  /** Whose they are, for the transport bar: `Nasko`. */
  label: string
  tools: Tools
}

export interface InsertState {
  key: string
  label: string
  /** Heard as it is for now, the tools kept: the A/B. */
  bypassed: boolean
}

/** A Windows path (`C:\…`, `\\server\…`), as against a name in the bucket. */
const isLocalPath = (path: string): boolean => /^(?:[a-zA-Z]:[\\/]|\\\\)/.test(path)

export interface AudioEngine {
  /** Attach to the page's single `<audio>` element. */
  elementRef: React.RefObject<HTMLAudioElement | null>
  /** Live analyser, or null until the graph is built on first play. */
  analyserRef: React.RefObject<AnalyserNode | null>
  source: LoadedSource | null
  /**
   * The file's envelope, or null until it has been surveyed.
   *
   * A ref rather than state: it is read by the render loop sixty times a
   * second and changes twice per file, so putting it in state would be a
   * dependency on something that never moves.
   */
  peaksRef: React.RefObject<Float32Array | null>
  loading: boolean
  /** Decoding and surveying, which happens after the file is readable. */
  surveying: boolean
  error: string | null
  playing: boolean
  /** Seconds. `duration` is NaN until the file's metadata is decoded. */
  position: number
  duration: number
  volume: number
  /** Someone's tools the track is heard through, or null for the track as it is. */
  insert: InsertState | null
  open: (path: string) => Promise<void>
  /**
   * Opens audio read some way other than from a path here: CONSULTATION's
   * shared tracks, which may only be in the bucket. Resolves once the
   * element has it, without waiting for the survey; rejects with the
   * refusal, for the caller to report, rather than setting `error`.
   */
  openFrom: (read: () => Promise<AudioPayload>, options: OpenOptions) => Promise<void>
  /**
   * Puts someone's tools on the track, or takes them off. Opening another
   * file takes them off, so nothing else is ever heard through them.
   */
  setInsert: (spec: InsertSpec | null) => void
  /** Hears the track as it is, or through the tools again. */
  setBypass: (on: boolean) => void
  toggle: () => void
  seek: (seconds: number) => void
  setVolume: (value: number) => void
  clearError: () => void
}

/**
 * The listening room's transport and analysis graph.
 *
 * The file is read whole over IPC and handed to the element as a blob URL
 * rather than a `file://` path. That is not incidental: the renderer is served
 * from a dev server in development and from `file:` in a build, so a path would
 * need different handling in each, and a blob seeks natively and feeds Web
 * Audio without either. See the `auditorium:read` channel for the other half.
 *
 * The graph is built on first play, not on load. Chromium will not start an
 * `AudioContext` before a gesture, and a context created at load time arrives
 * suspended and silently stays that way — which presents as a file that plays
 * with a completely flat visualiser.
 */
export function useAudioEngine(): AudioEngine {
  const elementRef = useRef<HTMLAudioElement | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  /**
   * The element's source node.
   *
   * Created exactly once. `createMediaElementSource` throws if it is called
   * twice for one element, and the node survives a change of `src`, so this is
   * built with the graph and never rebuilt when a new file is opened.
   */
  const nodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const peaksRef = useRef<Float32Array | null>(null)
  /** Guards against a slow survey landing after a newer file was admitted. */
  const admissionRef = useRef(0)
  /** What is loaded, readable from a subscription without a stale closure. */
  const currentPathRef = useRef<string | null>(null)
  /**
   * The tools someone's feedback is heard through, between the source and
   * the analyser while they are on. Built on first use and kept, as the
   * source node is; only what is routed through it changes.
   */
  const insertRef = useRef<ConsultGraph | null>(null)
  /** Stops the insert following the element's playhead. */
  const followingRef = useRef<(() => void) | null>(null)

  const [source, setSource] = useState<LoadedSource | null>(null)
  const [insert, setInsertState] = useState<InsertState | null>(null)
  const [loading, setLoading] = useState(false)
  const [surveying, setSurveying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(Number.NaN)
  const [volume, setVolumeState] = useState(0.8)

  /**
   * Builds the analysis graph, once.
   *
   * Called when a file is admitted rather than on first play, because the
   * overview needs this context to decode with — and a context created before
   * a gesture is merely *suspended*, not refused. What must not be forgotten is
   * the `resume()` in `toggle`: a suspended context plays nothing and reports
   * nothing, which presents as a file that runs with a completely flat render.
   */
  const buildGraph = useCallback((): AudioContext | null => {
    const element = elementRef.current
    if (!element) return null
    if (contextRef.current) return contextRef.current

    const context = new AudioContext()
    const analyser = context.createAnalyser()
    // 4096 gives 2048 bins. The spectrogram wants the frequency resolution —
    // at 2048 the low octaves collapse into two or three rows and a bass line
    // becomes one indistinct band — and the extra window costs nothing at this
    // rate. Smoothing is left low so a column of the spectrogram is a moment
    // rather than an average of the last several.
    analyser.fftSize = 4096
    analyser.smoothingTimeConstant = 0.62

    const node = context.createMediaElementSource(element)
    node.connect(analyser)
    // The analyser is in the path rather than on a tap, so what is drawn is
    // exactly what is heard — including the element's own volume.
    analyser.connect(context.destination)

    contextRef.current = context
    analyserRef.current = analyser
    nodeRef.current = node
    return context
  }, [])

  /** The source straight into the analyser, or through `graph` on the way. */
  const route = useCallback((graph: ConsultGraph | null): void => {
    const node = nodeRef.current
    const analyser = analyserRef.current
    if (!node || !analyser) return
    node.disconnect()
    if (graph) {
      node.connect(graph.input)
      graph.output.connect(analyser)
    } else {
      insertRef.current?.output.disconnect()
      node.connect(analyser)
    }
  }, [])

  /*
   * Someone's tools on the track, for CONSULTATION's A/B.
   *
   * The same graph the website's page plays a producer's tools through
   * (`src/shared/consult/audio`), so what is heard here is what they heard.
   * It sits between the source and the analyser, so the visualiser shows
   * the track as it is heard, tools and all; with nothing on, the source
   * goes straight to the analyser as it always has.
   */
  const setInsert = useCallback(
    (spec: InsertSpec | null): void => {
      const graph = insertRef.current
      if (!spec) {
        if (graph) {
          route(null)
          graph.set(null)
          graph.bypass(false)
          followingRef.current?.()
          followingRef.current = null
        }
        setInsertState(null)
        return
      }

      const context = buildGraph()
      const element = elementRef.current
      if (!context || !element) return
      const tools = graph ?? createConsultGraph(context)
      insertRef.current = tools
      tools.set(spec.tools)
      tools.bypass(false)
      followingRef.current ??= tools.follow(element)
      route(tools)
      setInsertState({ key: spec.key, label: spec.label, bypassed: false })
    },
    [buildGraph, route]
  )

  const setBypass = useCallback((on: boolean): void => {
    const graph = insertRef.current
    if (!graph) return
    graph.bypass(on)
    setInsertState((current) => (current ? { ...current, bypassed: on } : current))
  }, [])

  /**
   * Puts a file on the element. Resolves with what was read, or null when
   * it failed and `report` put the reason in `error`; rejects with it
   * otherwise.
   */
  const load = useCallback(
    async (
      read: () => Promise<AudioPayload>,
      filed: Pick<LoadedSource, 'home' | 'key'>,
      report: boolean
    ): Promise<{ payload: AudioPayload; admission: number } | null> => {
      const admission = admissionRef.current + 1
      admissionRef.current = admission

      setLoading(true)
      setError(null)
      peaksRef.current = null

      let payload: AudioPayload

      try {
        payload = await read()

        // Another file never inherits someone's tools.
        setInsert(null)

        // Revoked before the new one is assigned: a session spent auditioning
        // a folder of masters would otherwise hold every one of them in memory.
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)

        // The media type is required, not cosmetic — see `AUDIO_MIME`.
        const url = URL.createObjectURL(
          new Blob([payload.bytes], { type: audioMimeFor(payload.extension) })
        )
        objectUrlRef.current = url

        const element = elementRef.current
        if (element) {
          element.src = url
          element.load()
        }

        const local = isLocalPath(payload.path)
        setSource({
          path: payload.path,
          name: payload.name,
          extension: payload.extension,
          size: payload.size,
          modifiedAt: payload.modifiedAt,
          ...filed,
          local
        })
        setPosition(0)
        setDuration(Number.NaN)
        currentPathRef.current = payload.path

        // Every window follows the room. The announcement echoes back to this
        // one too, and is ignored here because the path already matches. Only
        // a file here: the popout reads by path, and a track that is only in
        // the bucket has none.
        if (local) {
          void window.candy.auditorium.announce(payload.path).catch(() => {
            // A window that did not hear is a window showing an older file, not
            // a broken one; nothing here should fail on it.
          })
        }
      } catch (cause) {
        setLoading(false)
        if (!report) throw cause
        setError(cause instanceof Error ? cause.message : String(cause))
        return null
      }

      setLoading(false)
      return { payload, admission }
    },
    [setInsert]
  )

  /*
   * Survey the file for the overview.
   *
   * Second, and separately, because the transport must not wait on it: the
   * operator can start playing the moment the element has its source, while
   * the overview arrives when it arrives. A failure here is not reported as an
   * error either — the two live renders are unaffected, and a decode that
   * fails on an exotic container should cost the WAVEFORM preset, not the room.
   */
  const survey = useCallback(
    async (payload: AudioPayload, admission: number): Promise<void> => {
      setSurveying(true)
      try {
        const context = buildGraph()
        if (!context) return

        // A copy, because `decodeAudioData` detaches the buffer it is given —
        // and this one is also the blob the element is playing from.
        const copy = payload.bytes.slice().buffer as ArrayBuffer
        const decoded = await context.decodeAudioData(copy)

        // A slower survey of an earlier file must not overwrite a newer one.
        if (admissionRef.current !== admission) return

        peaksRef.current = surveyPeaks(decoded)
        // The decoded buffer is deliberately not retained: an hour of stereo at
        // 48k is over a gigabyte of float, and everything the overview needs is
        // now a few hundred kilobytes of envelope.
      } catch {
        if (admissionRef.current === admission) peaksRef.current = null
      } finally {
        if (admissionRef.current === admission) setSurveying(false)
      }
    },
    [buildGraph]
  )

  const open = useCallback(
    async (path: string): Promise<void> => {
      const loaded = await load(
        () => window.candy.auditorium.read(path),
        { home: 'auditorium', key: null },
        true
      )
      if (loaded) await survey(loaded.payload, loaded.admission)
    },
    [load, survey]
  )

  const openFrom = useCallback(
    async (read: () => Promise<AudioPayload>, options: OpenOptions): Promise<void> => {
      const loaded = await load(read, options, false)
      if (loaded) void survey(loaded.payload, loaded.admission)
    },
    [load, survey]
  )

  const toggle = useCallback((): void => {
    const element = elementRef.current
    if (!element || !element.src) return

    // Built at admission; this is the safety net for a file that somehow
    // reached the element without one.
    buildGraph()
    // A context created before a gesture arrives suspended, and one can be
    // suspended again between sessions, so it is resumed on every start rather
    // than only on the first.
    void contextRef.current?.resume()

    if (element.paused) {
      void element.play().catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    } else {
      element.pause()
    }
  }, [buildGraph])

  const seek = useCallback((seconds: number): void => {
    const element = elementRef.current
    if (!element || !Number.isFinite(element.duration)) return
    element.currentTime = Math.min(Math.max(seconds, 0), element.duration)
    setPosition(element.currentTime)
  }, [])

  const setVolume = useCallback((value: number): void => {
    setVolumeState(value)
    if (elementRef.current) elementRef.current.volume = value
  }, [])

  // Element events drive React state; the visualiser reads the analyser
  // directly and never comes through here, so this runs at the rate the
  // element reports rather than at frame rate.
  useEffect(() => {
    const element = elementRef.current
    if (!element) return

    element.volume = volume

    const onTime = (): void => setPosition(element.currentTime)
    const onMeta = (): void => setDuration(element.duration)
    const onPlay = (): void => setPlaying(true)
    const onPause = (): void => setPlaying(false)
    const onEnded = (): void => setPlaying(false)
    /*
     * Reports which failure it was, rather than one message for all four.
     *
     * `MediaError.code` is the only thing the element tells us, and the
     * difference matters: an unsupported source is a codec this build of
     * Chromium does not carry, while a decode error is a file that is damaged.
     * A single "could not be decoded" for both sent a perfectly good MP3 to be
     * investigated as corrupt when the real fault was the blob's media type.
     */
    const onError = (): void => {
      const code = element.error?.code
      if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        setError('That format is not one this build can play.')
      } else if (code === MediaError.MEDIA_ERR_DECODE) {
        setError('That file is damaged, or encoded in a way that could not be read.')
      } else {
        setError('That file could not be opened.')
      }
    }

    element.addEventListener('timeupdate', onTime)
    element.addEventListener('loadedmetadata', onMeta)
    element.addEventListener('durationchange', onMeta)
    element.addEventListener('play', onPlay)
    element.addEventListener('pause', onPause)
    element.addEventListener('ended', onEnded)
    element.addEventListener('error', onError)

    return () => {
      element.removeEventListener('timeupdate', onTime)
      element.removeEventListener('loadedmetadata', onMeta)
      element.removeEventListener('durationchange', onMeta)
      element.removeEventListener('play', onPlay)
      element.removeEventListener('pause', onPause)
      element.removeEventListener('ended', onEnded)
      element.removeEventListener('error', onError)
    }
    // `volume` is deliberately not a dependency: it is applied here on mount and
    // written straight to the element by `setVolume` thereafter. Listing it
    // would tear down and rebind seven listeners on every drag of the fader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /*
   * Follows the room.
   *
   * The console page and the detached player are separate renderers with
   * separate audio graphs, and this is the one thing they agree on: which file
   * is open. Each window loads it independently rather than sharing a stream,
   * so the transports stay independent — which is the point of a popout that
   * can be scrubbed without disturbing the console.
   */
  useEffect(() => {
    return window.candy.auditorium.onFile(({ path }) => {
      if (!path || path === currentPathRef.current) return
      void open(path)
    })
  }, [open])

  // Teardown. The context is closed rather than left suspended, because leaving
  // the department should not keep an audio device open.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
      currentPathRef.current = null
      peaksRef.current = null
      followingRef.current?.()
      followingRef.current = null
      insertRef.current?.dispose()
      insertRef.current = null
      void contextRef.current?.close()
      contextRef.current = null
      analyserRef.current = null
      nodeRef.current = null
    }
  }, [])

  return {
    elementRef,
    analyserRef,
    peaksRef,
    source,
    loading,
    surveying,
    error,
    playing,
    position,
    duration,
    volume,
    insert,
    open,
    openFrom,
    setInsert,
    setBypass,
    toggle,
    seek,
    setVolume,
    clearError: useCallback(() => setError(null), [])
  }
}
