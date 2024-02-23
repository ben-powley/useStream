/// <reference lib="webworker" />

declare const self: DedicatedWorkerGlobalScope

import { WorkerMessage } from "Types";
import { CSVDecoderClass, JSONDecoderClass } from "../Helpers/FileHelper";

self.onmessage = async (e: MessageEvent<{ body: ReadableStream<string>, mode: 'json' | 'csv' }>) => {
  if (e.data) {
    if (e.data.mode === 'json') {
      let allData = ""
      const JSONDecoder = new TransformStream(new JSONDecoderClass())
      const { body } = e.data
      const text = body.pipeThrough(JSONDecoder)

      await text.pipeTo(new WritableStream({
        write(data) {
          allData += data

          const chunkMessage: WorkerMessage = {
            type: 'chunk',
            data: data.slice(0, -1)
          }

          self.postMessage(chunkMessage)
        }
      }))

      const completeMessage: WorkerMessage = {
        type: 'finished',
        data: allData
      }

      self.postMessage(completeMessage)
    } else if (e.data.mode === 'csv') {
      const CSVDecoder = new TransformStream(new CSVDecoderClass())
      const { body } = e.data
      const text = body.pipeThrough(CSVDecoder)

      await text.pipeTo(new WritableStream({
        write(data) {
          self.postMessage(data)
        }
      }))
    }
  }
}

self.onerror = (e) => {
  console.error(e)
}
