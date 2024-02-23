import type { UseStreamProps, UseStreamReturn, WorkerMessage } from './Types'
import { bytesToSize } from "./Helpers/FileHelper"
import { useCallback, useMemo, useState } from "react";
import ChunkWorker from './Workers/ChunkWorker?worker&inline'

/**
 * useStream Hook.
 * @param {string} [props.url] Url to fetch.
 * @param {ChunkProcessed} [props.chunkProcessed] Function run each time a chunk is proccessed.
 * @param {UseStreamMode} [props.mode] Mode for the chunk processing (json, csv).
 * @returns {UseStreamReturn}
 */
export const useStream = <T>({ url, chunkProcessed, finished, mode = 'json', }: UseStreamProps<T>): UseStreamReturn => {
  const [streaming, setStreaming] = useState(false)
  const [sizeDownloaded, setSizeDownloaded] = useState('')
  if (!window.Worker) throw new Error("Browser does not support web workers.")

  let abortController = new AbortController()

  const worker = useMemo(() => new ChunkWorker(), [])

  const start = useCallback(async () => {
    setStreaming(true)
    setSizeDownloaded('')

    const signal = abortController.signal
    const response = await fetch(url, { method: 'GET', signal })

    if (!response.ok) throw new Error(`Could not perform request. Status code: ${response.status} - ${response.statusText}`)
    if (!response.body) throw new Error(`Response body is undefined`)

    const body = response.body
    const stream = body.pipeThrough(new TextDecoderStream())

    if (!stream) throw new Error("Stream is undefined")

    let allData = ''
    let index = 0
    const tempItems: T[] = []

    worker.postMessage({ body: stream, mode: mode }, [stream])

    switch (mode) {
      case 'csv':
        // TODO
        break

      case 'json':
        {
          worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
            if (event.data) {
              if (event.data.type === 'chunk') {
                try {
                  allData += event.data.data

                  const item = JSON.parse(event.data.data) as T

                  setSizeDownloaded(bytesToSize(allData.length))

                  tempItems.push(item)

                  if (chunkProcessed) chunkProcessed({ chunkIndex: index, chunk: item })

                  index++
                } catch (exception) {
                  return Promise.reject(`There was an error processing the chunk - ${exception}`)
                }
              } else if (event.data.type === 'finished') {
                setStreaming(false)
                finished(tempItems)
              }
            }
          }
        }
    }
  }, [url, mode])

  const cancel = useCallback(async () => {
    setStreaming(false)

    abortController.abort()
    worker.terminate()
    abortController = new AbortController()
  }, [url, mode])

  return { start, cancel, streaming, sizeDownloaded }
}
