import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStream } from './index'; // Adjust path as necessary
import type { UseStreamProps, WorkerMessage, WorkerError } from './Types';

// Mock the worker
// We need to be able to control messages sent by the worker
let mockWorkerOnmessage: ((event: MessageEvent<WorkerMessage>) => void) | null = null;
const mockPostMessage = vi.fn();
const mockTerminate = vi.fn();

vi.mock('./Workers/ChunkWorker?worker&inline', () => {
  // This is a simplified constructor mock.
  // If the actual worker constructor does more, this might need adjustment.
  const MockWorker = vi.fn().mockImplementation(() => ({
    postMessage: mockPostMessage,
    terminate: mockTerminate,
    set onmessage(handler: (event: MessageEvent<WorkerMessage>) => void) {
      mockWorkerOnmessage = handler;
    },
    get onmessage() {
      return mockWorkerOnmessage;
    }
  }));
  return { default: MockWorker };
});


// Mock fetch
global.fetch = vi.fn();

const createMockReadableStream = (chunks: string[]) => {
  let chunkIndex = 0;
  return new ReadableStream({
    pull(controller) {
      if (chunkIndex < chunks.length) {
        controller.enqueue(new TextEncoder().encode(chunks[chunkIndex]));
        chunkIndex++;
      } else {
        controller.close();
      }
    }
  });
};

describe('useStream Hook - CSV Functionality', () => {
  const mockUrl = 'test.csv';

  beforeEach(() => {
    vi.clearAllMocks(); // Clear mocks before each test
    mockWorkerOnmessage = null; // Reset onmessage handler
    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      body: createMockReadableStream([]), // Default empty stream
      status: 200,
      statusText: 'OK'
    });
  });

  const defaultProps: UseStreamProps<string[]> = {
    url: mockUrl,
    mode: 'csv',
    finished: vi.fn(),
    chunkProcessed: vi.fn(),
    onError: vi.fn(),
  };

  it('should initialize with correct default states', () => {
    const { result } = renderHook(() => useStream(defaultProps));
    expect(result.current.streaming).toBe(false);
    expect(result.current.sizeDownloaded).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('should start streaming and process CSV chunks', async () => {
    const { result } = renderHook(() => useStream(defaultProps));

    await act(async () => {
      result.current.start();
    });
    
    // Wait for fetch to be called and worker to be posted a message
    await vi.waitFor(() => expect(mockPostMessage).toHaveBeenCalledTimes(1));
    expect(result.current.streaming).toBe(true);

    // Simulate worker sending a CSV chunk
    const csvRow1 = ['r1c1', 'r1c2'];
    act(() => {
      if (mockWorkerOnmessage) {
        mockWorkerOnmessage({ data: { type: 'chunk', data: csvRow1 } } as MessageEvent<WorkerMessage>);
      }
    });
    expect(defaultProps.chunkProcessed).toHaveBeenCalledWith({ chunkIndex: 0, chunk: csvRow1 });
    // sizeDownloaded is based on joined string length + newline
    expect(result.current.sizeDownloaded).toBe(bytesToSize((csvRow1.join(',') + '\n').length));


    // Simulate worker sending another CSV chunk
    const csvRow2 = ['r2c1', 'r2c2 with comma,'];
     act(() => {
      if (mockWorkerOnmessage) {
        mockWorkerOnmessage({ data: { type: 'chunk', data: csvRow2 } } as MessageEvent<WorkerMessage>);
      }
    });
    expect(defaultProps.chunkProcessed).toHaveBeenCalledWith({ chunkIndex: 1, chunk: csvRow2 });
    
    // Simulate finished message
    act(() => {
      if (mockWorkerOnmessage) {
        mockWorkerOnmessage({ data: { type: 'finished', data: null } } as MessageEvent<WorkerMessage>);
      }
    });
    expect(result.current.streaming).toBe(false);
    expect(defaultProps.finished).toHaveBeenCalledWith([csvRow1, csvRow2]);
  });

  it('should handle empty CSV stream', async () => {
     const { result } = renderHook(() => useStream(defaultProps));

    await act(async () => {
      result.current.start();
    });
    await vi.waitFor(() => expect(mockPostMessage).toHaveBeenCalledTimes(1));
    
    act(() => {
      if (mockWorkerOnmessage) {
        mockWorkerOnmessage({ data: { type: 'finished', data: null } } as MessageEvent<WorkerMessage>);
      }
    });

    expect(result.current.streaming).toBe(false);
    expect(defaultProps.finished).toHaveBeenCalledWith([]);
    expect(defaultProps.chunkProcessed).not.toHaveBeenCalled();
  });

  it('should update streaming state correctly on start and finish', async () => {
    const { result } = renderHook(() => useStream(defaultProps));
    expect(result.current.streaming).toBe(false);
    await act(async () => {
      result.current.start();
    });
    await vi.waitFor(() => expect(mockPostMessage).toHaveBeenCalledTimes(1));
    expect(result.current.streaming).toBe(true);
    act(() => {
       if (mockWorkerOnmessage) {
        mockWorkerOnmessage({ data: { type: 'finished', data: null } } as MessageEvent<WorkerMessage>);
      }
    });
    expect(result.current.streaming).toBe(false);
  });
  
  it('should handle error message from worker', async () => {
    const { result } = renderHook(() => useStream(defaultProps));
    await act(async () => {
      result.current.start();
    });
    await vi.waitFor(() => expect(mockPostMessage).toHaveBeenCalledTimes(1));

    const errorInfo: WorkerError = { name: 'WorkerError', message: 'CSV processing failed in worker' };
    act(() => {
      if (mockWorkerOnmessage) {
        mockWorkerOnmessage({ data: { type: 'error', data: errorInfo } } as MessageEvent<WorkerMessage>);
      }
    });

    expect(result.current.streaming).toBe(false);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe('CSV processing failed in worker');
    expect(result.current.error?.name).toBe('WorkerError');
    expect(defaultProps.onError).toHaveBeenCalledWith(expect.objectContaining({
      message: 'CSV processing failed in worker',
      name: 'WorkerError'
    }));
    expect(defaultProps.finished).not.toHaveBeenCalled();
  });

  it('should call cancel and terminate worker', async () => {
    const { result } = renderHook(() => useStream(defaultProps));
    await act(async () => {
      result.current.start();
    });
    await vi.waitFor(() => expect(mockPostMessage).toHaveBeenCalledTimes(1)); // Ensure worker is active

    await act(async () => {
      result.current.cancel();
    });
    expect(result.current.streaming).toBe(false);
    expect(mockTerminate).toHaveBeenCalledTimes(1);
    // Check if abortController.abort() was called (indirectly, as abortController is not exposed)
    // For this test, mockTerminate is the primary indicator.
  });
  
  // Helper function from FileHelper.ts (copied for test use, or could be imported if test setup allows)
  // Ensure this matches the actual implementation or import it.
  const bytesToSize = (bytes: number) => {
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    if (bytes === 0) return "0 Bytes"; // Original returns "n/a", but "0 Bytes" is fine for tests
    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString(), 10);
    if (i === 0) return `${bytes} ${sizes[i]}`;
    return `${(bytes / 1024 ** i).toFixed(1)} ${sizes[i]}`;
  };

});

