export interface Source {
  url: string;
  title: string;
  type: "blog" | "page" | "external";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface ChatResponse {
  reply: string;
  sources?: Source[];
}

export interface ChatErrorResponse {
  error: string;
  code?: string;
}
