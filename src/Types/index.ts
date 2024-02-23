/**
 * Mode type for the mode parameter of UseStreamProps.
 */
type UseStreamMode = 'json' | 'csv'

/**
 * Function that is ran after every chunk has been processed. 
 */
type ChunkProcessed<T> = {
  chunkIndex: number
  chunk: T
}

/**
 * Props type for the useStream hook.
 */
type UseStreamProps<T> = {
  url: string
  mode?: UseStreamMode
  chunkProcessed?: ({ chunkIndex, chunk }: ChunkProcessed<T>) => void,
  finished: (data: T[]) => void
}

/**
 * Return type for the useStream hook.
 */
type UseStreamReturn = {
  start: () => void
  cancel: () => Promise<void>
  streaming: boolean
  sizeDownloaded: string
}

type WorkerMessage = {
  type: 'chunk' | 'finished',
  data: string
}

export type { UseStreamReturn, UseStreamProps, ChunkProcessed, UseStreamMode, WorkerMessage }
