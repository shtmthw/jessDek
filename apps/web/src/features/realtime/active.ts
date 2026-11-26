// Which conversation is currently on screen. Read by the event handler so messages that arrive
// in the open chat are marked read instead of counted as unread.
let activeConversationId: string | null = null;

export const setActiveConversation = (id: string | null) => {
  activeConversationId = id;
};
export const getActiveConversation = () => activeConversationId;

/**
 * Whether the address bar is on this chat right now. The active conversation above is cleared only
 * once the chat unmounts, which is a render (or an exit animation) after a navigation. The URL
 * changes the moment anything navigates, so an event that arrives just after you left a chat (say,
 * you declined a request and went back to Requests) can't pull you out of where you went.
 */
export const isOnChat = (conversationId: string) =>
  window.location.pathname === `/c/${conversationId}`;
