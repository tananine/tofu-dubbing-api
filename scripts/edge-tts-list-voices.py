#!/usr/bin/env python3
import asyncio
import json
import edge_tts


async def list_voices() -> list[dict]:
    voices = await edge_tts.list_voices()
    return [
        {
            "id": voice.get("ShortName"),
            "language": voice.get("Locale"),
            "gender": voice.get("Gender"),
            "name": voice.get("FriendlyName"),
        }
        for voice in voices
    ]


def main() -> None:
    voices = asyncio.run(list_voices())
    print(json.dumps(voices))


if __name__ == "__main__":
    main()
