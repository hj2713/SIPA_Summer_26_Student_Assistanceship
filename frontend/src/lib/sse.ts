/**
 * SSE parser using fetch + ReadableStream.
 *
 * We cannot use native EventSource because:
 *   1. EventSource only supports GET requests.
 *   2. EventSource cannot send custom headers (needed for Authorization).
 *
 * Instead we POST with fetch, read the raw byte stream, and parse
 * SSE frames ("event:\n", "data:\n", "\n") manually.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export type SseEventName = "thread" | "delta" | "tool" | "done" | "error";

export interface SseHandlers {
  onThread?: (data: { thread_id: string }) => void;
  onDelta?: (data: { text: string }) => void;
  onTool?: (data: { name: string; status: "running" | "completed"; results?: any[]; filters?: any }) => void;
  onDone?: (data: { message_id: string; response_id: string }) => void;
  onError?: (data: { message: string }) => void;
}

export async function postSse(
  path: string,
  body: unknown,
  jwt: string,
  handlers: SseHandlers,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE request failed: HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // State for a single SSE frame
  let currentEvent = "";
  let currentData = "";

  const dispatch = (event: string, rawData: string) => {
    let data: any;
    try {
      data = JSON.parse(rawData);
    } catch {
      // Ignore malformed JSON frames
      return;
    }

    switch (event as SseEventName) {
      case "thread":
        handlers.onThread?.(data);
        break;
      case "delta":
        handlers.onDelta?.(data);
        break;
      case "tool":
        handlers.onTool?.(data);
        break;
      case "done":
        handlers.onDone?.(data);
        break;
      case "error":
        handlers.onError?.(data);
        break;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    // Keep the last potentially incomplete line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        currentData = line.slice("data:".length).trim();
      } else if (line.trim() === "" && currentEvent) {
        // Blank line = end of SSE frame
        dispatch(currentEvent, currentData);
        currentEvent = "";
        currentData = "";
      }
    }
  }
}
