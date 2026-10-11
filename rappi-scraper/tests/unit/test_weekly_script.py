"""scripts/refresh-semanal.sh, corrido de verdad en una copia del proyecto con un `rappi` falso."""

import os
import re
import shutil
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "refresh-semanal.sh"
pytestmark = pytest.mark.skipif(shutil.which("zsh") is None, reason="el script es de zsh (macOS)")


def _project(tmp_path: Path, rappi_body: str, other_download_running: bool = False, ai_layer: bool = False) -> Path:
    """Copia mínima del proyecto: el script, un `.venv/bin/rappi` falso, un `caffeinate` que solo ejecuta, un `pgrep`
    que responde lo que diga el test (el real vería las descargas de verdad que corren en este equipo) y un `make` que
    anota cómo lo llamaron. Con `ai_layer`, un rappi-ia instalado al lado."""
    project = tmp_path / "rappi-scraper"
    (project / "scripts").mkdir(parents=True)
    shutil.copy(SCRIPT, project / "scripts" / SCRIPT.name)
    bin_dir = project / "bin"
    fakes = {
        project / ".venv" / "bin" / "rappi": rappi_body,
        bin_dir / "caffeinate": 'shift; exec "$@"',  # caffeinate -i cmd… → cmd…
        bin_dir / "pgrep": f"exit {0 if other_download_running else 1}",
        bin_dir / "make": 'echo "make $*" >> calls.txt',
    }
    if ai_layer:
        fakes[tmp_path / "rappi-ia" / ".venv" / "bin" / "python"] = "exit 0"
    for path, body in fakes.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"#!/bin/zsh\n{body}\n")
        path.chmod(0o755)
    return project


def _run(project: Path, *args: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "PATH": f"{project / 'bin'}:{os.environ['PATH']}"}
    return subprocess.run(["zsh", project / "scripts" / SCRIPT.name, *args], env=env, capture_output=True, text=True)


def _status_lines(project: Path) -> list[str]:
    return (project / "data" / "logs" / "ultimo-estado.txt").read_text().splitlines()


@pytest.mark.parametrize("code", [0, 7])
def test_each_run_leaves_its_exit_code(tmp_path, code):
    """Un fallo del domingo no queda solo en launchd.err.log: `make schedule-status` lo muestra."""
    project = _project(tmp_path, f"exit {code}")

    result = _run(project)

    assert result.returncode == code
    [line] = _status_lines(project)
    assert re.fullmatch(rf"\d{{4}}-\d\d-\d\d \d\d:\d\d:\d\d exit={code}", line)
    assert not (project / "data" / "refresh-semanal.pid").exists()


def test_a_skipped_run_is_not_reported_as_a_success(tmp_path):
    # Otra descarga en curso, lanzada a mano: el script no debe correr ni anotar «exit=0» a secas.
    project = _project(tmp_path, "exit 0", other_download_running=True)

    result = _run(project)

    assert result.returncode == 0
    [line] = _status_lines(project)
    assert line.endswith("exit=0 (omitida: había una descarga o una actualización en curso)")


def test_migrations_are_applied_before_downloading(tmp_path):
    """Tras un `git pull` con una migración nueva, la descarga de un día no debe reventar al final (p. ej. sin la
    función `clean_html` en build_search_documents) ni repetir el fallo cada domingo."""
    project = _project(tmp_path, 'echo "$*" >> calls.txt')

    result = _run(project)

    assert result.returncode == 0
    assert (project / "calls.txt").read_text().splitlines() == ["migrate", "refresh"]


def test_the_script_passes_its_options_to_refresh(tmp_path):
    """Tras `retry-failed`, `./scripts/refresh-semanal.sh --resume-only` retoma solo lo reencolado."""
    project = _project(tmp_path, 'echo "$*" >> calls.txt')

    result = _run(project, "--resume-only")

    assert result.returncode == 0
    assert (project / "calls.txt").read_text().splitlines() == ["migrate", "refresh --resume-only"]


