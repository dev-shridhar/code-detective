def with_raise(x):
    if x < 0:
        raise ValueError("negative")
    return x


async def async_func():
    return await fetch_data()


async def async_loop():
    async for item in async_gen():
        if item is None:
            continue
        process(item)


async def async_with_block():
    async with get_resource() as res:
        return res.value


def with_import_inside():
    from math import sqrt
    return sqrt(42)


def with_decorated_nested():
    @log_call
    def inner():
        return 42
    return inner()
