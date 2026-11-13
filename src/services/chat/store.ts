import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { PortfolioSnapshot } from '@/services/types';
import { useUiStore } from '@/store/ui-store';

import { ChatError, streamChat, type ChatPhase, type ChatSource, type ChatTurn } from './client';
import { buildPortfolioContext } from './context';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  sources?: ChatSource[];
  error?: { code: string; message: string };
};

type ChatStatus = 'idle' | 'streaming';

type ChatState = {
  messages: ChatMessage[];
  status: ChatStatus;
  /** Live phase for the empty assistant bubble. Not persisted. */
  pendingPhase: ChatPhase | null;
  send: (text: string, portfolio: PortfolioSnapshot | undefined) => Promise<void>;
  stop: () => void;
  newChat: () => void;
  retry: () => void;
};

const STORAGE_KEY = 'folio-chat-v1';
const MAX_STORED = 50;
const MAX_SENT = 20;
const MAX_CONTENT = 8000;
const FLUSH_MS = 50;

let generation = 0;
let abortController: AbortController | null = null;
let latestSnapshot: PortfolioSnapshot | undefined;
let idSeq = 0;

function nextId(): string {
  idSeq += 1;
  return `m${idSeq.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function cap(messages: ChatMessage[]): ChatMessage[] {
  return messages.length > MAX_STORED ? messages.slice(messages.length - MAX_STORED) : messages;
}

function isSource(value: unknown): value is ChatSource {
  if (!value || typeof value !== 'object') return false;
  const source = value as ChatSource;
  return typeof source.title === 'string' && typeof source.url === 'string';
}

function sanitize(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: ChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const message = item as Partial<ChatMessage>;
    if (message.role !== 'user' && message.role !== 'assistant') continue;
    if (typeof message.content !== 'string' || typeof message.id !== 'string') continue;
    if (typeof message.createdAt !== 'number') continue;
    const error =
      message.error &&
      typeof message.error === 'object' &&
      typeof message.error.code === 'string' &&
      typeof message.error.message === 'string'
        ? { code: message.error.code, message: message.error.message }
        : undefined;
    const sources = Array.isArray(message.sources) ? message.sources.filter(isSource) : undefined;
    // Drop a placeholder left behind by a stream that never produced text.
    if (!message.content.trim() && !error && !sources?.length) continue;
    messages.push({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      ...(sources && sources.length > 0 ? { sources } : {}),
      ...(error ? { error } : {}),
    });
  }
  return cap(messages);
}

function toTurns(messages: ChatMessage[]): ChatTurn[] {
  return messages
    .filter((message) => !message.error && message.content.trim().length > 0)
    .slice(-MAX_SENT)
    .map((message) => ({ role: message.role, content: message.content.slice(0, MAX_CONTENT) }));
}

/** Latest snapshot for `retry()`, kept off the persisted slice. */
export function rememberPortfolio(snapshot: PortfolioSnapshot | undefined): void {
  latestSnapshot = snapshot;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      status: 'idle',
      pendingPhase: null,
      async send(text, portfolio) {
        const trimmed = text.trim();
        if (!trimmed || get().status === 'streaming') return;
        latestSnapshot = portfolio;

        const gen = ++generation;
        const controller = new AbortController();
        abortController = controller;

        const user: ChatMessage = {
          id: nextId(),
          role: 'user',
          content: trimmed,
          createdAt: Date.now(),
        };
        const assistant: ChatMessage = {
          id: nextId(),
          role: 'assistant',
          content: '',
          createdAt: Date.now(),
        };
        const assistantId = assistant.id;
        set({
          messages: cap([...get().messages, user, assistant]),
          status: 'streaming',
          pendingPhase: 'thinking',
        });

        const hideBalances = useUiStore.getState().hideBalances;
        const context = portfolio ? buildPortfolioContext(portfolio, hideBalances) : undefined;
        const history = toTurns(get().messages);

        let pending = '';
        let timer: ReturnType<typeof setTimeout> | null = null;
        let gotDelta = false;

        const clearTimer = () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        };

        const apply = (chunk: string) => {
          if (!chunk || gen !== generation) return;
          set((state) => ({
            pendingPhase: null,
            messages: state.messages.map((message) =>
              message.id === assistantId ? { ...message, content: message.content + chunk } : message,
            ),
          }));
        };

        const flush = () => {
          clearTimer();
          const chunk = pending;
          pending = '';
          apply(chunk);
        };

        const schedule = () => {
          if (timer || gen !== generation) return;
          timer = setTimeout(() => {
            timer = null;
            const chunk = pending;
            pending = '';
            apply(chunk);
          }, FLUSH_MS);
        };

        try {
          await streamChat({
            messages: history,
            portfolio: context,
            signal: controller.signal,
            onDelta: (delta) => {
              if (!gotDelta) {
                gotDelta = true;
                pending += delta;
                flush();
                return;
              }
              pending += delta;
              schedule();
            },
            onStatus: (phase) => {
              if (gen !== generation || gotDelta) return;
              set({ pendingPhase: phase });
            },
            onSources: (sources) => {
              if (gen !== generation) return;
              set((state) => ({
                messages: state.messages.map((message) =>
                  message.id === assistantId ? { ...message, sources } : message,
                ),
              }));
            },
          });
          flush();
          if (gen !== generation) return;
          set((state) => ({
            status: 'idle',
            pendingPhase: null,
            messages: cap(
              state.messages.filter((message) => {
                if (message.id !== assistantId) return true;
                return (
                  message.content.trim().length > 0 ||
                  Boolean(message.error) ||
                  (message.sources?.length ?? 0) > 0
                );
              }),
            ),
          }));
        } catch (error) {
          flush();
          if (gen !== generation) return;
          const chatError =
            error instanceof ChatError
              ? error
              : new ChatError('network', 'Assistente non raggiungibile. Il worker è avviato?');
          set((state) => ({
            status: 'idle',
            pendingPhase: null,
            messages: state.messages.map((message) =>
              message.id === assistantId
                ? { ...message, error: { code: chatError.code, message: chatError.message } }
                : message,
            ),
          }));
        } finally {
          clearTimer();
          if (abortController === controller) abortController = null;
          if (gen === generation && get().status === 'streaming') set({ status: 'idle', pendingPhase: null });
        }
      },
      stop() {
        abortController?.abort();
        set({ pendingPhase: null });
      },
      newChat() {
        generation += 1;
        abortController?.abort();
        abortController = null;
        set({ messages: [], status: 'idle', pendingPhase: null });
      },
      retry() {
        if (get().status === 'streaming') return;
        const messages = get().messages;
        let index = -1;
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i]?.role === 'user') {
            index = i;
            break;
          }
        }
        if (index < 0) return;
        const text = messages[index]?.content ?? '';
        set({ messages: messages.slice(0, index), status: 'idle' });
        void get().send(text, latestSnapshot);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => AsyncStorage),
      // `pendingPhase` stays out of storage: it only exists while a turn is streaming.
      partialize: (state) => ({ messages: cap(state.messages) }),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as { messages?: unknown };
        // A turn already on screen wins over a late rehydrate so a fast first
        // send is not replaced by the previous conversation.
        if (current.messages.length > 0 || current.status === 'streaming') {
          return { ...current, status: current.status === 'streaming' ? 'streaming' : 'idle' };
        }
        return { ...current, messages: sanitize(stored.messages), status: 'idle' };
      },
    },
  ),
);
