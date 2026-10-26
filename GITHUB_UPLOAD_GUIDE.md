# 第一次上传到 GitHub

## 这份 ZIP 是什么？

这是一份**源码仓库快照**，不是 Cloudflare 直接部署 ZIP，也不包含 `.venv` 或个人数据库。已把上次 Cloudflare 正式版里的 iPhone 日期输入修复同步回源码（其他前端文件与上传的本地版一致）。

## 推荐：GitHub Desktop（Windows）

1. **先解压**这个 ZIP；不要把 ZIP 当成单个文件上传到 GitHub。
2. 安装 [GitHub Desktop](https://desktop.github.com/) 并登录 GitHub。
3. `File → Add Local Repository` 选择解压后的 `course-table` 文件夹；如果它不是 Git 仓库，使用 `Create a repository here`。
4. 在 `Changes` 中确认看不到 `timetable.db`、`.env`、学校课表、个人备份或任何凭证。
5. 输入提交说明，例如 `Initial release: Course Table Personal V1.0`，点击 `Commit to main`。
6. 点击 `Publish repository`，勾选 `Keep this code private` 后发布。未来确认无敏感信息再考虑设为 Public。

## 日常维护

- 在自己的本地开发目录中测试好代码，再同步仓库（建议以后直接以 Git 仓库目录作为开发目录）。
- 在 GitHub Desktop 中提交、Push；不必每次重新上传整个 ZIP。
- 准备正式发布时执行 `python scripts/build_pages.py`，上传 `dist/course-table-pages.zip` 到现有 Cloudflare Pages 项目。
- GitHub 的版本记录**不会自动备份手机 IndexedDB**。请仍然独立备份手机课程数据。

## `.venv` 是否需要？

**不需要，也不应该上传。** `requirements.txt` 是可重建运行环境的依据。首次安装使用 `python -m venv .venv` 和 `pip install -r requirements.txt`。

## 隐私校验

此仓库快照已排除：
- `data/timetable.db`（原始项目含真实课程）及数据库相关文件；
- `__pycache__`、`*.pyc`、虚拟环境；
- 本地凭证配置、备份以及学校数据文件；
- 已不再被引用的旧课程/设置写入路由文件（不影响 FastAPI 现有加载）。

`.gitignore` 不能保证阻止手动添加、重命名或在代码里硬编码的所有秘密；在项目公开前请再次检查源码和首次提交内容。