// We might also want a describe block for JSON mode to ensure no regressions
describe('useStream Hook - JSON Functionality', () => {
  const mockUrl = 'test.json';

  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkerOnmessage = null;
     (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      body: createMockReadableStream([]),
      status: 200,
      statusText: 'OK'
    });
  });
  
  const defaultJSONProps: UseStreamProps<object> = { // Assuming T is object for JSON
    url: mockUrl,
    mode: 'json',
    finished: vi.fn(),
    chunkProcessed: vi.fn(),
    onError: vi.fn(),
  };

  it('should process JSON chunks', async () => {
    const { result } = renderHook(() => useStream(defaultJSONProps));
    await act(async () => { result.current.start(); });
    await vi.waitFor(() => expect(mockPostMessage).toHaveBeenCalledTimes(1));

    const jsonObj1 = { id: 1, data: "test1" };
    act(() => {
      if (mockWorkerOnmessage) {
        mockWorkerOnmessage({ data: { type: 'chunk', data: JSON.stringify(jsonObj1) } } as MessageEvent<WorkerMessage>);
      }
    });
    expect(defaultJSONProps.chunkProcessed).toHaveBeenCalledWith({ chunkIndex: 0, chunk: jsonObj1 });

    const jsonObj2 = { id: 2, data: "test2" };
    act(() => {
      if (mockWorkerOnmessage) {
        mockWorkerOnmessage({ data: { type: 'chunk', data: JSON.stringify(jsonObj2) } } as MessageEvent<WorkerMessage>);
      }
    });
     expect(defaultJSONProps.chunkProcessed).toHaveBeenCalledWith({ chunkIndex: 1, chunk: jsonObj2 });

    act(() => {
      if (mockWorkerOnmessage) {
        mockWorkerOnmessage({ data: { type: 'finished', data: null } } as MessageEvent<WorkerMessage>); // data for 'finished' in JSON mode was original full string, here simplified
      }
    });
    expect(defaultJSONProps.finished).toHaveBeenCalledWith([jsonObj1, jsonObj2]);
    expect(result.current.streaming).toBe(false);
  });
});
