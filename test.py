def validate_credit_card(card_number: str, expiry: str) -> bool:
    """Validate a credit card number using Luhn algorithm."""
    if not card_number or not card_number.isdigit():
        return False
    
    total = 0
    reverse_digits = card_number[::-1]
    
    for i, digit in enumerate(reverse_digits):
        n = int(digit)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    
    return total % 10 == 0


def process_order(items, user):
    """Process an order with discount logic."""
    subtotal = sum(item.price for item in items)
    discount = 0
    
    if user.is_premium:
        discount = subtotal * 0.2
    elif user.is_member:
        discount = subtotal * 0.1
    else:
        if subtotal > 100:
            discount = subtotal * 0.05
    
    if user.has_coupon:
        discount = max(discount, subtotal * 0.25)
    
    total = subtotal - discount
    return total


def retry_operation(max_retries=3):
    """Retry an operation with backoff."""
    for attempt in range(max_retries):
        try:
            result = perform_operation()
            return result
        except ConnectionError as e:
            if attempt == max_retries - 1:
                raise
            wait(attempt * 2)
    
    return None


def main():
    """Entry point with error handling."""
    try:
        items = fetch_items()
        user = get_current_user()
        total = process_order(items, user)
        print(f"Total: ${total:.2f}")
    except ValueError as e:
        print(f"Invalid data: {e}")
        log_error(e)
    except RuntimeError as e:
        print(f"System error: {e}")
        notify_admin(e)
        raise
    finally:
        cleanup()
