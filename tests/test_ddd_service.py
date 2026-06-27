from typing import Optional


class OrderRepository:
    def __init__(self) -> None:
        self._store: dict = {}

    def save(self, order: object) -> None:
        self._store[id(order)] = order


class OrderService:
    def __init__(self, repo: OrderRepository) -> None:
        self.repo = repo

    def place(self, customer_id: str) -> object:
        order = object()
        self.repo.save(order)
        return order


class OrderController:
    def __init__(self, service: OrderService) -> None:
        self.service = service

    def create(self, payload: str) -> str:
        order = self.service.place(payload)
        return str(order)
