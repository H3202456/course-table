import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "timetable.db"


def get_connection() -> sqlite3.Connection:
    DATA_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS semester (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                name TEXT NOT NULL DEFAULT '当前学期',
                start_date TEXT NOT NULL DEFAULT '',
                total_weeks INTEGER NOT NULL DEFAULT 20
            );

            CREATE TABLE IF NOT EXISTS courses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                teacher TEXT DEFAULT '',
                classroom TEXT DEFAULT '',
                weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
                start_section INTEGER NOT NULL CHECK (start_section >= 1),
                end_section INTEGER NOT NULL CHECK (end_section >= start_section),
                start_week INTEGER NOT NULL DEFAULT 1 CHECK (start_week >= 1),
                end_week INTEGER NOT NULL DEFAULT 20 CHECK (end_week >= start_week),
                note TEXT DEFAULT ''
            );

            INSERT OR IGNORE INTO semester (id, name, start_date, total_weeks)
            VALUES (1, '当前学期', '', 20);
            """
        )
