export interface UserSession {
  id: string;
  token: string;
  username: string;
  botName?: string;
}

// Telegram Types
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramSticker {
  file_id: string;
  emoji?: string;
  set_name?: string;
  width: number;
  height: number;
  is_animated?: boolean;
  is_video?: boolean;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  sticker?: TelegramSticker;
  photo?: any[];
  voice?: { file_id: string; mime_type?: string; duration: number };
  audio?: { file_id: string; mime_type?: string; duration: number; title?: string };
  video?: { file_id: string; mime_type?: string; width: number; height: number; duration: number };
  video_note?: { file_id: string; duration: number };
  document?: { file_id: string; mime_type?: string; file_name?: string };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data: string;
  };
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  type: 'info' | 'incoming' | 'outgoing' | 'error';
  content: any; // Raw update or message
  summary: string;
}

// App Chat Types
export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  AUDIO = 'audio',
  VIDEO = 'video',
  STICKER = 'sticker',
  FILE = 'file'
}

export interface Message {
  id: string;
  chatId: string;
  sender: 'user' | 'bot' | string;
  content: string;
  timestamp: number | Date;
  type: MessageType;
  metadata?: {
    mimeType?: string;
    senderName?: string;
    [key: string]: any;
  };
}

export interface ChatSession {
  id: string;
  name: string;
  type: string;
  avatar?: string;
  systemInstruction?: string;
}