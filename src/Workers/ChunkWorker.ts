/// <reference lib="webworker" />

declare const self: DedicatedWorkerGlobalScope

import { WorkerMessage, WorkerError } from "Types"; // Import WorkerError
import { CSVDecoderClass, JSONDecoderClass } from "../Helpers/FileHelper";

// Helper function to post error messages
function postWorkerError(error: any) {
  let errorData: WorkerError;
  if (error instanceof Error) {
    errorData = { name: error.name, message: error.message, stack: error.stack };
  } else if (typeof error === 'string') {
    errorData = { name: 'Error', message: error };
  } else {
    errorData = { name: 'Error', message: 'An unknown error occurred in the worker.' };
  }
  
  const errorMessage: WorkerMessage = {
    type: 'error',
    data: errorData
  };
  self.postMessage(errorMessage);
}

self.onmessage = async (e: MessageEvent<{ body: ReadableStream<string>, mode: 'json' | 'csv' }>) => {
  if (e.data) {
    try { // Wrap the entire processing logic
      if (e.data.mode === 'json') {
        let allData = ""
        const JSONDecoder = new TransformStream(new JSONDecoderClass())
        const { body } = e.data
        const text = body.pipeThrough(JSONDecoder)

        await text.pipeTo(new WritableStream({
          write(data) {
            try {
              allData += data
              // Assuming JSON.parse happens in useStream, if it happened here, it would be wrapped.
              // The main error source here is if JSONDecoderClass itself throws via the stream.
              const item = JSON.parse(data.slice(0,-1)); // Simulate potential error source if parsing occurred here. For now, keep as is.

              const chunkMessage: WorkerMessage = {
                type: 'chunk',
                data: data.slice(0, -1) 
              }
              self.postMessage(chunkMessage)
            } catch (err) {
              postWorkerError(err);
              // Optionally, re-throw or abort the stream if possible/needed
              // For now, posting error is the main goal. The stream might continue or halt depending on TransformStream behavior.
            }
          }
        })).catch(postWorkerError); // Catch errors from the pipeTo operation itself

        const completeMessage: WorkerMessage = {
          type: 'finished',
          data: allData
        }
        self.postMessage(completeMessage)

      } else if (e.data.mode === 'csv') {
        const CSVDecoder = new TransformStream(new CSVDecoderClass())
        const { body } = e.data
        const text = body.pipeThrough(CSVDecoder)
        let processedBytes = 0;

        await text.pipeTo(new WritableStream<string[]>({
          write(parsedRow: string[]) {
            try {
              processedBytes += parsedRow.join(',').length + 1; 
              const chunkMessage: WorkerMessage = {
                type: 'chunk',
                data: parsedRow
              }
              self.postMessage(chunkMessage)
            } catch (err) {
              postWorkerError(err);
            }
          }
        })).catch(postWorkerError); // Catch errors from the pipeTo operation itself

        const completeMessage: WorkerMessage = {
          type: 'finished',
          data: null
        }
        self.postMessage(completeMessage)
      }
    } catch (err) { // Catch errors from initial setup before pipeTo
      postWorkerError(err);
    }
  }
}

self.onerror = (event: ErrorEvent | string) => { // Updated to handle string for manual calls too
  if (event instanceof ErrorEvent) {
    postWorkerError(event.error || new Error(event.message || 'Unhandled worker error'));
  } else {
    postWorkerError(new Error(String(event || 'Unhandled worker error')));
  }
  // Default behavior is to rethrow the error, which will terminate the worker.
  // Depending on the desired behavior, you might prevent default or explicitly terminate.
  return false; // Prevent default handling (which might be to rethrow)
}
