from app.sources import resolve_sources, role_adaptive_sources, SOURCE_TEMPLATES


def test_default_sources():
    assert resolve_sources("Hiring for a team in a growing company") == [
        "github",
        "linkedin",
        "indeed",
        "wellfound",
    ]


def test_role_adaptive_adds_dev_sources():
    assert "stackoverflow" in resolve_sources("Senior Python developer at a startup")


def test_role_adaptive_adds_ml_sources():
    sources = resolve_sources("Data scientist, machine learning, NLP")
    assert "kaggle" in sources


def test_role_adaptive_adds_design_sources():
    sources = resolve_sources("Product designer, UI/UX")
    assert "behance" in sources and "dribbble" in sources


def test_requested_sources_respected_and_filtered():
    assert resolve_sources("anything", ["github", "bogus"]) == ["github"]


def test_invalid_requested_falls_back():
    assert resolve_sources("anything", ["bogus"]) == ["github", "linkedin", "indeed", "wellfound"]


def test_xray_templates_include_site_operator():
    assert SOURCE_TEMPLATES["linkedin"].startswith("site:linkedin.com/in")
