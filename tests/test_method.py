from typing import Optional


class UserRepository:
    def find(self, user_id: str) -> Optional[str]:
        return self._store.get(user_id)


class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self.repo = repo
        self._store: dict[str, str] = {}

    def lookup(self, user_id: str) -> Optional[str]:
        return self.repo.find(user_id)

    def process(self, user_id: str) -> str:
        result = self.lookup(user_id)
        if result is None:
            result = "default"
        return result
