import { ChatSession, Message, UserSession } from '../types';
import { DEFAULT_CHATS } from '../constants';

const KEYS = {
  SESSIONS: 'aiahnn_sessions',
  CURRENT_SESSION_ID: 'aiahnn_current_session_id',
  CHATS: 'aiahnn_chats',
  MESSAGES: 'aiahnn_messages',
};

export const StorageService = {
  getSessions: (): UserSession[] => {
    const data = localStorage.getItem(KEYS.SESSIONS);
    return data ? JSON.parse(data) : [];
  },

  getCurrentSession: (): UserSession | null => {
    const sessions = StorageService.getSessions();
    const currentId = localStorage.getItem(KEYS.CURRENT_SESSION_ID);
    return sessions.find(s => s.id === currentId) || null;
  },

  login: (token: string, username: string, botName: string) => {
    const sessions = StorageService.getSessions();
    const sessionId = btoa(token).slice(0, 16);
    
    const newSession: UserSession = { id: sessionId, token, username, botName };
    
    // Check if exists
    const existingIndex = sessions.findIndex(s => s.token === token);
    if (existingIndex > -1) {
      sessions[existingIndex] = newSession;
    } else {
      sessions.push(newSession);
    }
    
    localStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
    localStorage.setItem(KEYS.CURRENT_SESSION_ID, sessionId);
    
    // Initialize default chats if empty
    if (!localStorage.getItem(KEYS.CHATS)) {
      localStorage.setItem(KEYS.CHATS, JSON.stringify(DEFAULT_CHATS));
    }
    return newSession;
  },

  selectSession: (sessionId: string) => {
    localStorage.setItem(KEYS.CURRENT_SESSION_ID, sessionId);
  },

  logout: (sessionId?: string) => {
    if (sessionId) {
      const sessions = StorageService.getSessions().filter(s => s.id !== sessionId);
      localStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
      if (localStorage.getItem(KEYS.CURRENT_SESSION_ID) === sessionId) {
        localStorage.removeItem(KEYS.CURRENT_SESSION_ID);
      }
    } else {
      localStorage.removeItem(KEYS.CURRENT_SESSION_ID);
    }
  },

  getUser: (): UserSession | null => {
    return StorageService.getCurrentSession();
  },

  getChats: (): ChatSession[] => {
    const data = localStorage.getItem(KEYS.CHATS);
    return data ? JSON.parse(data) : DEFAULT_CHATS;
  },

  saveChats: (chats: ChatSession[]) => {
    localStorage.setItem(KEYS.CHATS, JSON.stringify(chats));
  },

  getMessages: (chatId: string): Message[] => {
    const allMessages = JSON.parse(localStorage.getItem(KEYS.MESSAGES) || '{}');
    return allMessages[chatId] || [];
  },

  saveMessage: (message: Message) => {
    const allMessages = JSON.parse(localStorage.getItem(KEYS.MESSAGES) || '{}');
    const chatMsgs = allMessages[message.chatId] || [];
    chatMsgs.push(message);
    allMessages[message.chatId] = chatMsgs;
    localStorage.setItem(KEYS.MESSAGES, JSON.stringify(allMessages));
  },

  clearHistory: (chatId: string) => {
    const allMessages = JSON.parse(localStorage.getItem(KEYS.MESSAGES) || '{}');
    allMessages[chatId] = [];
    localStorage.setItem(KEYS.MESSAGES, JSON.stringify(allMessages));
  },

  clearAll: () => {
     localStorage.removeItem(KEYS.MESSAGES);
     localStorage.removeItem(KEYS.CHATS);
  },
  
  updateSystemInstruction: (chatId: string, instruction: string) => {
    const chats = StorageService.getChats();
    const updated = chats.map(c => c.id === chatId ? { ...c, systemInstruction: instruction } : c);
    StorageService.saveChats(updated);
  }
};