"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { BookOpen, CheckSquare, FileText, FolderOpen, Search, Sparkles, LayoutDashboard, CalendarDays, GraduationCap, BrainCircuit } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { apiGet } from "@/lib/client/api";
import type { SearchResult } from "@/server/search/service";

const kindIcon: Record<SearchResult["kind"], React.ComponentType<{ className?: string }>> = {
  task: CheckSquare,
  course: BookOpen,
  resource: FolderOpen,
  document: FileText,
  workspace: Sparkles,
};

const quickLinks = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "My Tasks", href: "/tasks", icon: CheckSquare },
  { label: "Courses", href: "/courses", icon: BookOpen },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "AI Tutor", href: "/tutor", icon: BrainCircuit },
  { label: "Grades", href: "/grades", icon: GraduationCap },
];

const groupHeadingClass =
  "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle";
const itemClass = "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm data-[selected=true]:bg-surface-muted";

export function GlobalSearchTrigger() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-64 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-subtle shadow-xs transition hover:border-border-strong md:flex lg:w-80"
        aria-label="Search (Ctrl+K)"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search tasks, courses, files…</span>
        <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-subtle">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface-muted md:hidden"
        aria-label="Search"
      >
        <Search className="size-5" />
      </button>
      {open ? <GlobalSearchDialog open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

/** Mounted only while open, so state resets naturally between openings. */
function GlobalSearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [fetched, setFetched] = React.useState<{ q: string; results: SearchResult[] } | null>(null);
  const trimmed = query.trim();
  const active = trimmed.length >= 2;
  const results = active && fetched?.q === trimmed ? fetched.results : [];
  const loading = active && fetched?.q !== trimmed;

  React.useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const t = setTimeout(() => {
      apiGet<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => {
          if (!cancelled) setFetched({ q: trimmed, results: res.results });
        })
        .catch(() => {
          if (!cancelled) setFetched({ q: trimmed, results: [] });
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmed, active]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 [&>button]:hidden" size="lg" aria-describedby={undefined}>
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command label="Global search" shouldFilter={false} className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 text-subtle" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search tasks, courses, resources, documents…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
              autoFocus
            />
            {loading ? <span className="text-xs text-subtle">Searching…</span> : null}
          </div>
          <Command.List className="max-h-[60dvh] overflow-y-auto p-2 scrollbar-thin">
            {active && !loading && results.length === 0 ? (
              <Command.Empty className="px-3 py-8 text-center text-sm text-muted">No results for “{query}”.</Command.Empty>
            ) : null}
            {results.length > 0 ? (
              <Command.Group heading="Results" className={groupHeadingClass}>
                {results.map((r) => {
                  const Icon = kindIcon[r.kind];
                  return (
                    <Command.Item key={`${r.kind}-${r.id}`} value={`${r.kind}-${r.id}`} onSelect={() => go(r.href)} className={itemClass}>
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-brand-600 dark:text-brand-300">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{r.title}</span>
                        {r.subtitle ? <span className="block truncate text-xs text-muted">{r.subtitle}</span> : null}
                      </span>
                      <span className="text-[11px] uppercase tracking-wide text-subtle">{r.kind}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            ) : null}
            {!active ? (
              <Command.Group heading="Go to" className={groupHeadingClass}>
                {quickLinks.map((l) => (
                  <Command.Item key={l.href} value={l.href} onSelect={() => go(l.href)} className={itemClass}>
                    <l.icon className="size-4 text-subtle" />
                    {l.label}
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
          <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-subtle">
            <span>↑↓ to navigate · ↵ to open · Esc to close</span>
            <span className="hidden sm:inline">AI semantic search is available inside Resources</span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
