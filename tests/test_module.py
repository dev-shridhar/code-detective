import json


def helper(x: int) -> int:
    return x * 2


def process(data: str) -> str:
    parsed = json.loads(data)
    return str(helper(parsed["value"]))


class Calculator:
    def compute(self, n: int) -> int:
        return helper(n)
