import { useStream } from '../index'
import { useState } from 'react'
import type { Todo} from './Types'

const App = () => {
  const [s1Data, setS1Data] = useState<Todo[]>([])

  const url1 = 'https://jsonplaceholder.typicode.com/todos'
  const stream1 = useStream<Todo>({
    url: url1,
    finished: (data) => {
      setS1Data(data)
    },
  })

  const runStream1 = async () => {
    try {
      stream1.start()
    } catch (exception) {
      console.error('s1Error', exception)
    }
  }

  const cancelStream1 = async () => {
    await stream2.cancel()
  }

  return (
    <div>
      <div>
        <div>Url: {url1}</div>
        <div>Expected Length: 200</div>
        <div>Actual Length: {s1Data.length}</div>
        <div>Downloaded: {stream1.sizeDownloaded}</div>
        <div>Stream 1 Loading: {stream1.streaming ? 'true' : 'false'}</div>

        <button onClick={() => runStream1()}>Run Stream 1</button>
        {stream1.streaming && <button onClick={() => cancelStream1()}>Cancel Stream 1</button>}

        <div style={{ maxHeight: '200px', overflowY: 'scroll', backgroundColor: '#ccc', padding: '1rem' }}>
          {s1Data.map((item) => (
            <div key={`TODO_${item.id}`} style={{ display: 'flex', columnGap: '1rem' }}>
              <div>{item.id}</div>
              <div>{item.title}</div>
              <div>{item.completed ? 'yes' : 'no'}</div>
              <div>{item.userId}</div>
            </div>
          ))}
        </div>
      </div>

      <hr />

      <button
        onClick={() => {
          runStream1()
        }}>
        Run All Streams
      </button>
    </div>
  )
}

export default App
