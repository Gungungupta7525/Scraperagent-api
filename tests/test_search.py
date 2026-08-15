from app.search import CircuitBreaker


def test_circuit_breaker_stays_closed_on_success():
    breaker = CircuitBreaker(threshold=2)
    breaker.success()
    breaker.success()
    assert not breaker.is_open


def test_circuit_breaker_opens_after_threshold():
    breaker = CircuitBreaker(threshold=2)
    breaker.failure()
    assert not breaker.is_open
    breaker.failure()
    assert breaker.is_open


def test_circuit_breaker_recovers_on_success():
    breaker = CircuitBreaker(threshold=2)
    breaker.failure()
    breaker.failure()
    assert breaker.is_open
    breaker.success()
    assert not breaker.is_open
