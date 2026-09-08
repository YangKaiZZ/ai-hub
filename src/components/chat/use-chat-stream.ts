"use client";

import * as React from "react";
import type { ChatEvent } from "@/server/ai/chat/service";
import type { SourceRef } from "@/server/rag/retriever";

export interface ToolActivity {
  name: string;
  label: string;
  status: "running" | "ok" | "error";
  summary?: string;
}

export interface ChatMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  sources?: SourceRef[] | null;
  toolCalls?: ToolActivity[] | null;
  createdAt: string;
  pending?: boolean;
}

interface Target {
  conversationId?: string;
  workspaceId?: string;
  create?: Record<string, unknown>;
}

export function useChatStream(initialMessages: ChatMessage[], target: Target, onConversationCreated?: (id: string) => void) {
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [streaming, setStreaming] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [provider, setProvider] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const targetRef = React.useRef(target);
  React.useEffect(() => {
    targetRef.current = target;
  }, [target]);

  const send = React.useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || streaming) return;
      setError(null);
      setStreaming(true);
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "USER", content, createdAt: new Date().toISOString() };
      const assistantId = `a-${Date.now()}`;
      setMessages((m) => [...m, userMsg, { id: assistantId, role: "ASSISTANT", content: "", createdAt: new Date().toISOString(), pending: true, toolCalls: [] }]);

      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...targetRef.current, message: content }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const json = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
          throw new Error(json?.error?.message ?? "The AI assistant is unavailable right now.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const line = part.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            let event: ChatEvent;
            try {
              event = JSON.parse(payload) as ChatEvent;
            } catch {
              continue;
            }
            applyEvent(event, assistantId);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Something went wrong.");
          setMessages((m) => m.filter((x) => !(x.id === assistantId && !x.content)));
        }
      } finally {
        setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, pending: false } : x)));
        setStreaming(false);
        abortRef.current = null;
      }

      function applyEvent(event: ChatEvent, id: string) {
        switch (event.type) {
          case "meta":
            setProvider(event.provider);
            if (!targetRef.current.conversationId && !targetRef.current.workspaceId) onConversationCreated?.(event.conversationId);
            setMessages((m) => m.map((x) => (x.id === id ? { ...x, sources: event.sources } : x)));
            break;
          case "text":
            setMessages((m) => m.map((x) => (x.id === id ? { ...x, content: x.content + event.text } : x)));
            break;
          case "tool_call":
            setMessages((m) => m.map((x) => (x.id === id ? { ...x, toolCalls: [...(x.toolCalls ?? []), { name: event.name, label: event.label, status: "running" }] } : x)));
            break;
          case "tool_result":
            setMessages((m) =>
              m.map((x) => {
                if (x.id !== id) return x;
                const calls = [...(x.toolCalls ?? [])];
                const idx = calls.map((c) => c.name === event.name && c.status === "running").lastIndexOf(true);
                if (idx >= 0) calls[idx] = { ...calls[idx]!, status: event.ok ? "ok" : "error", summary: event.summary };
                return { ...x, toolCalls: calls };
              }),
            );
            break;
          case "saved":
            setMessages((m) => m.map((x) => (x.id === id ? { ...x, id: event.messageId } : x)));
            break;
          case "error":
            setError(event.message);
            break;
          default:
            break;
        }
      }
    },
    [streaming, onConversationCreated],
  );

  const stop = React.useCallback(() => abortRef.current?.abort(), []);
  const reset = React.useCallback((next: ChatMessage[]) => {
    abortRef.current?.abort();
    setMessages(next);
    setError(null);
  }, []);

  return { messages, send, stop, reset, streaming, error, provider };
}
