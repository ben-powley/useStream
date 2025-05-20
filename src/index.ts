import type { UseStreamProps, UseStreamReturn, WorkerMessage, WorkerError } from './Types' // Import WorkerError
import { bytesToSize } from "./Helpers/FileHelper"
import { useCallback, useMemo, useState } from "react";
import ChunkWorker from './Workers/ChunkWorker?worker&inline'

/**
 * useStream Hook.
 * @param {string} [props.url] Url to fetch.
 * @param {ChunkProcessed} [props.chunkProcessed] Function run each time a chunk is proccessed.
 * @param {UseStreamMode} [props.mode] Mode for the chunk processing (json, csv).
 * @param {function} [props.onError] Callback function for handling errors.
 * @returns {UseStreamReturn}
 */
export const useStream = <T>({ url, chunkProcessed, finished, mode = 'json', onError }: UseStreamProps<T>): UseStreamReturn => {
  const [streaming, setStreaming] = useState(false)
  const [sizeDownloaded, setSizeDownloaded] = useState('')
  const [error, setError] = useState<Error | null>(null); // Added error state

  if (!window.Worker) throw new Error("Browser does not support web workers.")

  let abortController = new AbortController()

  const worker = useMemo(() => new ChunkWorker(), [])

  const start = useCallback(async () => {
    setStreaming(true)
    setSizeDownloaded('')
    setError(null); // Reset error state on new start

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
        {
          // Ensure tempItems is correctly typed for CSV (array of string arrays)
          // The generic T should be string[] for CSV mode.
          const tempCSVItems: string[][] = tempItems as unknown as string[][];
          allData = ''; // Reset allData for each start call
          index = 0; // Reset index for each start call

          worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
            if (event.data) {
              if (event.data.type === 'chunk') {
                try {
                  const parsedRow = event.data.data as string[];
                  allData += parsedRow.join(',') + '\n'; 
                  setSizeDownloaded(bytesToSize(allData.length));
                  tempCSVItems.push(parsedRow);
                  if (chunkProcessed) {
                    (chunkProcessed as (args: { chunkIndex: number; chunk: string[] }) => void)({
                      chunkIndex: index,
                      chunk: parsedRow
                    });
                  }
                  index++;
                } catch (err) {
                  console.error(`Error processing CSV chunk in useStream: ${err}`);
                  const streamError = err instanceof Error ? err : new Error(String(err));
                  setError(streamError);
                  if (onError) onError(streamError);
                  setStreaming(false);
                  // Optionally terminate worker: worker.terminate();
                }
              } else if (event.data.type === 'finished') {
                setStreaming(false);
                (finished as (result: string[][]) => void)(tempCSVItems);
              } else if (event.data.type === 'error') {
                const errorInfo = event.data.data as WorkerError;
                const err = new Error(errorInfo.message);
                err.name = errorInfo.name;
                // err.stack = errorInfo.stack; // Optionally assign stack
                
                setError(err);
                if (onError) onError(err);
                setStreaming(false);
              }
            }
          };
          break;
        }
      case 'json':
        {
          // Ensure tempItems is correctly typed for JSON (array of objects of type T)
          const tempJSONItems: T[] = tempItems as T[];
          allData = ''; // Reset allData for each start call
          index = 0; // Reset index for each start call

          worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
            if (event.data) {
              if (event.data.type === 'chunk') {
                try {
                  allData += event.data.data as string;
                  const item = JSON.parse(event.data.data as string) as T;
                  setSizeDownloaded(bytesToSize(allData.length));
                  tempJSONItems.push(item);
                  if (chunkProcessed) (chunkProcessed as (args: { chunkIndex: number; chunk: T }) => void)({ chunkIndex: index, chunk: item });
                  index++;
                } catch (err) {
                  console.error(`Error processing JSON chunk in useStream: ${err}`);
                  // This catch is for errors during JSON.parse or subsequent processing in useStream itself.
                  const streamError = err instanceof Error ? err : new Error(String(err));
                  setError(streamError);
                  if (onError) onError(streamError);
                  setStreaming(false);
                   // Optionally terminate worker: worker.terminate();
                }
              } else if (event.data.type === 'finished') {
                setStreaming(false);
                (finished as (result: T[]) => void)(tempJSONItems);
              } else if (event.data.type === 'error') {
                const errorInfo = event.data.data as WorkerError;
                const err = new Error(errorInfo.message);
                err.name = errorInfo.name;
                // err.stack = errorInfo.stack; // Optionally assign stack

                setError(err);
                if (onError) onError(err);
                setStreaming(false);
              }
            }
          };
          break;
        }
    }
  }, [url, mode, worker, chunkProcessed, finished, onError]) // Added onError to dependency array

  const cancel = useCallback(async () => {
    setStreaming(false)
    // setError(null); // Optionally reset error on cancel
    abortController.abort()
    // Re-create worker on next start, so terminate it here
    worker.terminate() 
    // abortController = new AbortController(); // This will be handled by useMemo for worker re-creation if needed, or start re-initializes it.
  }, [worker]) // Removed url, mode from cancel dependencies, added worker

  return { start, cancel, streaming, sizeDownloaded, error } // Added error to return object
}
