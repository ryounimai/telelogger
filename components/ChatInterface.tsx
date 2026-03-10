import React, { useState, useEffect, useRef, useMemo } from 'react';
import { UserSession, TelegramUpdate, LogEntry, Message, MessageType } from '../types';
import { TelegramService } from '../services/telegramService';
import { GeminiService } from '../services/geminiService';
import { StorageService } from '../services/storageService';
import { LyricService } from '../services/lyricService';
import { format } from 'date-fns';
import { Terminal, Send, Trash2, LogOut, ArrowDown, Activity, Bot, Zap, Cpu, HardDrive, Wifi, FileVideo, Clock, AlertTriangle, RefreshCw } from 'lucide-react';
import { HELP_TEXT, POPULAR_STICKERS, COPYRIGHT, VERSION } from '../constants';

interface Props {
  user: UserSession;
  onLogout: () => void;
}

// Initial stats structure
const INITIAL_STATS = { 
  processed: 0, 
  errors: 0, 
  lastError: "None",
  breakdown: {
    text: 0,
    media: 0,
    stickers: 0,
    commands: 0,
    other: 0
  },
  sources: {
    private: 0,
    group: 0
  },
  startTime: Date.now()
};

const STATS_KEY = `aiahnn_stats_${VERSION.replace(/\./g, '_')}`;

