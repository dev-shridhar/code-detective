from test_ddd_service import OrderRepository, OrderService, OrderController


def main() -> None:
    repo = OrderRepository()
    service = OrderService(repo)
    controller = OrderController(service)

    result = controller.create("customer-1")
    print(result)


def alternate() -> None:
    svc = OrderService(OrderRepository())
    out = svc.place("customer-2")
    print(out)
