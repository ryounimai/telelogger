export const BOT_NAME = "ＡＩ Ahnn";
export const BOT_USERNAME = "@AiAhnn_BOT";
export const COPYRIGHT = "RYOUNIME.AI";
export const VERSION = "151.2.2";

export const DEFAULT_CHATS = [
  { id: 'general', name: 'General Chat', type: 'group', avatar: 'https://picsum.photos/seed/general/200' },
  { id: 'saved', name: 'Saved Messages', type: 'private', avatar: 'https://picsum.photos/seed/saved/200' },
];

export const POPULAR_STICKERS = [
  'https://www.gstatic.com/webp/gallery/1.webp',
  'https://www.gstatic.com/webp/gallery/2.webp',
  'https://www.gstatic.com/webp/gallery/3.webp',
  'https://www.gstatic.com/webp/gallery/4.webp',
  'https://www.gstatic.com/webp/gallery/5.webp'
];

export const HELP_TEXT = `
🤖 **Bot Command List** (v${VERSION})

/start - Initialize bot
/imagen [prompt] - Generate images
/code [snippet] - Format code
/stickers [prompt] - **NEW** Generate AI sticker or send random
/tts [text] - Text to Speech
/imgdesc [caption] - Describe media (Photo/Video/Audio)
/research [query] - Google Search grounding
/lyricfind [song] - Find lyrics (Multi-Engine: LrcLib, Spotify, etc.)
/lrcfindwtimestamp [song] - Lyrics with timestamps
/aicustomize [instruction] - Set custom bot persona
/status - Live System Matrix

*Created by ${COPYRIGHT}*
`;