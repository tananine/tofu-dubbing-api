#!/usr/bin/env python3
import asyncio
import edge_tts
import sys

async def generate_speech(text: str, voice: str) -> bytes:
    communicate = edge_tts.Communicate(text, voice)
    audio_data = b""
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_data += chunk["data"]
    return audio_data

def main():
    if len(sys.argv) < 3:
        sys.stderr.write("Usage: edge-tts-generate.py <text> <voice>\n")
        sys.exit(1)
    
    text = sys.argv[1]
    voice = sys.argv[2]
    
    try:
        audio_data = asyncio.run(generate_speech(text, voice))
        sys.stdout.buffer.write(audio_data)
    except Exception as e:
        sys.stderr.write(f"Error generating speech: {str(e)}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()