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
  error: Error | null; // Added error state
}

/**
 * Props type for the useStream hook.
 */
type UseStreamProps<T> = {
  url: string
  mode?: UseStreamMode
  chunkProcessed?: ({ chunkIndex, chunk }: ChunkProcessed<T>) => void,
  finished: (data: T[]) => void
  onError?: (error: Error) => void; // Added onError callback
}

// Define a serializable error structure for worker messages
type WorkerError = {
  name: string;
  message: string;
  stack?: string;
}

type WorkerMessage = {
  type: 'chunk' | 'finished' | 'error', // Added 'error' type
  data: any // Changed from string to any to accommodate string[], string, null, or WorkerError
  // For 'error' type, data will be WorkerError
}

export type { UseStreamReturn, UseStreamProps, ChunkProcessed, UseStreamMode, WorkerMessage, WorkerError }
