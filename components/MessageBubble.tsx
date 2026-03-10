import React from 'react';
import { Message, MessageType } from '../types';
import { format } from 'date-fns';
import { Play, CheckCheck, Sticker, FileVideo } from 'lucide-react';

interface Props {
  message: Message;
}

const MessageBubble: React.FC<Props> = ({ message }) => {
  const isUser = message.sender === 'user';

  const renderContent = () => {
    switch (message.type) {
      case MessageType.IMAGE:
        return (
          <div className="max-w-sm rounded-lg overflow-hidden my-1">
            <img 
              src={`data:${message.metadata?.mimeType || 'image/png'};base64,${message.content}`} 
              alt="Generated" 
              className="w-full h-auto object-cover"
            />
          </div>
        );
      case MessageType.VIDEO:
        return (
          <div className="max-w-sm rounded-lg overflow-hidden bg-black my-1 border border-white/10">
             <video 
                controls 
                className="w-full h-auto max-h-[300px]" 
                src={`data:${message.metadata?.mimeType || 'video/mp4'};base64,${message.content}`}
             />
             <div className="p-2 flex items-center gap-2 text-xs text-gray-400">
                <FileVideo size={12} /> Video
             </div>
          </div>
        );
      case MessageType.AUDIO:
        return (
            <div className="flex items-center gap-3 p-2 min-w-[200px]">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-blue-600 transition shadow-lg"
                     onClick={() => {
                        const audio = new Audio(`data:${message.metadata?.mimeType || 'audio/mp3'};base64,${message.content}`);
                        audio.play();
                     }}>
                    <Play size={20} fill="white" className="ml-1" />
                </div>
                <div className="flex flex-col">
                    <span className="text-sm font-bold">Voice Message</span>
                    <span className="text-[10px] opacity-70">Tap to play</span>
                </div>
            </div>
        );
      case MessageType.STICKER:
        // If the content is long (base64) and we have a mimeType, display it as an image
        if (message.content.length > 100 && message.metadata?.mimeType) {
             return (
                 <div className="max-w-[150px] rounded-lg overflow-hidden my-1">
                    <img 
                      src={`data:${message.metadata.mimeType};base64,${message.content}`} 
                      alt="Sticker" 
                      className="w-full h-auto object-contain"
                    />
                 </div>
             );
        }
        // Fallback for ID-only stickers
        return (
             <div className="p-3 bg-white/10 rounded-lg flex items-center gap-3 min-w-[150px] border border-white/5">
                 <div className="p-2 bg-white/10 rounded-full">
                    <Sticker size={20} />
                 </div>
                 <div className="flex flex-col">
                    <span className="font-bold text-xs">Sticker Sent</span>
                    <span className="text-[10px] opacity-50 truncate max-w-[100px] font-mono">{message.content.substring(0, 15)}...</span>
                 </div>
             </div>
        );
      default:
        // Simple markdown parsing for code blocks
        if (message.content.includes("```")) {
            const parts = message.content.split("```");
            return (
                <div className="text-sm leading-relaxed whitespace-pre-wrap">
                    {parts.map((part, i) => {
                        if (i % 2 === 1) { // Code block
                            return (
                                <div key={i} className="bg-black/30 p-2 rounded my-1 font-mono text-xs text-green-400 overflow-x-auto border border-white/5">
                                    {part}
                                </div>
                            )
                        }
                        return <span key={i}>{part}</span>;
                    })}
                </div>
            )
        }
        return <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>;
    }
  };

  return (
    <div className={`flex w-full mb-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div 
        className={`relative max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-2 shadow-sm
          ${isUser 
            ? 'bg-[#2b5278] rounded-tr-sm text-white' 
            : 'bg-[#182533] rounded-tl-sm text-white'
          }
        `}
      >
        {/* Sender Name if Group context (simulated) */}
        {!isUser && (
            <div className="text-[#64b5ef] text-xs font-bold mb-1">
                {message.metadata?.senderName || 'ＡＩ Ahnn'}
            </div>
        )}

        {renderContent()}

        <div className="flex justify-end items-center gap-1 mt-1 opacity-60">
           <span className="text-[10px]">{format(new Date(message.timestamp), 'HH:mm')}</span>
           {isUser && <CheckCheck size={12} />}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;