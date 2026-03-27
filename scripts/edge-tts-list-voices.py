#!/usr/bin/env python3
import asyncio
import json
import edge_tts
import sys
from typing import Optional


def get_country_flag(locale: str) -> str:
    """Convert locale code to country flag emoji"""
    if not locale:
        return ""
    
    parts = locale.split("-")
    if len(parts) < 2:
        return ""
    
    country_code = parts[1].upper()
    
    OFFSET = 127397
    flag = "".join(chr(ord(char) + OFFSET) for char in country_code)
    
    return flag


async def list_voices(proxy: Optional[str]) -> list[dict]:
    voices = await edge_tts.list_voices(proxy=proxy)
    return [
        {
            "id": voice.get("ShortName"),
            "language": voice.get("Locale"),
            "gender": voice.get("Gender"),
            "name": voice.get("FriendlyName", "").replace("Microsoft ", ""),
            "flag": get_country_flag(voice.get("Locale", "")),
        }
        for voice in voices
    ]


def main() -> None:
    proxy = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else None
    voices = asyncio.run(list_voices(proxy))
    print(json.dumps(voices))


if __name__ == "__main__":
    main()
