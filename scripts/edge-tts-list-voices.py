#!/usr/bin/env python3
import asyncio
import json
import edge_tts


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


async def list_voices() -> list[dict]:
    voices = await edge_tts.list_voices()
    return [
        {
            "id": voice.get("ShortName"),
            "language": voice.get("Locale"),
            "gender": voice.get("Gender"),
            "name": voice.get("FriendlyName"),
            "flag": get_country_flag(voice.get("Locale", "")),
        }
        for voice in voices
    ]


def main() -> None:
    voices = asyncio.run(list_voices())
    print(json.dumps(voices))


if __name__ == "__main__":
    main()
