# Course Table

**一个为个人日常使用打造的课程表 PWA。** 以少量操作查看「今天上什么课、在哪里上课、几点上课」；在手机主屏幕上打开，支持离线访问和本地课程管理。

- **定位：** Personal Edition（个人版），不是学校官方产品。
- **状态：** V1.0 · 维护期（2026-10-26）；已同步最后一轮 iPhone 学期日期输入修复。
- **设计：** Quiet Native — 克制的黑白界面、低饱和课程颜色、清晰的时间与位置层级、轻量弹窗。
- **线上示例：** https://course-table-personal.pages.dev （线上实例与此仓库的后续提交不一定同步）

## 功能

- **Today：** 当日课程、下一节、时间、教室、倒计时及课程详情。
- **周课表：** 教学周切换、低饱和课程配色、课程详情、手机端横向滚动。
- **本地课程管理：** 添加、编辑、删除课程；设置学期起始周和总周数。
- **数据保管：** IndexedDB 本地保存，JSON 备份/恢复。
- **学校 HTML 导入：** 从本人获得的 SZPU 官方导出 HTML 课表读取排课与独立备注；预览、旧学期备份确认后切换新学期。
- **PWA：** 可添加到手机主屏幕；已缓存的应用静态资源可离线加载。离线使用能力取决于首次成功缓存和浏览器存储状态。

> ⚠️ **重要：** Cloudflare Pages **只托管静态程序文件，不存储你的个人课表**。IndexedDB 仅保存在当前浏览器 / PWA 安装环境中。换设备、删除 App 或清除站点数据之前，请导出 JSON 备份。备份文件不包含在本仓库中。

## 项目结构

```text
course-table/
├── frontend/              # Web/PWA UI、存储、导入解析、图标和离线缓存
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── storage.js
│   ├── data-tools.js
│   ├── school-html-parser.js
│   ├── school-html-import-ui.js
│   ├── manifest.webmanifest
│   ├── service-worker.js
│   └── icons/
├── app/                   # 本地 FastAPI：网页服务、旧库只读迁移、可选学校预览
│   ├── main.py
│   ├── database.py
│   └── routers/
├── data/.gitkeep          # 只保留空目录占位；不上传个人数据库
├── scripts/build_pages.py
├── run.py
├── requirements.txt
├── CHANGELOG.md
└── .gitignore
```

## 运行本地版（Windows / macOS / Linux）

需要 Python 3.10+。在项目根目录运行：

```bash
python -m venv .venv
```

Windows PowerShell：

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python run.py
```

macOS / Linux：

```bash
source .venv/bin/activate
python -m pip install -r requirements.txt
python run.py
```

然后访问 **http://127.0.0.1:8000/**。首次运行会创建一个空的 `data/timetable.db`，只用于兼容旧版 SQLite 迁移；正常新增、编辑课程由浏览器 IndexedDB 保存。

### 导入学校 HTML

在「数据 → 导入新学期课表」选择学校导出的 HTML 课表，确认预览、学期起始周和总周数；先下载并保存旧学期备份，再确认替换。真实二进制 `.xlsx` 不是这个解析器的目标格式；只有以 HTML 为内容的表格导出可被识别。学校独立备注也有单独的补全入口。

### 可选：本机学校只读预览

`app/routers/szpu.py` 含历史开发用的学校只读预览逻辑，默认**关闭**，需要本人有权使用的校园会话和显式开启。不要把 Cookie、账号或密码写进源码、上传 GitHub 或部署到 Cloudflare。此功能不属于静态网站；日常建议直接使用官方 HTML 导入。

## 构建 Cloudflare Pages 静态版

```bash
python scripts/build_pages.py
```

得到 `dist/course-table-pages.zip`（`index.html` 位于 ZIP 根目录），上传到**现有** Cloudflare Pages Direct Upload 项目即可。这个脚本只复制 `frontend` 静态资源，不会复制 Python 后端、数据库或个人课程。

> 本仓库的首次导入不会自动触发 Cloudflare 部署；当前项目使用手动 Direct Upload。更改 Service Worker 时需要留意离线缓存版本与实际静态资源的一致性。

## 隐私与安全

- 本仓库**没有附带**个人课表、Cookie、`.env`、数据库、原始学校文件或备份。
- 个人备份保存在你自己选择的位置，不是 GitHub 或 Cloudflare 的云端同步数据。
- `.gitignore` 能减少误提交风险，但提交之前仍要确认 `Changes` 中没有敏感文件。
- 课程数据只通过本地 IndexedDB 保存；除非用户主动使用本地学校预览功能，否则不需要学校账号登录。

## 维护记录

见 [CHANGELOG.md](CHANGELOG.md)；其中的早期里程碑为项目历程摘要，并不冒充过去不存在的 Git 提交历史。

## 说明

独立的个人学习与生活工具，与深圳职业技术大学官方无隶属关系。当前仓库暂未选择开源许可证；如果将来公开代码或接受外部贡献，可再单独确定许可证。
