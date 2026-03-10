import { GeminiService } from './geminiService';

export const LyricService = {
  /**
   * Search for lyrics using Multi-Engine Strategy
   * 1. LrcLib (Database) - Fast, Synced
   * 2. Gemini Grounding (Spotify/Youtube/Kugou/LyricJumper) - Fallback, Powerful
   * @param query Song name and artist
   * @param synced If true, requests .lrc format
   */
  async getLyrics(query: string, synced: boolean): Promise<{ title: string; artist: string; lyrics: string; source: string } | null> {
    
    // ENGINE 1: LrcLib (Primary)
    try {
      console.log(`[LyricEngine] Trying LrcLib for: ${query}`);
      const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (data && Array.isArray(data) && data.length > 0) {
        // Find the first track that actually has the type of lyrics we need
        const track = data.find((t: any) => synced ? t.syncedLyrics : t.plainLyrics);

        if (track) {
          return {
            title: track.trackName,
            artist: track.artistName,
            lyrics: synced ? track.syncedLyrics : track.plainLyrics,
            source: 'LrcLib Database'
          };
        }
      }
    } catch (error) {
      console.warn("[LyricEngine] LrcLib failed, failing over to Universal Search...", error);
    }

    // ENGINE 2: Universal Search (Gemini Grounding + Parsing)
    // This simulates searching Spotify, Youtube Music, Kugou, Lyric Jumper, etc.
    try {
        console.log(`[LyricEngine] Trying Universal Search (Gemini) for: ${query}`);
        const prompt = `Find the full ${synced ? 'LRC synced timestamps' : 'plain text'} lyrics for the song "${query}". 
        Search through sources like Spotify, Musixmatch, Genius, Kugou, and Youtube Music.
        Return ONLY the lyrics. If synced is requested but not found, return plain text.
        Format the output as follows:
        Title: [Song Title]
        Artist: [Artist Name]
        
        [Lyrics Content]`;

        const searchResult = await GeminiService.research(prompt);
        
        // Parse the unstructured AI response
        const lines = searchResult.split('\n');
        let title = query;
        let artist = 'Unknown';
        let lyricsStartIndex = 0;

        // Simple parser
        for(let i=0; i<Math.min(lines.length, 10); i++) {
            if(lines[i].toLowerCase().startsWith('title:')) title = lines[i].substring(6).trim();
            if(lines[i].toLowerCase().startsWith('artist:')) {
                artist = lines[i].substring(7).trim();
                lyricsStartIndex = i + 1;
            }
        }

        const lyrics = lines.slice(lyricsStartIndex).join('\n').trim();

        if (lyrics && lyrics.length > 20 && !lyrics.includes("No results found")) {
            return {
                title: title,
                artist: artist,
                lyrics: lyrics,
                source: 'Universal Search (Spotify/YT/Kugou/Jumper)'
            };
        }

    } catch (e) {
        console.error("[LyricEngine] Universal Search failed", e);
    }

    return null;
  }
};