def test_a_failed_migration_stops_before_downloading(tmp_path):
    project = _project(tmp_path, '[[ $1 == migrate ]] && exit 1; echo "$*" >> calls.txt')

    result = _run(project)

    assert result.returncode == 1
    assert not (project / "calls.txt").exists()
    assert _status_lines(project)[0].endswith("exit=1")


def test_a_failed_backup_is_recorded_and_the_ai_layer_still_runs(tmp_path):
    """`rappi refresh` sale con 3 si solo falló el respaldo: la capa de IA tiene que correr igual, pero no puede quedar
    como «exit=0» a secas (quedan los respaldos anteriores y nadie notaría que el más nuevo tiene semanas)."""
    project = _project(tmp_path, "[[ $1 == refresh ]] && exit 3; exit 0", ai_layer=True)

    result = _run(project)

    assert result.returncode == 0
    assert (project / "calls.txt").read_text().splitlines() == ["make -C ../rappi-ia post-refresh EVAL_ARGS="]
    [line] = _status_lines(project)
    assert line.endswith("exit=0 (respaldo fallido: se conservan los anteriores)")


def test_weekly_script_exit4_notes_block(tmp_path):
    """Un posible bloqueo (código 4) no es un fallo cualquiera: la línea de estado lo dice y no sigue con la IA."""
    project = _project(tmp_path, "[[ $1 == refresh ]] && exit 4; exit 0", ai_layer=True)

    result = _run(project)

    assert result.returncode == 4
    assert not (project / "calls.txt").exists()
    [line] = _status_lines(project)
    assert line.endswith("exit=4 (detenida: posible bloqueo)")


def test_weekly_script_exit5_runs_post_refresh(tmp_path):
    """Código 5: las tiendas, la búsqueda y el respaldo quedaron; solo los restaurantes no se actualizaron."""
    project = _project(tmp_path, "[[ $1 == refresh ]] && exit 5; exit 0", ai_layer=True)

    result = _run(project)

    assert result.returncode == 0
    assert (project / "calls.txt").read_text().splitlines() == ["make -C ../rappi-ia post-refresh EVAL_ARGS="]
    [line] = _status_lines(project)
    assert line.endswith("exit=0 (restaurantes sin actualizar)")


def test_weekly_script_exit6_notes_both_failures(tmp_path):
    """Código 6: sin restaurantes nuevos y sin respaldo nuevo; la línea de estado dice las dos cosas."""
    project = _project(tmp_path, "[[ $1 == refresh ]] && exit 6; exit 0", ai_layer=True)

    result = _run(project)

    assert result.returncode == 0
    assert (project / "calls.txt").read_text().splitlines() == ["make -C ../rappi-ia post-refresh EVAL_ARGS="]
    [line] = _status_lines(project)
    assert line.endswith("exit=0 (restaurantes sin actualizar; respaldo fallido: se conservan los anteriores)")


def test_any_other_refresh_failure_still_stops_the_run(tmp_path):
    project = _project(tmp_path, "[[ $1 == refresh ]] && exit 7; exit 0", ai_layer=True)

    result = _run(project)

    assert result.returncode == 7
    assert not (project / "calls.txt").exists()  # sin capa de IA
    [line] = _status_lines(project)
    assert line.endswith("exit=7")


def test_a_run_cut_by_a_shutdown_is_recorded_on_the_next_run(tmp_path):
    """Un apagado no deja correr el trap: la ejecución siguiente encuentra el candado huérfano y lo anota."""
    project = _project(tmp_path, "exit 0")
    (project / "data").mkdir()
    (project / "data" / "refresh-semanal.pid").write_text("999999\n")  # un PID que no es la tarea semanal

    result = _run(project)

    assert result.returncode == 0
    interrupted, finished = _status_lines(project)
    assert interrupted.endswith("interrumpida: la ejecución anterior no terminó (apagado o corte de luz)")
    assert finished.endswith("exit=0")
