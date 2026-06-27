# Bug 1: Return inside try-finally bypasses finally clause
def with_finally_return():
    try:
        return "done"
    finally:
        cleanup()

# Bug 2: Many except handlers — body frontier with multiple nodes
def multiple_paths_try(x):
    try:
        if x > 0:
            risky_a()
        else:
            risky_b()
    except:
        handle()

# Bug 3: For loop body starts with nested control flow
def loop_with_if_first():
    for n in items:
        if n > 0:
            break
        total += n

# Bug 4: While loop with nested control flow
def while_with_if_first():
    while cond():
        if x > 0:
            break
        x -= 1

# Bug 5: Match with returns (all case edges should be 'case' kind)
def match_with_returns(val):
    match val:
        case 1:
            return "one"
        case 2:
            return "two"
        case _:
            return "other"
