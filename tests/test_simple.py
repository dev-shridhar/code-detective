def process(data: str) -> str:
    result = transform(data)
    return result


def transform(raw: str) -> str:
    cleaned = raw.strip()
    return cleaned.lower()
