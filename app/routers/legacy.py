"""只读旧库兼容接口。仅用于首次从 SQLite 迁移到浏览器 IndexedDB。

新课程的增删改查全部在前端本地完成；此模块不提供写入接口。
等确定所有浏览器都完成迁移后，可将此路由与 SQLite 依赖一同移除。
"""
from fastapi import APIRouter

from app.database import get_connection

router = APIRouter(tags=["legacy-readonly"])


@router.get("/courses")
def get_legacy_courses():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, teacher, classroom, weekday, start_section, "
            "end_section, start_week, end_week, note FROM courses "
            "ORDER BY weekday, start_section, id"
        ).fetchall()
    return [dict(row) for row in rows]


@router.get("/settings")
def get_legacy_settings():
    with get_connection() as conn:
        row = conn.execute(
            "SELECT name, start_date, total_weeks FROM semester WHERE id = 1"
        ).fetchone()
    return dict(row) if row else {"name": "当前学期", "start_date": "", "total_weeks": 20}
