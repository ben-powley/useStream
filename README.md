# @benpowley/useStream

## Prerequisites

- `react >= 18.0.0`
- `react-dom >= 18.0.0`

## Install

- `npm i -S @benpowley/useStream`

## Basic Usage

Import the hook into the file you want to use it.

```typescript
import { useStream } from '@benpowley/usestream'
```

Create the call to the hook, passing in the url to call and the type you would like to be returned as an array.

```typescript
type Todo = {
  userId: number
  id: number
  title: string
  completed: boolean
}

const url = 'https://jsonplaceholder.typicode.com/todos'
const { start } = useStream<Todo>({
  url,
  finished: (data) => {
    // Do things with data
  },
})
```

The hook can either be destructured as shown above, or can be used directly as below.

```typescript
const todoStream = useStream<Todo>({
  url,
  finished: (data) => {
    // Do things with data
  },
})
```

To start the stream, call the `startStream` function on the `UseStreamReturn` type. This is an async function that returns a promise so should be called using `async/await`.

Destructured:

```typescript
start()
```

Single Variable:

```typescript
todoStream.start()
```

## Accesible Properties

```typescript
const { start, cancel, streaming, sizeDownloaded, timeTaken } = useStream<Todo>({ url })
```

- `start - function` - Starts the streaming function
- `cancel - function` - Cancels the streaming function and any web workers
- `streaming - boolean` - Whether the stream is currently streaming.
- `sizeDownloaded - string` - The total amount of data downloaded.
