import json
import os
import ipaddress

import requests
from fastapi import APIRouter, Depends, HTTPException, Request, Response


router = APIRouter(prefix="/szpu", tags=["SZPU"])


def require_local_school_import(request: Request) -> None:
    """开发调试保护：学校 Cookie 只能由本人在本机主动使用。"""
    if os.getenv("COURSE_TABLE_DEV_SCHOOL_IMPORT") != "1":
        raise HTTPException(status_code=403, detail="学校导入仅供本机开发测试，需主动启用。")
    if request.url.hostname not in ("localhost", "127.0.0.1", "::1"):
        raise HTTPException(status_code=403, detail="学校导入只允许通过本机地址访问。")
    if not request.client:
        raise HTTPException(status_code=403, detail="无法验证请求来源。")
    try:
        if not ipaddress.ip_address(request.client.host).is_loopback:
            raise ValueError("not loopback")
    except ValueError:
        raise HTTPException(status_code=403, detail="学校导入只允许本机访问。")
    # 拒绝代理/隧道转发声明；此开发接口不得作为公开服务运行。
    if any(request.headers.get(k) for k in ("forwarded", "x-forwarded-for", "x-forwarded-host")):
        raise HTTPException(status_code=403, detail="学校导入不允许通过代理转发。")


def require_preview_post(request: Request) -> None:
    require_local_school_import(request)
    if request.headers.get("x-course-table-local-import") != "1":
        raise HTTPException(status_code=403, detail="请求缺少本机导入确认标记。")
    # 同源 fetch 会带 Origin，防止第三方网页触发本机敏感请求。
    expected_origin = f"{request.url.scheme}://{request.headers.get('host', '')}"
    if request.headers.get("origin") != expected_origin:
        raise HTTPException(status_code=403, detail="仅允许本机同源页面发起导入。")


@router.post("/local-preview", dependencies=[Depends(require_preview_post)])
def local_school_preview(response: Response):
    """只读获取并标准化课表；浏览器确认前绝不写服务器或本地数据库。"""
    cookie = os.getenv("SZPU_COOKIE", "").strip()
    if not cookie:
        raise HTTPException(status_code=400, detail="未配置 SZPU_COOKIE，请先在本机登录学校并设置临时会话。")

    result = fetch_all_rows(cookie)
    rows = normalize_rows(result["rows"])
    if not rows:
        raise HTTPException(status_code=502, detail="没有解析到有效课程；学校登录可能失效或数据格式发生变化。")
    if len(rows) > 5000:
        raise HTTPException(status_code=502, detail="学校课程超过单次导入数量限制。")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"
    return {"success": True, "semester": SEMESTER, "raw_rows": len(result["rows"]),
            "normalized_rows": len(rows), "rows": rows}



# =========================================================
# 深圳职业技术大学教务系统
# =========================================================

SCHOOL_URL = (
    "https://jwxt-443.vpn5.szpu.edu.cn/" "jwapp/sys/wdkb/modules/xskcb/cxxszhxqkb.do"
)

SEMESTER = "2026-2027-1"


# =========================================================
# 请求头
# =========================================================


def get_headers(cookie: str) -> dict:
    return {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": ("zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7,zh-CN;q=0.6"),
        "Content-Type": ("application/x-www-form-urlencoded; charset=UTF-8"),
        "Origin": "https://jwxt-443.vpn5.szpu.edu.cn",
        "Referer": (
            "https://jwxt-443.vpn5.szpu.edu.cn/"
            "jwapp/sys/wdkb/*default/index.do"
            "?THEME=indigo&EMAP_LANG=zh"
        ),
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/155.0.0.0 Safari/537.36"
        ),
        "Cookie": cookie,
    }


# =========================================================
# 查询参数
# =========================================================


