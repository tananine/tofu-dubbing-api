#!/usr/bin/env python3
import asyncio
import edge_tts
import sys
from typing import Optional

async def generate_speech(text: str, voice: str, proxy: Optional[str]) -> bytes:
    communicate = edge_tts.Communicate(text, voice, proxy=proxy)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
    return audio_data

def main():
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: edge-tts-generate.py <text> <voice> [proxy]\n")
        sys.exit(1)
    
    text = sys.argv[1]
    voice = sys.argv[2]
    proxy = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
    
    try:
        audio_data = asyncio.run(generate_speech(text, voice, proxy))
        sys.stdout.buffer.write(audio_data)
    except Exception as e:
        sys.stderr.write(f"Error generating speech: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()