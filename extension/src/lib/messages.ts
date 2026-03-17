import type { Message, MessageType } from '../types';

/** Send a typed message to the background service worker (or side panel). */
export function sendMessage<T = unknown>(
  type: MessageType,
  payload?: T
): Promise<unknown> {
  const msg: Message<T> = { type, payload };
  return chrome.runtime.sendMessage(msg).catch(() => {
    // Receiver may not exist or may not send a response — this is fine
  });
}

/** Send a typed message to a specific tab's content script. */
export function sendToTab<T = unknown>(
  tabId: number,
  type: MessageType,
  payload?: T
): Promise<unknown> {
  const msg: Message<T> = { type, payload };
  return chrome.tabs.sendMessage(tabId, msg).catch(() => {
    // Content script may not be loaded on this tab
  });
}

/** Listen for typed messages. Returns an unsubscribe function. */
export function onMessage(
  handler: (
    message: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => boolean | void
): () => void {
  chrome.runtime.onMessage.addListener(handler);
  return () => chrome.runtime.onMessage.removeListener(handler);
}
