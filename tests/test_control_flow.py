from typing import Optional


def classify(value: int) -> str:
    if value > 0:
        return "positive"
    elif value < 0:
        return "negative"
    else:
        return "zero"


def sum_until(items: list[int], limit: int) -> int:
    total = 0
    for n in items:
        if n > limit:
            break
        total += n
    return total


def find(items: list[Optional[int]]) -> int:
    idx = 0
    while idx < len(items):
        if items[idx] is None:
            idx += 1
            continue
        return idx
    return -1


def loop_with_if_first(items: list[int]) -> int:
    total = 0
    for n in items:
        if n > 0:
            break
        total += n
    return total


def while_with_if_first(items: list[int]) -> int:
    idx = 0
    while idx < len(items):
        if items[idx] > 0:
            break
        idx += 1
    return idx