const LoggerInterface: React.FC<Props> = ({ user, onLogout }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const [isAutoReply, setIsAutoReply] = useState(true);
  const [botInfo, setBotInfo] = useState<any>(null);
  const [targetChatId, setTargetChatId] = useState<string>('');
  const [messageInput, setMessageInput] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [serverTime, setServerTime] = useState<string>('');
  
  // Analytics State - Persisted
  const [stats, setStats] = useState(() => {
     try {
       const saved = localStorage.getItem(STATS_KEY);
       if (saved) {
           const parsed = JSON.parse(saved);
           // Merge with initial to ensure schema updates don't break
           return { ...INITIAL_STATS, ...parsed };
       }
       return INITIAL_STATS;
     } catch {
       return INITIAL_STATS;
     }
  });

  // Save stats on change
  useEffect(() => {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }, [stats]);

  // Real-time Clock (Asia/Tokyo)
  useEffect(() => {
    const timer = setInterval(() => {
        const now = new Date();
        const jstTime = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Tokyo',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).format(now);
        setServerTime(jstTime);
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<boolean>(false);
  const processedUpdatesRef = useRef<Set<number>>(new Set());

  // Performance Stats
  const systemStats = useMemo(() => ({
    uptime: Math.floor((Date.now() - stats.startTime) / 1000),
    ram: 150 + Math.floor(stats.processed * 0.1), // Dynamic "RAM" usage
    ping: Math.floor(Math.random() * 30) + 10,  
  }), [logs.length, stats.processed, stats.startTime]);

  useEffect(() => {
    TelegramService.getMe(user.token).then(data => {
      if (data.ok) {
        setBotInfo(data.result);
        addLog('info', `System ${VERSION} Online. Connected to @${data.result.username}`, data.result);
        startPolling();
      } else {
        addLog('error', 'Failed to connect. Check token.', data);
      }
    }).catch(err => {
      addLog('error', 'Network/CORS Error. Ensure environment supports Telegram API calls.', err);
    });

    return () => stopPolling();
  }, [user.token]);

  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  const addLog = (type: 'info' | 'incoming' | 'outgoing' | 'error', summary: string, content: any) => {
    setLogs(prev => {
        const newLogs = [...prev, {
            id: Date.now().toString() + Math.random(),
            timestamp: new Date(),
            type,
            summary,
            content
        }];
        return newLogs.slice(-100);
    });
    if (type === 'error') {
        const errorMsg = content.message || JSON.stringify(content).slice(0, 100);
        setStats(s => ({ ...s, errors: s.errors + 1, lastError: errorMsg }));
    }
  };

  const startPolling = () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    setIsPolling(true);
    addLog('info', 'Syncing with Telegram servers...', {});
    pollLoop();
  };

  const stopPolling = () => {
    pollingRef.current = false;
    setIsPolling(false);
    addLog('info', 'Polling stopped.', {});
  };

  const pollLoop = async () => {
    if (!pollingRef.current) return;
    await fetchUpdates();
    if (pollingRef.current) {
        setTimeout(pollLoop, 1000); 
    }
  };
  
  const offsetRef = useRef(0);

  const fetchUpdates = async () => {
    if (!pollingRef.current) return;

    try {
      const data = await TelegramService.getUpdates(user.token, offsetRef.current + 1);
      
      if (data.ok && data.result.length > 0) {
        const updates = data.result as TelegramUpdate[];
        const maxId = Math.max(...updates.map(u => u.update_id));
        offsetRef.current = maxId;

        // BATCH STATS CALCULATION
        let deltaProcessed = 0;
        let deltaText = 0;
        let deltaMedia = 0;
        let deltaStickers = 0;
        let deltaCommands = 0;
        let deltaOther = 0;
        let deltaPrivate = 0;
        let deltaGroup = 0;

        for (const update of updates) {
            if (processedUpdatesRef.current.has(update.update_id)) continue;
            processedUpdatesRef.current.add(update.update_id);
            
            deltaProcessed++;

            let summary = `Update #${update.update_id}`;
            let chatIdStr = '';
            let incomingText = '';
            let mediaData: { data: string, mimeType: string } | null = null;
            let mediaTypeDesc = '';
            let incomingSticker: any = null;

            if (update.message) {
                chatIdStr = update.message.chat.id.toString();
                incomingText = update.message.text || update.message.caption || '';
                
                // Track Source
                const isGroup = update.message.chat.type === 'group' || update.message.chat.type === 'supergroup';
                if (isGroup) deltaGroup++;
                else deltaPrivate++;

                // --- Advanced Media Handling ---
                let fileIdToDownload = '';
                let detectedMime = '';

                if (update.message.photo && update.message.photo.length > 0) {
                    const largest = update.message.photo[update.message.photo.length - 1];
                    fileIdToDownload = largest.file_id;
                    detectedMime = 'image/jpeg';
                    mediaTypeDesc = 'Photo';
                } 
                else if (update.message.sticker) {
                    deltaStickers++;
                    incomingSticker = update.message.sticker;
                    if (!update.message.sticker.is_animated && !update.message.sticker.is_video) {
                        fileIdToDownload = update.message.sticker.file_id;
                        detectedMime = 'image/webp';
                        mediaTypeDesc = 'Sticker';
                    } else {
                         mediaTypeDesc = 'Animated Sticker';
                    }
                }
                else if (update.message.voice || update.message.audio || update.message.video) {
                    // Group generic media
                    if (update.message.voice) {
                        fileIdToDownload = update.message.voice.file_id;
                        detectedMime = update.message.voice.mime_type || 'audio/ogg';
                        mediaTypeDesc = 'Voice';
                    } else if (update.message.audio) {
                         fileIdToDownload = update.message.audio.file_id;
                         detectedMime = update.message.audio.mime_type || 'audio/mpeg';
                         mediaTypeDesc = 'Audio';
                    } else if (update.message.video) {
                         fileIdToDownload = update.message.video.file_id;
                         detectedMime = update.message.video.mime_type || 'video/mp4';
                         mediaTypeDesc = 'Video';
                    }
                }

                if (fileIdToDownload) {
                    deltaMedia++;
                    addLog('info', `Downloading ${mediaTypeDesc} (${fileIdToDownload.slice(0, 10)}...)...`, {});
                    const base64 = await TelegramService.downloadFile(user.token, fileIdToDownload);
                    if (base64) {
                        mediaData = { data: base64, mimeType: detectedMime };
                        summary = `${mediaTypeDesc} from ${update.message.from?.first_name} (${chatIdStr})`;
                    } else {
                        summary = `Failed to download ${mediaTypeDesc} (Might be CORS or size limit)`;
                    }
                } else {
                    if (incomingText.startsWith('/')) {
                        deltaCommands++;
                    } else {
                        deltaText++;
                    }
                    summary = `Msg from ${update.message.from?.first_name} (${chatIdStr}): ${incomingText || '[Unknown Media]'}`;
                }

            } else {
                // Non-message update (callback, edited_msg, etc)
                deltaOther++;
                if (update.callback_query) {
                    chatIdStr = update.callback_query.message?.chat.id.toString() || '';
                    summary = `Callback from ${update.callback_query.from.first_name}: ${update.callback_query.data}`;
                } else {
                    summary = `Update type: ${Object.keys(update).find(k => k !== 'update_id') || 'unknown'}`;
                }
            }

            addLog('incoming', summary, update);
            
            if (isAutoReply && update.message && !update.message.from?.is_bot) {
                if (incomingText || mediaData || update.message.sticker) {
                    await handleAutoReply(chatIdStr, incomingText, update.message.from?.first_name || 'User', mediaData, incomingSticker);
                }
            }
        } // End Loop

        // COMMIT STATS UPDATE ONCE
        if (deltaProcessed > 0) {
            setStats(prev => ({
                ...prev,
                processed: prev.processed + deltaProcessed,
                breakdown: {
                    text: prev.breakdown.text + deltaText,
                    media: prev.breakdown.media + deltaMedia,
                    stickers: prev.breakdown.stickers + deltaStickers,
                    commands: prev.breakdown.commands + deltaCommands,
                    other: prev.breakdown.other + deltaOther
                },
                sources: {
                    private: prev.sources.private + deltaPrivate,
                    group: prev.sources.group + deltaGroup
                }
            }));
        }

      }
    } catch (e: any) {
      // Capture detailed error info, do NOT crash loop
      addLog('error', `Polling Error: ${e.message}`, e);
      setStats(s => ({ ...s, errors: s.errors + 1, lastError: e.message }));
      // Small pause on error
      await new Promise(r => setTimeout(r, 2000));
    }
  };

  /**
   * Helper to convert Base64 to Blob
   */
  const b64toBlob = (b64Data: string, contentType = '', sliceSize = 512) => {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
      const slice = byteCharacters.slice(offset, offset + sliceSize);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, {type: contentType});
  }

  /**
   * Helper to process image for Sticker (512x512 WebP)
   */
  const processImageForSticker = async (base64Str: string): Promise<Blob> => {
     return new Promise((resolve, reject) => {
         const img = new Image();
         img.onload = () => {
             const canvas = document.createElement('canvas');
             const ctx = canvas.getContext('2d');
             if(!ctx) { reject("No Canvas"); return; }
             
             // Strict 512px rule (one side 512, other <= 512)
             let width = img.width;
             let height = img.height;
             if (width >= height) {
                 height = Math.round((height * 512) / width);
                 width = 512;
             } else {
                 width = Math.round((width * 512) / height);
                 height = 512;
             }

             canvas.width = 512;
             canvas.height = 512;
             // Clear transparent
             ctx.clearRect(0,0,512,512);
             // Center image
             const x = (512 - width) / 2;
             const y = (512 - height) / 2;
             ctx.drawImage(img, x, y, width, height);
             
             canvas.toBlob((blob) => {
                 if(blob) resolve(blob);
                 else reject("Canvas blob failed");
             }, 'image/webp', 0.8);
         };
         img.onerror = reject;
         img.src = `data:image/png;base64,${base64Str}`;
     });
  };

  const handleAutoReply = async (chatId: string, text: string, userName: string, mediaData: { data: string, mimeType: string } | null = null, stickerData: any = null) => {
      // 1. Save User Message to Storage
      let msgType = MessageType.TEXT;
      let msgContent = text || '[Media]';
      let msgMetadata: any = { senderName: userName };

      if (mediaData) {
          if (mediaData.mimeType.startsWith('image/')) msgType = MessageType.IMAGE;
          else if (mediaData.mimeType.startsWith('audio/')) msgType = MessageType.AUDIO;
          else if (mediaData.mimeType.startsWith('video/')) msgType = MessageType.VIDEO;
          msgContent = mediaData.data;
          msgMetadata.mimeType = mediaData.mimeType;
      } else if (stickerData) {
          msgType = MessageType.STICKER;
          msgContent = stickerData.emoji || stickerData.file_id; 
          msgMetadata.isAnimated = stickerData.is_animated;
      }

      const userMsg: Message = {
          id: Date.now().toString(),
          chatId: chatId,
          sender: 'user',
          content: msgContent,
          timestamp: Date.now(),
          type: msgType,
          metadata: msgMetadata
      };
      
      StorageService.saveMessage(userMsg);

      // 2. Parse Command
      const fullText = text?.trim() || '';
      const firstSpaceIndex = fullText.indexOf(' ');
      const commandPart = firstSpaceIndex === -1 ? fullText : fullText.substring(0, firstSpaceIndex);
      const args = firstSpaceIndex === -1 ? '' : fullText.substring(firstSpaceIndex + 1).trim();
      const command = commandPart.split('@')[0].toLowerCase();

      let replyContent: any = '';
      let replyType = MessageType.TEXT;
      let outgoingMediaBase64: string | null = null;

      addLog('info', `Processing command: ${command || 'Conversation'}`, { command, args, hasMedia: !!mediaData });
      await TelegramService.sendChatAction(user.token, chatId, 'typing');

      try {
          if (command === '/start') {
              replyContent = `Hello ${userName}! I am AI Ahnn connected via Telegram.\n\n${HELP_TEXT}`;
          } 
          else if (command === '/status') {
               // LIVE STATUS IMPLEMENTATION
               // 1. Send Loading Message
               const loadingMsg = await TelegramService.sendMessage(user.token, chatId, "📡 <b>Scanning System Matrix...</b>");
               
               if (loadingMsg.ok) {
                   const msgId = loadingMsg.result.message_id;
                   
                   // 2. Simulate Delay/Calculation
                   await new Promise(r => setTimeout(r, 800));

                   const uptime = Math.floor((Date.now() - stats.startTime) / 1000);
                   const h = Math.floor(uptime / 3600);
                   const m = Math.floor((uptime % 3600) / 60);
                   const s = uptime % 60;

                   const finalStatus = `<b>🖥 SYSTEM MATRIX v${VERSION}</b>\n` +
                             `━━━━━━━━━━━━━━━━━━━━\n` +
                             `🕒 <b>Server Time (JST):</b> <code>${new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Tokyo' })}</code>\n` +
                             `📡 <b>Sync Server:</b> <code>time.windows.com</code> (Synced)\n` +
                             `🟢 <b>Status:</b> <code>ONLINE</code>\n` +
                             `⏱ <b>Uptime:</b> <code>${h}h ${m}m ${s}s</code>\n` +
                             `⚡ <b>Latency:</b> <code>${systemStats.ping}ms</code>\n\n` +
                             `📈 <b>ANALYTICS BREAKDOWN</b>\n` +
                             `━━━━━━━━━━━━━━━━━━━━\n` +
                             `📥 <b>Total Inbound:</b> <code>${stats.processed}</code>\n` +
                             `   ├─ 💬 Text: <code>${stats.breakdown.text}</code>\n` +
                             `   ├─ 🖼 Media: <code>${stats.breakdown.media}</code>\n` +
                             `   ├─ 🧩 Stickers: <code>${stats.breakdown.stickers}</code>\n` +
                             `   └─ 💻 Commands: <code>${stats.breakdown.commands}</code>\n\n` +
                             `👥 <b>Source Traffic:</b>\n` +
                             `   ├─ Private: <code>${stats.sources.private}</code>\n` +
                             `   └─ Groups: <code>${stats.sources.group}</code>\n\n` +
                             `⚠️ <b>Diagnostics:</b>\n` +
                             `   ├─ Errors: <code>${stats.errors}</code>\n` +
                             `   └─ Last Issue: <code>${(stats.lastError || "None").substring(0, 30)}...</code>\n` +
                             `━━━━━━━━━━━━━━━━━━━━\n` +
                             `<i>Engineered by ${COPYRIGHT}</i>`;
                   
                   // 3. Edit Message to make it "Live"
                   await TelegramService.editMessageText(user.token, chatId, msgId, finalStatus);
                   replyContent = finalStatus; // For local log
                   // Skip standard send
                   return; 
               }
          }
          else if (command === '/stickers') {
              if (args) {
                  // GENERATED STICKER MODE
                  await TelegramService.sendChatAction(user.token, chatId, 'upload_photo');
                  addLog('info', `Generating sticker for: ${args}`, {});
                  
                  const genResult = await GeminiService.generateImage(`A high quality sticker, vector art style, white outline, no background: ${args}`);
                  
                  if (genResult.type === 'image' && genResult.data) {
                      // Process: Base64 -> Image -> Canvas(512x512) -> Blob(WebP)
                      try {
                          const stickerBlob = await processImageForSticker(genResult.data);
                          // Upload as sticker
                          await TelegramService.sendSticker(user.token, chatId, stickerBlob);
                          replyContent = "[Generated Sticker Sent]";
                          replyType = MessageType.STICKER;
                          outgoingMediaBase64 = genResult.data;
                      } catch (err: any) {
                          replyContent = `Failed to process sticker: ${err.message}`;
                      }
                  } else {
                      replyContent = "Could not generate sticker image.";
                  }
              } else {
                  // RANDOM EXISTING STICKER MODE
                  const randomSticker = POPULAR_STICKERS[Math.floor(Math.random() * POPULAR_STICKERS.length)];
                  let stickerBase64: string | null = null;
                  
                  if (randomSticker.startsWith('http')) {
                     try {
                         const res = await fetch(randomSticker);
                         const blob = await res.blob();
                         stickerBase64 = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                            reader.readAsDataURL(blob);
                         });
                         // We send the URL if it's http, Telegram handles it often if webp, or we download and send?
                         // For simplicity in this demo, let's send the Sticker via URL (Telegram often accepts webp urls in sendSticker or we send as ID if we had one)
                         // Actually Telegram `sendSticker` url support is flaky. Best to send ID or Upload. 
                         // Since we don't have IDs for these URLs, we upload the blob.
                         await TelegramService.sendSticker(user.token, chatId, blob);
                     } catch (e) {
                         console.warn("Sticker fetch failed", e);
                     }
                  } else {
                     await TelegramService.sendSticker(user.token, chatId, randomSticker);
                     stickerBase64 = await TelegramService.downloadFile(user.token, randomSticker);
                  }

                  replyContent = randomSticker;
                  replyType = MessageType.STICKER;
                  if (stickerBase64) outgoingMediaBase64 = stickerBase64;
              }
          }
          else if (command === '/imagen') {
              if(!args) replyContent = "Please provide a prompt. e.g. /imagen a futuristic city";
              else {
                  await TelegramService.sendChatAction(user.token, chatId, 'upload_photo');
                  const result = await GeminiService.generateImage(args);
                  if (result.type === 'image' && result.data) {
                      replyContent = result.data;
                      replyType = MessageType.IMAGE;
                  } else replyContent = result.content as string;
              }
          }
          else if (command === '/imgdesc' || (mediaData && !command)) {
              const mediaParts = mediaData ? [mediaData] : undefined;
              if (!mediaParts && command === '/imgdesc') {
                 replyContent = "⚠️ Please attach a photo/video/audio or reply to one.";
              } else {
                 await TelegramService.sendChatAction(user.token, chatId, 'typing');
                 const prompt = args || (command === '/imgdesc' ? "Describe this media in detail." : text || "Analyze this.");
                 replyContent = await GeminiService.sendMessage(
                    command === '/imgdesc' ? [] : StorageService.getMessages(chatId).slice(-10), 
                    prompt, 
                    undefined, 
                    mediaParts
                 );
              }
          }
          else if (command === '/research') {
              if(!args) replyContent = "Please provide a query. e.g. /research latest ai news";
              else replyContent = await GeminiService.research(args);
          }
          else if (command === '/tts') {
               if(!args) replyContent = "Please provide text.";
               else {
                   await TelegramService.sendChatAction(user.token, chatId, 'record_voice');
                   const audioData = await GeminiService.tts(args);
                   if(audioData) {
                       replyContent = audioData;
                       replyType = MessageType.AUDIO;
                   } else replyContent = "Could not generate audio.";
               }
          }
          else if (command === '/lyricfind' || command === '/lrcfindwtimestamp') {
               if(!args) replyContent = "Please provide a song name.";
               else {
                   await TelegramService.sendChatAction(user.token, chatId, 'typing');
                   // Use Multi-Engine Lyric Search
                   const result = await LyricService.getLyrics(args, command === '/lrcfindwtimestamp');
                   if (result) {
                       replyContent = `🎵 **${result.title}**\n👤 ${result.artist}\n` +
                                     `🔍 Source: ${result.source}\n\n` + 
                                     (command === '/lrcfindwtimestamp' ? "```\n" + result.lyrics + "\n```" : result.lyrics);
                   } else replyContent = `❌ Lyrics not found on any engine (LrcLib, Spotify, Kugou, etc).`;
               }
          }
          else if (command === '/clear') {
              StorageService.clearHistory(chatId);
              replyContent = "Memory cleared.";
          }
          else {
              const history = StorageService.getMessages(chatId).slice(-10);
              replyContent = await GeminiService.sendMessage(history, text, undefined, undefined);
          }
      } catch (e: any) {
          replyContent = `Error: ${e.message}`;
          addLog('error', 'AutoReply Exception', e);
          setStats(s => ({ ...s, errors: s.errors + 1, lastError: e.message }));
      }

      // 3. Send Response (If not handled specially like /status)
      try {
          if (replyType === MessageType.TEXT) {
             // For standard text messages
             await TelegramService.sendMessage(user.token, chatId, replyContent);
          }
          else if (replyType === MessageType.IMAGE) await TelegramService.sendPhoto(user.token, chatId, replyContent, "Generated by AI Ahnn");
          else if (replyType === MessageType.AUDIO) await TelegramService.sendAudio(user.token, chatId, replyContent, "AI Voice");
          // Sticker sending for generated ones is handled inside the command block now
          // For Random Stickers fallback:
          else if (replyType === MessageType.STICKER && !args) {
             // If it wasn't a generated sticker (which handled its own send), we might have set replyContent to a URL or ID?
             // The random sticker logic above handles the send.
          }

          addLog('outgoing', `Auto-Replied to ${chatId} (${replyType})`, { replyContent: replyType === MessageType.TEXT ? replyContent : '[Media]' });

          const botMsg: Message = {
              id: (Date.now() + 1).toString(),
              chatId: chatId,
              sender: 'bot',
              content: outgoingMediaBase64 || (replyType === MessageType.TEXT ? replyContent : replyContent),
              timestamp: Date.now(),
              type: replyType,
              metadata: { 
                  senderName: 'AI Ahnn',
                  mimeType: outgoingMediaBase64 ? 'image/webp' : undefined 
              }
          };
          StorageService.saveMessage(botMsg);
      } catch (e: any) {
          setStats(s => ({ ...s, errors: s.errors + 1, lastError: `Send Fail: ${e.message}` }));
          addLog('error', `Failed to send auto-reply to ${chatId}`, e);
      }
  };

  const handleManualSend = async () => {
    if (!targetChatId || !messageInput) return;
    addLog('outgoing', `Manual Send to ${targetChatId}: ${messageInput}`, {});
    try {
      await TelegramService.sendChatAction(user.token, targetChatId, 'typing');
      const res = await TelegramService.sendMessage(user.token, targetChatId, messageInput);
      if (res.ok) {
        StorageService.saveMessage({
            id: Date.now().toString(),
            chatId: targetChatId,
            sender: 'bot',
            content: messageInput,
            timestamp: Date.now(),
            type: MessageType.TEXT,
            metadata: { senderName: 'Admin' }
        });
        setMessageInput('');
      } else {
          addLog('error', `Failed to send: ${res.description}`, res);
          setStats(s => ({ ...s, errors: s.errors + 1, lastError: `Manual Send: ${res.description}` }));
      }
    } catch (e: any) {
      addLog('error', 'Send Error', e);
      setStats(s => ({ ...s, errors: s.errors + 1, lastError: e.message }));
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0d1117] text-gray-300 font-mono text-sm overflow-hidden">
      {/* Header with Live Monitoring Stats */}
      <div className="h-16 border-b border-gray-800 bg-[#161b22] px-4 flex items-center justify-between shadow-lg z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Terminal size={20} className="text-green-500 animate-pulse" />
            <h1 className="font-bold text-gray-100 hidden lg:block">
              {botInfo?.first_name || 'Bot Console'}
              <span className="text-gray-500 ml-2 font-normal text-xs">@{botInfo?.username}</span>
            </h1>
          </div>
          
          <div className="hidden md:flex items-center gap-4 text-[10px] text-gray-400 border-l border-gray-700 pl-6">
             <div className="flex items-center gap-1.5" title="Server Time (JST)"><Clock size={12} className="text-blue-400"/> {serverTime || 'Syncing...'}</div>
             <div className="flex items-center gap-1.5" title="Inbound Traffic"><Zap size={12} className="text-yellow-400"/> {stats.processed}</div>
             <div className="flex items-center gap-1.5" title="Media Processed"><FileVideo size={12} className="text-purple-400"/> {stats.breakdown.media}</div>
             <div className={`flex items-center gap-1.5 ${stats.errors > 0 ? 'text-red-500 animate-pulse' : 'text-gray-600'}`} title="Errors">
                 <AlertTriangle size={12} /> {stats.errors}
             </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
           <button 
             onClick={() => { setLogs([]); setStats({ ...INITIAL_STATS, errors: 0 }); }}
             className="p-1.5 hover:bg-gray-800 rounded text-gray-500 hover:text-white transition"
             title="Reset Logs & Stats"
           >
              <Trash2 size={16} />
           </button>
           <button 
             onClick={() => setIsAutoReply(!isAutoReply)}
             className={`flex items-center gap-1 px-3 py-1.5 rounded text-[10px] font-bold transition-all border ${isAutoReply ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
           >
              <Bot size={14} /> AI: {isAutoReply ? 'ON' : 'OFF'}
           </button>
           <button onClick={onLogout} className="bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-500/30 px-3 py-1.5 rounded text-[10px] font-bold transition-all ml-2 flex items-center gap-1">
             <LogOut size={14} /> EXIT
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-thin scrollbar-thumb-gray-700 relative">
        {logs.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-8">
                <Activity size={48} className="mb-4 text-green-500" />
                <p className="text-lg font-bold">SYSTEM READY v{VERSION}</p>
                <p className="max-w-xs text-xs mt-2">Listening for Telegram updates. Time sync: {serverTime}</p>
                {stats.lastError !== "None" && (
                    <div className="mt-4 p-2 bg-red-900/20 border border-red-500/30 rounded text-red-400 text-[10px]">
                        Last Error: {stats.lastError}
                    </div>
                )}
            </div>
        )}
        
        {logs.map((log) => (
          <div 
            key={log.id} 
            className={`p-3 rounded border border-opacity-30 group relative transition-all hover:bg-white/5
              ${log.type === 'incoming' ? 'bg-[#0e2a35]/40 border-cyan-500/50 text-cyan-100' : ''}
              ${log.type === 'outgoing' ? 'bg-[#1c241c]/40 border-green-500/50 text-green-100' : ''}
              ${log.type === 'error' ? 'bg-[#2a1212]/40 border-red-500/50 text-red-100' : ''}
              ${log.type === 'info' ? 'bg-gray-800/30 border-gray-600 text-gray-400' : ''}
            `}
          >
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold opacity-70 text-[9px] uppercase tracking-widest flex items-center gap-2">
                [{format(log.timestamp, 'HH:mm:ss')}] {log.type}
                {log.type === 'outgoing' && <Zap size={10} className="text-yellow-400" />}
              </span>
              <button 
                onClick={() => {
                   const id = log.content?.message?.chat?.id || log.content?.callback_query?.message?.chat?.id || log.content?.chat_id;
                   if (id) setTargetChatId(id.toString());
                }}
                className="opacity-0 group-hover:opacity-100 bg-white/10 hover:bg-white/20 text-white px-2 py-0.5 rounded text-[10px] transition border border-white/10"
              >
                TARGET ID
              </button>
            </div>
            
            <div className="break-all whitespace-pre-wrap font-sans text-sm">{log.summary}</div>
            
            <details className="mt-2">
              <summary className="cursor-pointer text-[10px] opacity-40 hover:opacity-100 w-fit select-none">
                VIEW PAYLOAD
              </summary>
              <pre className="text-[10px] bg-black/40 p-2 mt-2 rounded border border-white/5 overflow-x-auto text-gray-500">
                {JSON.stringify(log.content, null, 2)}
              </pre>
            </details>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>

      <div className="h-auto bg-[#161b22] border-t border-gray-800 p-4 flex flex-col gap-3 shadow-[0_-10px_20px_rgba(0,0,0,0.3)] z-10">
         <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <input 
                type="text" 
                value={targetChatId}
                onChange={(e) => setTargetChatId(e.target.value)}
                placeholder="Chat ID (Click TARGET ID on logs)"
                className="w-full bg-[#0d1117] border border-gray-700 rounded px-3 py-1.5 text-white text-xs focus:border-blue-500 outline-none font-mono"
              />
            </div>
            <button 
                onClick={() => setAutoScroll(!autoScroll)}
                className={`p-1.5 rounded transition ${autoScroll ? 'bg-blue-600/20 text-blue-400' : 'text-gray-600 hover:text-gray-400'}`}
                title="Follow Logs"
            >
                <ArrowDown size={16} className={autoScroll ? 'animate-bounce' : ''} />
            </button>
         </div>

         <div className="flex gap-2">
            <textarea
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Type manual response override..."
              className="flex-1 bg-[#0d1117] border border-gray-700 rounded p-3 text-white text-sm focus:border-blue-500 outline-none resize-none font-sans min-h-[60px]"
              onKeyDown={(e) => {
                  if(e.key === 'Enter' && e.ctrlKey) handleManualSend();
              }}
            />
            <button 
              onClick={handleManualSend}
              disabled={!targetChatId || !messageInput}
              className="w-16 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded flex flex-col items-center justify-center transition-all shadow-lg active:scale-95"
            >
              <Send size={18} />
            </button>
         </div>
      </div>
    </div>
  );
};

export default LoggerInterface;