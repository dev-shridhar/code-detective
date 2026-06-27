def safe_divide(a: float, b: float) -> float:
    try:
        result = a / b
    except ZeroDivisionError:
        result = 0.0
    except TypeError:
        result = 0.0
    finally:
        pass
    return result


def handle(value: object) -> str:
    match value:
        case int(n):
            return f"int {n}"
        case str(s):
            return f"str {s}"
        case _:
            return "unknown"


def with_finally_return():
    try:
        return "done"
    finally:
        cleanup()


def with_finally_return_except():
    try:
        return do_stuff()
    except:
        return "error"
    finally:
        cleanup()
