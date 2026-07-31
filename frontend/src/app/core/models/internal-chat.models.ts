export interface InternalChatUser {
  id: string;
  name: string;
  email: string;
  role: string;
  profilePhotoUrl: string | null;
}

export type InternalMessageType = 'text' | 'image' | 'audio' | 'file' | 'system';

export interface InternalMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  senderName: string;
  senderRole: string;
  body: string;
  type: InternalMessageType;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaName: string | null;
  mediaSize: number | null;
  durationMs: number | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  replyToMessageId: string | null;
  isForwarded: boolean;
  reactionToMessageId: string | null;
  reactionEmoji: string | null;
  reactions: { userId: string; name: string; emoji: string }[];
  createdAt: Date;
}

export interface InternalConversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  members: InternalChatUser[];
  unreadCount: number;
  lastMessage: {
    id: string;
    body: string;
    senderName: string;
    createdAt: Date;
    type: string;
    deleted: boolean;
  } | null;
}

export interface InternalReaction {
  conversationId: string;
  messageId: string;
  reactions: { userId: string; name: string; emoji: string }[];
}

export interface InternalConversationPatch {
  conversation: InternalConversation;
}

export interface InternalUnreadPatch {
  conversationId: string;
  unreadCount: number;
}