def get_query_setting() -> str:
    return json.dumps(
        [
            {
                "name": "XNXQDM",
                "value": SEMESTER,
                "linkOpt": "AND",
                "builder": "equal",
            },
            {
                "name": "*order",
                "value": "+SKZC,+SKXQ,+KSJC",
                "linkOpt": "AND",
                "builder": "m_value_equal",
            },
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    )


# =========================================================
# 请求学校课表某一页
# =========================================================


def request_page(
    cookie: str,
    page_number: int,
    page_size: int = 10,
):
    data = {
        "XNXQDM": SEMESTER,
        "*order": "+SKZC,+SKXQ,+KSJC",
        "querySetting": get_query_setting(),
        "pageSize": str(page_size),
        "pageNumber": str(page_number),
    }

    try:
        response = requests.post(
            SCHOOL_URL,
            headers=get_headers(cookie),
            data=data,
            timeout=20,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"请求深圳职业技术大学教务系统失败：{exc}",
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"学校接口返回 HTTP {response.status_code}",
        )

    try:
        payload = response.json()
    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="学校接口没有返回 JSON，登录状态可能已经失效。",
        )

    # 学校真实返回结构：
    #
    # datas
    # └── cxxszhxqkb
    #     ├── extParams
    #     ├── pageSize
    #     ├── pageNumber
    #     ├── totalSize
    #     └── rows

    datas = payload.get("datas")

    if not isinstance(datas, dict):
        raise HTTPException(
            status_code=502,
            detail="学校接口返回结构发生变化：找不到 datas。",
        )

    course_data = datas.get("cxxszhxqkb")

    if not isinstance(course_data, dict):
        raise HTTPException(
            status_code=502,
            detail="学校接口返回结构发生变化：找不到 cxxszhxqkb。",
        )

    ext_params = course_data.get("extParams", {})

    if not isinstance(ext_params, dict):
        ext_params = {}

    rows = course_data.get("rows", [])

    if not isinstance(rows, list):
        rows = []

    try:
        total_size = int(
            course_data.get(
                "totalSize",
                ext_params.get("totalSize", 0),
            )
        )
    except (TypeError, ValueError):
        total_size = 0

    try:
        actual_page_size = int(
            course_data.get(
                "pageSize",
                ext_params.get("pageSize", page_size),
            )
        )
    except (TypeError, ValueError):
        actual_page_size = page_size

    try:
        actual_page_number = int(
            course_data.get(
                "pageNumber",
                ext_params.get("pageNumber", page_number),
            )
        )
    except (TypeError, ValueError):
        actual_page_number = page_number

    return {
        "totalSize": total_size,
        "pageSize": actual_page_size,
        "pageNumber": actual_page_number,
        "rows": rows,
    }


# =========================================================
# 获取完整课表
# =========================================================


def fetch_all_rows(cookie: str):
    """
    获取当前学期全部原始排课记录。
    """

    first_page = request_page(
        cookie=cookie,
        page_number=1,
        page_size=10,
    )

    total_size = first_page["totalSize"]
    page_size = first_page["pageSize"]

    all_rows = []

    all_rows.extend(first_page.get("rows", []))

    if page_size <= 0:
        page_size = 10

    total_pages = (total_size + page_size - 1) // page_size

    for page_number in range(2, total_pages + 1):
        page_data = request_page(
            cookie=cookie,
            page_number=page_number,
            page_size=page_size,
        )

        all_rows.extend(page_data.get("rows", []))

    return {
        "total_size": total_size,
        "page_size": page_size,
        "total_pages": total_pages,
        "rows": all_rows,
    }


# =========================================================
# 周数解析
# =========================================================


def parse_week_ranges(week_mask: str):
    """
    把学校的 SKZC 周数位图转换成连续周数区间。

    例如：

    110011011111111000000000

    转换为：

    [(1, 2), (5, 6), (8, 15)]
    """

    if not week_mask:
        return []

    week_mask = str(week_mask).strip()

    weeks = []

    for index, value in enumerate(week_mask):
        if value == "1":
            weeks.append(index + 1)

    if not weeks:
        return []

    ranges = []

    start = weeks[0]
    end = weeks[0]

    for week in weeks[1:]:
        if week == end + 1:
            end = week
        else:
            ranges.append((start, end))
            start = week
            end = week

    ranges.append((start, end))

    return ranges


# =========================================================
# 单条学校记录 → 我们自己的排课记录
# =========================================================


def normalize_row(row: dict):
    """
    把学校的一条原始排课记录转换成
    一个或多个我们自己的 Course 记录。

    因为学校允许：

    1-2周、5-6周、8-15周

    这种不连续周次，

    所以一条学校记录可能需要拆成多个本地记录。
    """

    week_ranges = parse_week_ranges(row.get("SKZC"))

    if not week_ranges:
        return []

    try:
        weekday = int(row.get("SKXQ"))
    except (TypeError, ValueError):
        return []

    try:
        start_section = int(row.get("KSJC"))
        end_section = int(row.get("JSJC"))
    except (TypeError, ValueError):
        return []

    if not (1 <= weekday <= 7):
        return []

    if start_section < 1:
        return []

    if end_section < start_section:
        return []

    name = str(row.get("KCM") or "").strip()

    teacher = str(row.get("SKJS") or "").strip()

    classroom = str(row.get("JASMC") or "").strip()

    course_code = str(row.get("KCH") or "").strip()

    note_parts = []

    if course_code:
        note_parts.append(f"课程代码：{course_code}")

    class_name = str(row.get("SKBJ") or "").strip()

    if class_name:
        note_parts.append(f"班级：{class_name}")

    note = "；".join(note_parts)

    normalized = []

    for start_week, end_week in week_ranges:
        normalized.append(
            {
                "name": name,
                "teacher": teacher,
                "classroom": classroom,
                "weekday": weekday,
                "start_section": start_section,
                "end_section": end_section,
                "start_week": start_week,
                "end_week": end_week,
                "note": note,
            }
        )

    return normalized


# =========================================================
# 全部学校数据 → 本地标准数据
# =========================================================


def normalize_rows(rows: list[dict]):
    normalized = []

    for row in rows:
        normalized.extend(normalize_row(row))

    return normalized
