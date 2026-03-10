import { TelegramUpdate } from '../types';

const API_BASE = "https://api.telegram.org/bot";
const FILE_BASE = "https://api.telegram.org/file/bot";

// Helper to create WAV header for raw PCM data
function getWavHeader(audioLength: number, sampleRate: number, channelCount: number = 1) {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF'); // ChunkID
  view.setUint32(4, 36 + audioLength, true); // ChunkSize
  writeString(view, 8, 'WAVE'); // Format
  writeString(view, 12, 'fmt '); // Subchunk1ID
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, channelCount, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2 * channelCount, true); // ByteRate
  view.setUint16(32, 2 * channelCount, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample
  writeString(view, 36, 'data'); // Subchunk2ID
  view.setUint32(40, audioLength, true); // Subchunk2Size

  return buffer;
}

export const TelegramService = {
  /**
   * Check bot status
   */
  async getMe(token: string) {
    try {
      const res = await fetch(`${API_BASE}${token}/getMe`);
      return await res.json();
    } catch (error) {
      console.error("Telegram API Error:", error);
      throw error;
    }
  },

  /**
   * Fetch updates (Long Polling)
   */
  async getUpdates(token: string, offset: number): Promise<{ ok: boolean, result: TelegramUpdate[] }> {
    try {
      // Timeout 10s for polling
      const res = await fetch(`${API_BASE}${token}/getUpdates?offset=${offset}&timeout=10`);
      if (!res.ok) return { ok: false, result: [] };
      return await res.json();
    } catch (error) {
      // Network errors are common in polling, return empty to retry
      return { ok: false, result: [] };
    }
  },

  /**
   * Send a Chat Action (e.g., typing, upload_photo)
   */
  async sendChatAction(token: string, chatId: number | string, action: 'typing' | 'upload_photo' | 'record_voice' | 'upload_voice') {
    try {
        await fetch(`${API_BASE}${token}/sendChatAction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, action: action })
        });
    } catch (error) {
        console.error("Chat Action Error:", error); 
    }
  },

  /**
   * Get File Path and Download content as Base64
   * Uses proxies with cache-busting to ensure fresh data.
   */
  async downloadFile(token: string, fileId: string): Promise<string | null> {
    try {
        const pathRes = await fetch(`${API_BASE}${token}/getFile?file_id=${fileId}`);
        const pathData = await pathRes.json();
        
        if (!pathData.ok || !pathData.result.file_path) {
            console.warn(`Telegram download failed for ${fileId}:`, pathData.description || "Unknown error");
            return null; 
        }

        const filePath = pathData.result.file_path;
        const fileUrl = `${FILE_BASE}${token}/${filePath}`;
        
        // Check if it's an image for optimized proxying
        const isImage = /\.(jpeg|jpg|png|webp)$/i.test(filePath);
        
        let blob: Blob | null = null;
        
        // --- Strategy 1: wsrv.nl (Images Only - Fast & Reliable) ---
        if (isImage) {
            try {
                // wsrv.nl is a robust image proxy. We request it as is.
                const wsrvUrl = `https://wsrv.nl/?url=${encodeURIComponent(fileUrl)}&output=png`; 
                const res = await fetch(wsrvUrl);
                if (res.ok) blob = await res.blob();
            } catch (e) { console.warn("wsrv failed", e); }
        }

        // --- Strategy 2: CodeTabs (General Purpose) ---
        if (!blob) {
             try {
                const proxyUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(fileUrl)}`;
                const res = await fetch(proxyUrl);
                if (res.ok) blob = await res.blob();
             } catch (e) { console.warn("CodeTabs failed", e); }
        }

        // --- Strategy 3: AllOrigins (Raw) ---
        if (!blob) {
            try {
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(fileUrl)}`;
                const res = await fetch(proxyUrl);
                if (res.ok) blob = await res.blob();
            } catch (e) { console.warn("AllOrigins failed", e); }
        }

        // --- Strategy 4: CorsProxy.io (Backup) ---
        if (!blob) {
            try {
                 const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(fileUrl)}`;
                 const res = await fetch(proxyUrl);
                 if (res.ok) blob = await res.blob();
            } catch (e) { console.warn("CorsProxy failed", e); }
        }

        if (!blob) throw new Error("All download strategies exhausted.");

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                if (!result) {
                    reject(new Error("Empty file reader result"));
                    return;
                }
                const base64 = result.split(',')[1]; 
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("Download File Error:", error);
        return null;
    }
  },

  /**
   * Send text message
   */
  async sendMessage(token: string, chatId: number | string, text: string) {
    try {
      const res = await fetch(`${API_BASE}${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML' })
      });
      const data = await res.json();
      
      // Fallback: If parsing fails (HTML error), try sending raw text
      if (!data.ok && (data.description?.includes('parse') || data.description?.includes('entity'))) {
         console.warn("HTML Parse failed, retrying with raw text.");
         const retryRes = await fetch(`${API_BASE}${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text }) // No parse_mode
         });
         return await retryRes.json();
      }
      return data;
    } catch (error) {
      console.error("Send Message Error:", error);
      throw error;
    }
  },

  /**
   * Edit text message (for Live Status)
   */
  async editMessageText(token: string, chatId: number | string, messageId: number, text: string) {
    try {
      const res = await fetch(`${API_BASE}${token}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text, parse_mode: 'HTML' })
      });
      return await res.json();
    } catch (error) {
      console.error("Edit Message Error:", error);
      throw error;
    }
  },

  /**
   * Send Sticker (Supports both ID and Blob Upload)
   */
  async sendSticker(token: string, chatId: number | string, sticker: string | Blob) {
    try {
      let body: any;
      let headers: any = {};

      if (typeof sticker === 'string') {
          // If it's a string, it's a file_id or URL
          body = JSON.stringify({ chat_id: chatId, sticker: sticker });
          headers = { 'Content-Type': 'application/json' };
      } else {
          // It's a Blob, we need FormData
          const formData = new FormData();
          formData.append('chat_id', String(chatId));
          formData.append('sticker', sticker, 'sticker.webp');
          body = formData;
          // Content-Type header is handled automatically by FormData
      }

      const res = await fetch(`${API_BASE}${token}/sendSticker`, {
        method: 'POST',
        headers: headers,
        body: body
      });
      
      const data = await res.json();
      if (!data.ok) {
          throw new Error(data.description || "Failed to send sticker");
      }
      return data;
    } catch (error) {
      console.error("Send Sticker Error:", error);
      throw error;
    }
  },

  /**
   * Send Photo
   */
  async sendPhoto(token: string, chatId: number | string, base64Data: string, caption?: string) {
    try {
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/png' });

      const formData = new FormData();
      formData.append('chat_id', String(chatId));
      formData.append('photo', blob, 'image.png');
      if (caption) formData.append('caption', caption);

      const res = await fetch(`${API_BASE}${token}/sendPhoto`, {
        method: 'POST',
        body: formData
      });
      return await res.json();
    } catch (error) {
      console.error("Send Photo Error:", error);
      throw error;
    }
  },

  /**
   * Send Audio (Handles RAW PCM by adding WAV Header)
   */
  async sendAudio(token: string, chatId: number | string, base64Data: string, caption?: string) {
    try {
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const pcmData = new Uint8Array(byteNumbers);
        
        // Generate WAV Header (24kHz is standard for Gemini Flash TTS)
        const wavHeader = getWavHeader(pcmData.length, 24000);
        
        // Concatenate Header + PCM
        const wavFile = new Uint8Array(wavHeader.byteLength + pcmData.length);
        wavFile.set(new Uint8Array(wavHeader), 0);
        wavFile.set(pcmData, wavHeader.byteLength);

        const blob = new Blob([wavFile], { type: 'audio/wav' });
  
        const formData = new FormData();
        formData.append('chat_id', String(chatId));
        formData.append('audio', blob, 'speech.wav'); 
        if (caption) formData.append('caption', caption);
        
        const res = await fetch(`${API_BASE}${token}/sendAudio`, {
          method: 'POST',
          body: formData
        });
        return await res.json();
      } catch (error) {
        console.error("Send Audio Error:", error);
        throw error;
      }
  }
};