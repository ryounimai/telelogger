import { GoogleGenAI, Modality, Type } from "@google/genai";
import { Message, MessageType } from "../types";

const API_KEY = process.env.API_KEY || '';

const ai = new GoogleGenAI({ apiKey: API_KEY });

export const GeminiService = {
  
  async sendMessage(
    chatHistory: Message[], 
    userPrompt: string, 
    systemInstruction?: string, 
    mediaParts?: { data: string; mimeType: string }[]
  ) {
    if (!API_KEY) throw new Error("API Key missing. Please check .env or environment variables.");

    // 1. Prepare History
    let historyToProcess = [...chatHistory];

    // Deduplicate last message if identical to current prompt
    if (historyToProcess.length > 0) {
        const lastMsg = historyToProcess[historyToProcess.length - 1];
        if (lastMsg.sender === 'user' && lastMsg.content === userPrompt) {
            historyToProcess.pop();
        }
    }

    // Map to API format
    let hasMedia = false;
    let historyForModel = historyToProcess.map(msg => {
      const isMedia = msg.type === MessageType.IMAGE || msg.type === MessageType.AUDIO || msg.type === MessageType.VIDEO;
      if (isMedia) hasMedia = true;

      const parts: any[] = [];
      if (isMedia && msg.content && msg.metadata?.mimeType) {
          parts.push({ 
              inlineData: { 
                  data: msg.content, 
                  mimeType: msg.metadata.mimeType 
              } 
          });
      }
      
      if (msg.type === MessageType.TEXT && msg.content) {
          parts.push({ text: msg.content });
      }

      return {
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: parts
      };
    });

    // FILTER: Remove turns with no valid parts
    historyForModel = historyForModel.filter(turn => {
        if (!turn.parts || turn.parts.length === 0) return false;
        // Verify text parts are not empty strings
        const textPart = turn.parts.find((p: any) => p.text !== undefined);
        if (textPart && !textPart.text.trim()) {
            // If it ONLY has empty text and no other parts, drop it
            if (turn.parts.length === 1) return false;
        }
        return true;
    });

    // MERGE: Consecutive roles must be merged
    const mergedHistory: any[] = [];
    for (const turn of historyForModel) {
        if (mergedHistory.length === 0) {
            mergedHistory.push(turn);
        } else {
            const last = mergedHistory[mergedHistory.length - 1];
            if (last.role === turn.role) {
                last.parts = [...last.parts, ...turn.parts];
            } else {
                mergedHistory.push(turn);
            }
        }
    }

    // Prepare current turn parts
    const currentParts: any[] = [];
    
    // Media goes first
    if (mediaParts && mediaParts.length > 0) {
       mediaParts.forEach(media => {
           currentParts.push({
               inlineData: {
                   data: media.data,
                   mimeType: media.mimeType
               }
           });
       });
    }

    // Text second
    if (userPrompt && userPrompt.trim()) {
        currentParts.push({ text: userPrompt });
    }
    
    // Safety Fallback if empty
    if (currentParts.length === 0) {
        currentParts.push({ text: "Analyze the previous context." }); 
    }

    // Add current turn to history (or merge if last was user)
    if (mergedHistory.length > 0 && mergedHistory[mergedHistory.length - 1].role === 'user') {
        const last = mergedHistory[mergedHistory.length - 1];
        last.parts = [...last.parts, ...currentParts];
    } else {
        mergedHistory.push({ role: 'user', parts: currentParts });
    }

    // Model Selection
    // 'gemini-2.5-flash-image' is capable of image/text inputs.
    // 'gemini-3-flash-preview' is optimized for text/reasoning.
    const useVisionModel = hasMedia || (mediaParts && mediaParts.length > 0);
    const model = useVisionModel ? 'gemini-2.5-flash-image' : 'gemini-3-flash-preview'; 

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: mergedHistory,
            config: {
                systemInstruction: systemInstruction || undefined,
            }
        });
        return response.text || "I processed that, but have no text response.";
    } catch (error: any) {
        console.error("Gemini Chat Error:", error);
        return `⚠️ Model Error: ${error.message || 'Unknown error during generation'}`;
    }
  },

  async generateImage(prompt: string) {
    if (!API_KEY) throw new Error("API Key missing");
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: prompt }] },
        });
        
        const candidate = response.candidates?.[0];
        if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
                if (part.inlineData) {
                    return {
                        data: part.inlineData.data,
                        mimeType: part.inlineData.mimeType,
                        type: 'image'
                    };
                }
            }
        }
        return { type: 'text', content: response.text || "Failed to generate image (No data returned)." };

    } catch (e: any) {
        console.error("Image Gen Error:", e);
        return { type: 'text', content: `Failed to generate image: ${e.message}` };
    }
  },

  async research(query: string) {
      if (!API_KEY) throw new Error("API Key missing");
      
      try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview", 
            contents: query,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });
        
        let text = response.text || "No results found.";
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) {
            text += "\n\n**Sources:**\n";
            chunks.forEach((chunk: any, index: number) => {
                if (chunk.web) {
                    text += `${index + 1}. <a href="${chunk.web.uri}">${chunk.web.title}</a>\n`;
                }
            });
        }
        return text;
      } catch (e) {
          console.error("Research Error:", e);
          return "Error performing research.";
      }
  },

  async tts(text: string) {
      if (!API_KEY) throw new Error("API Key missing");
      if (!text || !text.trim()) return null;

      try {
          const ttsPrompt = `Please read the following text aloud exactly as written: "${text.trim()}"`;

          const response = await ai.models.generateContent({
              model: "gemini-2.5-flash-preview-tts",
              contents: [{ parts: [{ text: ttsPrompt }] }], 
              config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: {
                      voiceConfig: {
                          prebuiltVoiceConfig: { voiceName: 'Kore' }
                      }
                  }
              }
          });
          
          const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (audioData) {
              return audioData;
          }
          console.error("TTS returned no audio data.");
          return null;
      } catch (e) {
          console.error("TTS Error:", e);
          return null;
      }
  }
};