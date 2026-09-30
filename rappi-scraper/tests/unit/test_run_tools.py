from argparse import Namespace

import pytest

from rappi_scraper import cli
from rappi_scraper import keep_awake as keep_awake_module
from rappi_scraper.keep_awake import keep_awake
from rappi_scraper.pipeline.progress import Progress
from rappi_scraper.pipeline.queue import PossibleBlock
from rappi_scraper.reporting import render_markdown


class _Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


def test_progress_estimates_remaining_time_from_average():
    clock = _Clock()
    progress = Progress(10, clock=clock)

    assert progress.label(0) == "[1/10]"
    clock.now = 60  # 1 job en 1 minuto
    assert progress.label(1) == "[2/10 · 1m · faltan ~9m]"
    clock.now = 2 * 3600  # 5 jobs en 2 horas
    assert progress.label(5) == "[6/10 · 2h00m · faltan ~2h00m]"


def test_keep_awake_is_noop_without_caffeinate(monkeypatch):
    monkeypatch.setattr(keep_awake_module.shutil, "which", lambda _name: None)
    monkeypatch.setattr(keep_awake_module.subprocess, "Popen", lambda *a, **k: (_ for _ in ()).throw(AssertionError))
    with keep_awake():
        pass


def test_keep_awake_starts_and_stops_caffeinate(monkeypatch):
    calls = []

    class FakeProcess:
        def __init__(self, cmd):
            calls.append(("start", cmd))

        def terminate(self):
            calls.append(("stop",))

    monkeypatch.setattr(keep_awake_module.shutil, "which", lambda _name: "/usr/bin/caffeinate")
    monkeypatch.setattr(keep_awake_module.subprocess, "Popen", FakeProcess)
    with keep_awake():
        assert calls[0][1][:3] == ["/usr/bin/caffeinate", "-i", "-w"]
    assert calls[-1] == ("stop",)


def _report(checks):
    return {
        "run_id": 7, "kind": "stores", "status": "done", "started_at": "2026-09-26T10:00", "finished_at": None,
        "jobs": {"done": 9, "failed": 1}, "totals": {"ofertas": 120}, "top_errors": [{"error": "HTTP 502", "count": 1}],
        "verticals": [
            {"vertical": "mall", "tiendas": 2, "ofertas": 120, "productos_unicos": 100, "productos_nuevos": 100}
        ],
        "checks": checks,
    }  # fmt: skip


def test_render_markdown_flags_out_of_range_checks():
    checks = [
        {"label": "Productos sin precio (%)", "value": 12.0, "limit": 5, "minimum": False, "ok": False},
        {"label": "Cobertura obtenidos/declarados (%)", "value": 30.0, "limit": 5, "minimum": True, "ok": True},
    ]
    text = render_markdown(_report(checks))

    assert "⚠ 1 validaciones fuera de rango: Productos sin precio (%)" in text
    assert "| Productos sin precio (%) | 12.0 | ≤ 5 | ⚠ |" in text
    assert "| Cobertura obtenidos/declarados (%) | 30.0 | ≥ 5 | ok |" in text
    assert "| mall | 2 | 120 | 100 | 100 |" in text
    assert "- (1) HTTP 502" in text


def test_render_markdown_all_ok():
    ok = [{"label": "Jobs fallidos (%)", "value": 1.0, "limit": 10, "minimum": False, "ok": True}]
    assert "✓ Todas las validaciones dentro de rango" in render_markdown(_report(ok))


def test_refresh_command_exits_with_a_clear_message_on_a_block(monkeypatch):
    def blocked(*args, **kwargs):
        raise PossibleBlock("posible bloqueo: 10 fallos consecutivos (último: 403)")

    monkeypatch.setattr(cli, "refresh", blocked)
    with pytest.raises(SystemExit, match="Descarga detenida: posible bloqueo") as exit_info:
        cli.cmd_refresh(None, Namespace(no_backup=True))
    assert exit_info.value.code != 0
