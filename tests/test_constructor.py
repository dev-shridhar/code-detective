class Engine:
    def __init__(self, name: str) -> None:
        self.name = name

    def start(self) -> str:
        return f"{self.name} started"


class Car:
    def __init__(self, engine: Engine) -> None:
        self.engine = engine

    def drive(self) -> str:
        e = Engine("V8")
        return e.start()
