from app.llm import extract_json_array, extract_json_object, parse_candidates


def test_extract_json_array_from_verbose_text():
    text = 'Here you go:\n\n[{"name": "Ada", "url": "https://x.com/a"}, {"name": "Bob"}] and more text'
    assert extract_json_array(text) == [{"name": "Ada", "url": "https://x.com/a"}, {"name": "Bob"}]


def test_extract_json_object_with_trailing_text():
    text = 'Sure: {"queries": [{"source": "github", "query": "site:github.com python"}]}. Done.'
    data = extract_json_object(text)
    assert data["queries"][0]["query"] == "site:github.com python"


def test_extract_json_object_direct():
    assert extract_json_object('{"a": 1}') == {"a": 1}


def test_extract_missing_returns_none():
    assert extract_json_array("no json here") is None
    assert extract_json_object("no json here") is None


def test_parse_candidates_wraps_object_form():
    text = '{"candidates": [{"name": "Ada"}]}'
    assert parse_candidates(text) == [{"name": "Ada"}]


def test_parse_candidates_array_form():
    assert parse_candidates('[{"name": "Bob"}]') == [{"name": "Bob"}]
