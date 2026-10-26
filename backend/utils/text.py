import unicodedata

def normalize_text(value: str) -> str:
    return unicodedata.normalize("NFC", value)