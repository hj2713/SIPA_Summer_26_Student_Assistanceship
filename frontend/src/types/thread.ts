import type { Message } from "./message";

export interface Thread {
  id: string;
  user_id: string;
  title: string;
  provider: string;
  model: string | null;
  provider_thread_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThreadWithMessages extends Thread {
  messages: Message[];
}

export interface CreateThreadPayload {
  title?: string;
  provider?: string;
  model?: string;
}

export interface RenameThreadPayload {
  title: string;
}
