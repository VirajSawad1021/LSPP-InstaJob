"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCheck, ChevronDown, FilePlus2, FileText, Hash, Loader2, Paperclip, Pin, PinOff, Send, X } from "lucide-react";
import { api, apiForm, errorMessage } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { ChatAttachment, ChatMessage, ChatThread } from "@/lib/types";
import { Avatar, ErrorNote, PageLoader } from "@/components/ui";

const MS_REF = /#(m\d+)\b/g;
const dayLabel = (iso: string) => {
  const d = new Date(iso), today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
};
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Message text with #m2-style references turned into milestone chips. */
function RichText({ text, titles, onMilestone, mine }: { text: string; titles: Record<string, string>; onMilestone: (id: string) => void; mine: boolean }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(MS_REF)) {
    const id = m[1];
    if (!titles[id]) continue;
    parts.push(text.slice(last, m.index));
    parts.push(
      <button key={m.index} onClick={() => onMilestone(id)} title={titles[id]}
        className={`mx-0.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-px text-[12px] font-medium ${mine ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-ink ring-1 ring-line hover:ring-ink/30"}`}>
        <Hash className="h-3 w-3" />{id} {titles[id].length > 22 ? `${titles[id].slice(0, 22)}…` : titles[id]}
      </button>,
    );
    last = (m.index ?? 0) + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

function Attachments({ items, mine }: { items: ChatAttachment[]; mine: boolean }) {
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((a) =>
        a.type.startsWith("image/") && a.url ? (
          <a key={a.path} href={a.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-black/10">
            {/* signed, short-lived URL from a private bucket, so next/image optimisation doesn't apply */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.name} className="max-h-48 max-w-[240px] object-cover" />
          </a>
        ) : (
          <a key={a.path} href={a.url ?? "#"} target="_blank" rel="noreferrer"
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] ${mine ? "bg-white/10 text-white hover:bg-white/20" : "bg-white text-ink ring-1 ring-line hover:ring-ink/30"}`}>
            <FileText className="h-4 w-4 shrink-0" />
            <span className="max-w-[180px] truncate">{a.name}</span>
            <span className="opacity-60">{kb(a.size)}</span>
          </a>
        ),
      )}
    </div>
  );
}

export function Chat({ cid, onOpenMilestone, onChangeRequest }: {
  cid: string;
  onOpenMilestone: (id: string) => void;
  /** Turn a message into a change request (both agents then price it). */
  onChangeRequest?: (m: ChatMessage) => void;
}) {
  const [t, setT] = useState<ChatThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<ChatAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [showRefs, setShowRefs] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSent = useRef(0);

  const load = useCallback(async () => {
    try {
      const next = await api<ChatThread>(`/api/contracts/${cid}/messages`);
      setT(next);
      setError(null);
      // Mark read only when something new arrived: marking read is itself a realtime event,
      // so doing it unconditionally would reload forever.
      const hasUnread = next.messages.some((m) => m.author_role !== next.side && (!next.my_last_read_at || m.created_at > next.my_last_read_at));
      if (hasUnread) void api(`/api/contracts/${cid}/read`, { body: {} }).catch(() => {});
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [cid]);

  useEffect(() => {
    load();
  }, [load]);

  // New messages, pins and read receipts arrive live.
  useEffect(() => {
    const f = `contract_id=eq.${cid}`;
    const ch = supabase
      .channel(`chat-${cid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_comments", filter: f }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reads", filter: f }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [cid, load]);

  // "typing…" via Realtime broadcast (ephemeral, nothing stored).
  useEffect(() => {
    if (!t) return;
    let hide: ReturnType<typeof setTimeout>;
    const ch = supabase.channel(`typing-${cid}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload?.side === t.side) return;
      setOtherTyping(true);
      clearTimeout(hide);
      hide = setTimeout(() => setOtherTyping(false), 3500);
    }).subscribe();
    typingChannel.current = ch;
    return () => {
      clearTimeout(hide);
      supabase.removeChannel(ch);
    };
  }, [cid, t?.side]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [t?.messages.length, otherTyping]);

  const titles = useMemo(() => Object.fromEntries((t?.milestones ?? []).map((m) => [m.id, m.title])), [t]);
  const pinned = (t?.messages ?? []).filter((m) => m.pinned);

  function onType(v: string) {
    setText(v);
    const now = Date.now();
    if (now - lastTypingSent.current > 1500 && t) {
      lastTypingSent.current = now;
      void typingChannel.current?.send({ type: "broadcast", event: "typing", payload: { side: t.side } });
    }
  }

  async function attach(list: FileList | null) {
    if (!list?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const f of Array.from(list).slice(0, 5 - files.length)) {
        const form = new FormData();
        form.append("file", f);
        const up = await apiForm<ChatAttachment>(`/api/contracts/${cid}/files`, form);
        setFiles((cur) => [...cur, up]);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function send() {
    if ((!text.trim() && !files.length) || sending) return;
    setSending(true);
    setError(null);
    try {
      await api(`/api/contracts/${cid}/messages`, { body: { body: text.trim(), attachments: files } });
      setText("");
      setFiles([]);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function togglePin(m: ChatMessage) {
    try {
      await api(`/api/messages/${m.id}/pin`, { body: { pinned: !m.pinned } });
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (!t) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;
  const myLast = [...t.messages].reverse().find((m) => m.author_role === t.side);
  const seen = !!(myLast && t.other_last_read_at && t.other_last_read_at >= myLast.created_at);
  // first message from the other side that arrived since I last opened the chat
  const firstUnread = t.messages.find((m) => m.author_role !== t.side && t.my_last_read_at && m.created_at > t.my_last_read_at)?.id;

  return (
    <div className="flex h-[calc(100vh-360px)] min-h-[520px] flex-col overflow-hidden rounded-[20px] border border-line bg-white">
      {pinned.length > 0 && (
        <div className="border-b border-line bg-warn-bg/50">
          <button onClick={() => setShowPins(!showPins)} className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[12px] font-medium text-warn">
            <Pin className="h-3.5 w-3.5" /> {pinned.length} agreed decision{pinned.length > 1 ? "s" : ""}
            <span className="truncate font-normal text-ink/70">· latest: {pinned[pinned.length - 1].body}</span>
            <ChevronDown className={`ml-auto h-4 w-4 shrink-0 transition-transform ${showPins ? "rotate-180" : ""}`} />
          </button>
          {showPins && (
            <ul className="space-y-1.5 px-4 pb-3">
              {pinned.map((m) => (
                <li key={m.id} className="flex items-start gap-2 text-[13px] text-ink">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" />
                  <span className="flex-1">{m.body}</span>
                  <span className="shrink-0 text-[11px] text-muted">{m.author_name} · {dayLabel(m.pinned_at ?? m.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex-1 space-y-1 overflow-y-auto px-4 py-5 scrollbar-thin sm:px-6">
        {!t.messages.length && (
          <div className="mx-auto max-w-sm py-16 text-center">
            <p className="text-[15px] font-medium">Start the conversation</p>
            <p className="mt-1 text-[13px] text-body">Questions, updates, files. Type <span className="rounded bg-panel-2 px-1 font-mono">#m2</span> to point at a milestone, and pin anything you both agree on.</p>
          </div>
        )}
        {t.messages.map((m, i) => {
          const mine = m.author_role === t.side;
          const prev = t.messages[i - 1];
          const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
          const grouped = !newDay && prev?.author_role === m.author_role && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60_000;
          const unreadMark = m.id === firstUnread;
          return (
            <Fragment key={m.id}>
              {newDay && <p className="py-3 text-center text-[11px] font-medium text-muted">{dayLabel(m.created_at)}</p>}
              {unreadMark && (
                <div className="flex items-center gap-3 py-2 text-[11px] font-medium text-clay">
                  <span className="h-px flex-1 bg-clay/40" /> New <span className="h-px flex-1 bg-clay/40" />
                </div>
              )}
              <div className={`group flex gap-2.5 ${mine ? "flex-row-reverse" : ""} ${grouped ? "pt-0.5" : "pt-3"}`}>
                <div className="w-8 shrink-0">{!grouped && <Avatar name={m.author_name || m.author_role} className="h-8 w-8 text-[11px]" />}</div>
                <div className={`flex max-w-[78%] flex-col ${mine ? "items-end" : "items-start"}`}>
                  {!grouped && (
                    <p className="mb-1 text-[11px] text-muted">
                      {m.author_name || (m.author_role === "client" ? "Founder" : "Developer")} · {time(m.created_at)}
                      {m.milestone_id && <span> · on {m.milestone_id}</span>}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5">
                    {mine && (
                      <div className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button onClick={() => togglePin(m)} title={m.pinned ? "Unpin" : "Pin as an agreed decision"}
                          className="rounded-full p-1 text-muted hover:bg-panel-2 hover:text-ink">
                          {m.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        </button>
                        {onChangeRequest && m.body !== "(attachment)" && (
                          <button onClick={() => onChangeRequest(m)} title="Turn into a change request"
                            className="rounded-full p-1 text-muted hover:bg-panel-2 hover:text-ink">
                            <FilePlus2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    <div className={`relative rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${mine ? "rounded-tr-md bg-ink text-white" : "rounded-tl-md bg-panel-2 text-ink"} ${m.pinned ? "ring-2 ring-warn/50" : ""}`}>
                      {m.pinned && <p className={`mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${mine ? "text-[#f5c985]" : "text-warn"}`}><Pin className="h-3 w-3" /> Decision</p>}
                      {m.body !== "(attachment)" && <p className="whitespace-pre-wrap break-words"><RichText text={m.body} titles={titles} onMilestone={onOpenMilestone} mine={mine} /></p>}
                      <Attachments items={m.attachments} mine={mine} />
                    </div>
                    {!mine && (
                      <div className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button onClick={() => togglePin(m)} title={m.pinned ? "Unpin" : "Pin as an agreed decision"}
                          className="rounded-full p-1 text-muted hover:bg-panel-2 hover:text-ink">
                          {m.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        </button>
                        {onChangeRequest && m.body !== "(attachment)" && (
                          <button onClick={() => onChangeRequest(m)} title="Turn into a change request"
                            className="rounded-full p-1 text-muted hover:bg-panel-2 hover:text-ink">
                            <FilePlus2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {mine && m.id === myLast?.id && (
                    <p className={`mt-1 flex items-center gap-1 text-[11px] ${seen ? "text-info" : "text-muted"}`}>
                      <CheckCheck className="h-3.5 w-3.5" /> {seen ? "Seen" : "Delivered"}
                    </p>
                  )}
                </div>
              </div>
            </Fragment>
          );
        })}
        {otherTyping && (
          <div className="flex items-center gap-2 pl-11 pt-3 text-[12px] text-muted">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 120}ms` }} />)}
            </span>
            {t.side === "client" ? "The developer" : "The founder"} is typing
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-line p-3">
        <ErrorNote message={error} />
        {files.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((f) => (
              <span key={f.path} className="inline-flex items-center gap-1.5 rounded-full bg-panel-2 py-1 pl-3 pr-1.5 text-[12px]">
                <FileText className="h-3.5 w-3.5" /> <span className="max-w-[160px] truncate">{f.name}</span>
                <button onClick={() => setFiles(files.filter((x) => x.path !== f.path))} className="rounded-full p-0.5 hover:bg-white" aria-label="Remove"><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
        {showRefs && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {t.milestones.map((m) => (
              <button key={m.id} onClick={() => { setText((v) => `${v}${v && !v.endsWith(" ") ? " " : ""}#${m.id} `); setShowRefs(false); }}
                className="rounded-full border border-line-strong bg-white px-2.5 py-1 text-[12px] hover:border-ink/40">
                <span className="font-mono text-muted">#{m.id}</span> {m.title}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => attach(e.target.files)} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading || files.length >= 5} title="Attach files (up to 10 MB each)"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink hover:border-ink/40 disabled:opacity-50">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </button>
          <button onClick={() => setShowRefs(!showRefs)} title="Reference a milestone"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${showRefs ? "border-ink bg-ink text-white" : "border-line-strong text-ink hover:border-ink/40"}`}>
            <Hash className="h-4 w-4" />
          </button>
          <textarea
            rows={1}
            value={text}
            onChange={(e) => onType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Message the ${t.side === "client" ? "developer" : "founder"}…`}
            title="Enter to send, Shift+Enter for a new line"
            className="max-h-40 min-h-10 flex-1 resize-none rounded-2xl border border-line-strong/80 px-3.5 py-2.5 text-[14px] leading-snug focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink [field-sizing:content]"
          />
          <button onClick={send} disabled={sending || (!text.trim() && !files.length)} aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white hover:bg-ink-soft disabled:bg-[#b9b6ae]">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
