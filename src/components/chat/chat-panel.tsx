"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUp, BookOpen, CheckCircle2, Loader2, Sparkles, Square, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/chat/markdown";
import type { ChatMessage, ToolActivity } from "@/components/chat/use-chat-stream";
import { cn } from "@/lib/utils";

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onStop: () => void;
  suggestions?: string[];
  placeholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  provider?: string | null;
  className?: string;
  initialInput?: string;
}

export function ChatPanel({ messages, streaming, error, onSend, onStop, suggestions = [], placeholder = "Ask anything…", emptyTitle = "How can I help you study?", emptyDescription, provider, className, initialInput }: Props) {
  const [input, setInput] = React.useState(initialInput ?? "");
  const listRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = () => {
    if (!input.trim() || streaming) return;
    onSend(input);
    setInput("");
    textareaRef.current?.focus();
  };

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-5 scrollbar-thin sm:px-6" aria-live="polite">
        {messages.length === 0 ? (
          <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center text-center">
            <span className="mb-4 inline-flex size-14 items-center justify-center rounded-2xl brand-gradient text-white shadow-md">
              <Sparkles className="size-7" />
            </span>
            <h2 className="text-xl font-semibold tracking-tight">{emptyTitle}</h2>
            {emptyDescription ? <p className="mt-2 text-sm text-muted">{emptyDescription}</p> : null}
            {suggestions.length ? (
              <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => onSend(s)} className="rounded-xl border border-border bg-surface px-3.5 py-3 text-left text-sm transition hover:border-brand-300 hover:bg-primary-soft/40">
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-surface/80 px-4 py-3 backdrop-blur sm:px-6">
        {error ? (
          <p role="alert" className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
        {messages.length > 0 && suggestions.length && !streaming ? (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {suggestions.slice(0, 4).map((s) => (
              <button key={s} type="button" onClick={() => onSend(s)} className="shrink-0 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted transition hover:border-brand-300 hover:text-foreground">
                {s}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-sm focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-500/15">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={Math.min(6, Math.max(1, input.split("\n").length))}
            placeholder={placeholder}
            aria-label="Message"
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-subtle"
          />
          {streaming ? (
            <Button size="icon-sm" variant="outline" onClick={onStop} aria-label="Stop generating">
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button size="icon-sm" onClick={submit} disabled={!input.trim()} aria-label="Send message">
              <ArrowUp />
            </Button>
          )}
        </div>
        <p className="mx-auto mt-1.5 max-w-3xl text-[11px] text-subtle">
          Shift+Enter for a new line. AI Hub explains and guides — it will not complete graded work for you.
          {provider === "mock" ? " Demo mode: connect an AI provider for full responses." : ""}
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "USER";
  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-xl brand-gradient text-white">
          <Sparkles className="size-4" />
        </span>
      ) : null}
      <div className={cn("max-w-[85%] space-y-2", isUser && "items-end")}>
        {message.toolCalls && message.toolCalls.length > 0 ? <ToolActivityList calls={message.toolCalls} /> : null}
        <div className={cn("rounded-2xl px-4 py-3 text-sm shadow-xs", isUser ? "bg-primary text-primary-foreground" : "border border-border bg-surface")}>
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : message.content ? (
            <Markdown text={message.content} />
          ) : message.pending ? (
            <span className="inline-flex items-center gap-2 text-muted">
              <Loader2 className="size-4 animate-spin" /> Thinking…
            </span>
          ) : null}
        </div>
        {!isUser && message.sources && message.sources.length > 0 ? <SourceChips sources={message.sources} /> : null}
      </div>
    </div>
  );
}

function ToolActivityList({ calls }: { calls: ToolActivity[] }) {
  return (
    <ul className="space-y-1">
      {calls.map((c, i) => (
        <li key={`${c.name}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-muted px-2.5 py-1 text-xs text-muted">
          {c.status === "running" ? <Loader2 className="size-3 animate-spin text-brand-500" /> : c.status === "ok" ? <CheckCircle2 className="size-3 text-success" /> : <XCircle className="size-3 text-danger" />}
          {c.label}
          {c.summary && c.status !== "running" ? <span className="text-subtle">· {c.summary}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function SourceChips({ sources }: { sources: NonNullable<ChatMessage["sources"]> }) {
  const unique = sources.filter((s, i, arr) => arr.findIndex((x) => x.documentId === s.documentId && x.page === s.page) === i);
  return (
    <div className="flex flex-wrap gap-1.5">
      {unique.map((s) => (
        <Link
          key={s.chunkId}
          href={`/resources?document=${s.documentId}#chunk-${s.chunkId}`}
          className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-200 dark:text-brand-200"
          title={s.snippet}
        >
          <BookOpen className="size-3" /> {s.title}
          {s.page ? `, p. ${s.page}` : ""}
        </Link>
      ))}
    </div>
  );
}
