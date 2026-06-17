export type MessageRole = "user" | "assistant" | "system";

export interface Message {
  id: string;
  thread_id: string;
  user_id: string;
  role: MessageRole;
  content: string;
  provider_response_id: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  created_at: string;
  toolCall?: {
    name: string;
    status: "running" | "completed";
    results?: any[];
    filters?: {
      category?: string | null;
      tag?: string | null;
    };
  };
}

export interface ChatRequest {
  thread_id?: string;
  message: string;
}
