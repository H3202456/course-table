/* =========================================================
   Course Store V1 · 平台无关的数据接口 + Web IndexedDB 适配

   - 课程、学期设置保存在当前浏览器/当前 origin 的 IndexedDB
   - 唯一一次的旧版 SQLite 迁移只允许 localhost/127.0.0.1
   - 本文件不持有学校凭证、不执行任何自动登录
========================================================= */
(function (root) {
  "use strict";

  const DATABASE_NAME = "course-table-local-v1";
  const DATABASE_VERSION = 1;
  const DEFAULT_SETTINGS = Object.freeze({
    name: "当前学期",
    start_date: "",
    total_weeks: 20,
  });

  let dbPromise;

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("本地数据库请求失败"));
    });
  }

  function transactionDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error("本地数据操作已中止"));
      tx.onerror = () => reject(tx.error || new Error("本地数据写入失败"));
    });
  }

  function openDatabase() {
    if (!root.indexedDB) {
      return Promise.reject(new Error("当前浏览器不支持 IndexedDB，请更换浏览器。"));
    }
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const req = root.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("courses")) {
            db.createObjectStore("courses", {keyPath: "id", autoIncrement: true});
          }
          if (!db.objectStoreNames.contains("settings")) {
            db.createObjectStore("settings", {keyPath: "key"});
          }
          if (!db.objectStoreNames.contains("meta")) {
            db.createObjectStore("meta", {keyPath: "key"});
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => db.close();
          resolve(db);
        };
        req.onerror = () => reject(req.error || new Error("无法打开本地数据库"));
        req.onblocked = () => reject(new Error("另一个标签页占用了旧版数据库，请关闭后重试。"));
      }).catch(error => {
        dbPromise = null;
        throw error;
      });
    }
    return dbPromise;
  }

  function ensureSettings(settings) {
    if (!settings || typeof settings !== "object") return {...DEFAULT_SETTINGS};
    const name = String(settings.name || DEFAULT_SETTINGS.name).trim().slice(0, 100);
    const start_date = /^\d{4}-\d{2}-\d{2}$/.test(String(settings.start_date || ""))
      ? settings.start_date : "";
    const total_weeks = Number(settings.total_weeks);
    return {
      name,
      start_date,
      total_weeks: Number.isInteger(total_weeks) && total_weeks >= 1 && total_weeks <= 60
        ? total_weeks : DEFAULT_SETTINGS.total_weeks,
    };
  }

  function normalizeCourse(input) {
    if (!input || typeof input !== "object") throw new Error("课程数据无效");
    const name = String(input.name || "").trim();
    if (!name || name.length > 100) throw new Error("课程名称需为 1–100 个字符");
    const course = {
      name,
      teacher: String(input.teacher || ""),
      classroom: String(input.classroom || ""),
      weekday: Number(input.weekday),
      start_section: Number(input.start_section),
      end_section: Number(input.end_section),
      start_week: Number(input.start_week),
      end_week: Number(input.end_week),
      note: String(input.note || ""),
    };
    const integerBetween = (n, low, high) => Number.isInteger(n) && n >= low && n <= high;
    if (!integerBetween(course.weekday, 1, 7)) throw new Error("星期必须在 1–7 之间");
    if (!integerBetween(course.start_section, 1, 12) ||
        !integerBetween(course.end_section, course.start_section, 12)) {
      throw new Error("节次必须在 1–12 之间，且结束节不能早于开始节");
    }
    if (!integerBetween(course.start_week, 1, 60) ||
        !integerBetween(course.end_week, course.start_week, 60)) {
      throw new Error("周数必须在 1–60 之间，且结束周不能早于开始周");
    }
    if (input.id !== undefined && input.id !== null) {
      const id = Number(input.id);
      if (!Number.isSafeInteger(id) || id < 1) throw new Error("课程 ID 无效");
      course.id = id;
    }
    if (input.schoolSync !== undefined) {
      const sync = input.schoolSync;
      if (!sync || typeof sync !== "object" || Array.isArray(sync) ||
          sync.schema !== 1 || typeof sync.semester !== "string" ||
          !/^[0-9a-zA-Z_-]{3,40}$/.test(sync.semester) ||
          !sync.baseline || typeof sync.baseline !== "object" || Array.isArray(sync.baseline)) {
        throw new Error("学校同步元信息无效");
      }
      const base = normalizeCourse({...sync.baseline, schoolSync: undefined});
      delete base.id;
      course.schoolSync = {schema: 1, semester: sync.semester, baseline: base};
    }
    return course;
  }

  function sortCourses(courses) {
    return courses.sort((a, b) =>
      a.weekday - b.weekday || a.start_section - b.start_section || a.id - b.id);
  }

  async function getCourses() {
    const db = await openDatabase();
    const tx = db.transaction("courses", "readonly");
    const result = await requestResult(tx.objectStore("courses").getAll());
    return sortCourses(result);
  }

  async function getSettings() {
    const db = await openDatabase();
    const tx = db.transaction("settings", "readonly");
    const item = await requestResult(tx.objectStore("settings").get("semester"));
    return ensureSettings(item?.value);
  }

  async function putSettings(settings) {
    const data = ensureSettings(settings);
    const db = await openDatabase();
    const tx = db.transaction("settings", "readwrite");
    const finished = transactionDone(tx);
    tx.objectStore("settings").put({key: "semester", value: data});
    await finished;
    return data;
  }

  async function saveCourse(input) {
    const course = normalizeCourse(input);
    const db = await openDatabase();
    const tx = db.transaction("courses", "readwrite");
    const finished = transactionDone(tx);
    const store = tx.objectStore("courses");
    // put 只更新已经存在的课程，避免编辑一个已经删除的 ID 时意外重新创建。
    if (course.id !== undefined) {
      const existing = await requestResult(store.get(course.id));
      if (!existing) {
        await finished;
        throw new Error("课程已不存在，请刷新页面");
      }
      // 编辑课程时保留学校同步基线，才能区分“手动修改”和“学校调整”。
      if (existing.schoolSync) course.schoolSync = existing.schoolSync;
    }
    const id = await requestResult(store.put(course));
    await finished;
    return {...course, id};
  }

  async function deleteCourse(id) {
    const courseId = Number(id);
    if (!Number.isSafeInteger(courseId) || courseId < 1) throw new Error("课程 ID 无效");
    const db = await openDatabase();
    const tx = db.transaction("courses", "readwrite");
    const finished = transactionDone(tx);
    const store = tx.objectStore("courses");
    const existing = await requestResult(store.get(courseId));
    if (!existing) {
      await finished;
      throw new Error("课程已不存在，请刷新页面");
    }
    store.delete(courseId);
    await finished;
  }

  function isLocalDevelopmentHost() {
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(root.location.hostname);
  }

  async function getLegacySnapshot() {
    if (!isLocalDevelopmentHost()) return null;
    try {
      const [coursesResponse, settingsResponse] = await Promise.all([
        root.fetch("/api/courses", {cache: "no-store"}),
        root.fetch("/api/settings", {cache: "no-store"}),
      ]);
      if (!coursesResponse.ok || !settingsResponse.ok) return null;
      const [courses, settings] = await Promise.all([
        coursesResponse.json(), settingsResponse.json(),
      ]);
      if (!Array.isArray(courses)) return null;
      return {
        courses: courses.map(normalizeCourse),
        settings: ensureSettings(settings),
      };
    } catch (error) {
      // 静态开发服务器可能没有旧版 API：正常初始化为空课表。
      console.info("未找到可迁移的旧版 SQLite 数据，将使用独立本地课表。", error);
      return null;
    }
  }

  async function initialize() {
    const db = await openDatabase();
    {
      const tx = db.transaction("meta", "readonly");
      const initialized = await requestResult(tx.objectStore("meta").get("initialized"));
      if (initialized) return;
    }

    // 在事务外获取旧数据，避免让 IndexedDB 事务在 fetch 时失效。
    const legacy = await getLegacySnapshot();
    const tx = db.transaction(["courses", "settings", "meta"], "readwrite");
    const finished = transactionDone(tx);
    const meta = tx.objectStore("meta");
    const courses = tx.objectStore("courses");
    const settings = tx.objectStore("settings");

    // 保护已存在的本地内容：只有全新库才允许迁移旧版 SQLite。
    const existing = await requestResult(meta.get("initialized"));
    if (!existing) {
      const count = await requestResult(courses.count());
      const currentSettings = await requestResult(settings.get("semester"));
      if (count === 0 && legacy?.courses?.length) {
        legacy.courses.forEach(course => courses.add(course));
      }
      if (!currentSettings) {
        settings.put({
          key: "semester",
          value: legacy?.settings || {...DEFAULT_SETTINGS},
        });
      }
      meta.put({key: "initialized", at: new Date().toISOString(), migrated: !!legacy});
    }
    await finished;
  }

  // Local Data V2: both backup and import use the same normalized data schema.
  const MAX_IMPORT_COURSES = 5000;

  function verifiedCourse(value, index) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`第 ${index + 1} 条课程不是有效的对象`);
    }
    const course = normalizeCourse(value);
    for (const [key, limit] of [["teacher", 100], ["classroom", 100], ["note", 500]]) {
      if (course[key].length > limit) throw new Error(`第 ${index + 1} 条课程的 ${key} 太长`);
    }
    return course;
  }

  function validDate(value) {
    if (value === "") return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [y, m, d] = value.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d;
  }

  function verifiedSettings(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("备份缺少有效的学期设置");
    }
    if (typeof value.name !== "string" || value.name.trim().length === 0 || value.name.length > 100) {
      throw new Error("备份中的学期名称无效");
    }
    if (typeof value.start_date !== "string" || !validDate(value.start_date)) {
      throw new Error("备份中的学期开始日期无效");
    }
    if (!Number.isInteger(value.total_weeks) || value.total_weeks < 1 || value.total_weeks > 60) {
      throw new Error("备份中的学期总周数无效");
    }
    return {name: value.name.trim(), start_date: value.start_date, total_weeks: value.total_weeks};
  }

  function decodeImport(payload) {
    let rawCourses;
    let settings = null;
    let kind;
    if (Array.isArray(payload)) {
      rawCourses = payload;
      kind = "courses";
    } else if (payload && typeof payload === "object") {
      if (payload.format !== undefined || payload.version !== undefined) {
        if (payload.format !== "course-table-backup" || payload.version !== 1) {
          throw new Error("不支持此备份格式或版本");
        }
        kind = "backup";
        settings = verifiedSettings(payload.settings);
      } else {
        kind = "courses";
      }
      rawCourses = payload.courses;
    } else {
      throw new Error("JSON 文件必须是备份对象或课程数组");
    }
    if (!Array.isArray(rawCourses)) throw new Error("JSON 缺少 courses 数组");
    if (rawCourses.length > MAX_IMPORT_COURSES) throw new Error("单次最多导入 5000 条课程");
    const courses = rawCourses.map(verifiedCourse);
    if (kind === "backup") {
      const ids = new Set();
      for (const c of courses) {
        if (c.id === undefined) throw new Error("完整备份中的课程必须包含 ID");
        if (ids.has(c.id)) throw new Error("完整备份含有重复的课程 ID");
        ids.add(c.id);
      }
    }
    return {kind, courses, settings};
  }

  function inspectImport(payload) {
    const decoded = decodeImport(payload);
    return {
      kind: decoded.kind,
      count: decoded.courses.length,
      semesterName: decoded.settings?.name || "",
      payload,
    };
  }

  function courseSignature(course) {
    return JSON.stringify([
      course.name.trim(), course.teacher.trim(), course.classroom.trim(),
      course.weekday, course.start_section, course.end_section,
      course.start_week, course.end_week, course.note.trim(),
    ]);
  }

  async function createBackup() {
    const db = await openDatabase();
    const tx = db.transaction(["courses", "settings"], "readonly");
    const finished = transactionDone(tx);
    const [courses, record] = await Promise.all([
      requestResult(tx.objectStore("courses").getAll()),
      requestResult(tx.objectStore("settings").get("semester")),
    ]);
    await finished;
    return {
      format: "course-table-backup",
      version: 1,
      exported_at: new Date().toISOString(),
      settings: ensureSettings(record?.value),
      courses: sortCourses(courses),
    };
  }

  async function importData(payload, options = {}) {
    const {mode} = options;
    if (mode !== "merge" && mode !== "replace") throw new Error("请先选择导入方式");
    // Validate *everything* before starting a transaction; a bad row cannot partially import.
    const data = decodeImport(payload);
    if (mode === "replace" && data.kind !== "backup") {
      throw new Error("只有完整的 Course Table 备份才能覆盖当前数据");
    }
    const db = await openDatabase();
    if (mode === "replace") {
      const tx = db.transaction(["courses", "settings", "meta"], "readwrite");
      const finished = transactionDone(tx);
      const store = tx.objectStore("courses");
      store.clear();
      for (const course of data.courses) store.put(course);
      tx.objectStore("settings").put({key: "semester", value: data.settings});
      tx.objectStore("meta").put({key: "initialized", at: new Date().toISOString(), restored: true});
      await finished;
      return {mode: "replace", total: data.courses.length};
    }

    const tx = db.transaction("courses", "readwrite");
    const finished = transactionDone(tx);
    const store = tx.objectStore("courses");
    const existing = await requestResult(store.getAll());
    const signatures = new Set(existing.map(courseSignature));
    let added = 0;
    let skipped = 0;
    for (const course of data.courses) {
      const signature = courseSignature(course);
      if (signatures.has(signature)) {
        skipped++;
        continue;
      }
      if (existing.length + added >= MAX_IMPORT_COURSES) {
        tx.abort();
        await finished.catch(() => {});
        throw new Error("本地课程总数不能超过 5000 条");
      }
      signatures.add(signature);
      const {id: ignored, ...newCourse} = course;
      store.add(newCourse); // Never trust foreign IDs while merging.
      added++;
    }
    await finished;
    return {mode: "merge", added, skipped, total: existing.length + added};
  }

  // School Import V2: conservative, local-only three-way reconciliation.
  // Baseline is the LAST accepted school value, not a student's edited value.
  const FIELD_LABELS = Object.freeze({
    name: "课程名", teacher: "教师", classroom: "教室", weekday: "星期",
    start_section: "开始节", end_section: "结束节", start_week: "开始周",
    end_week: "结束周", note: "备注",
  });

  function toSchoolCourse(raw) {
    const cleaned = normalizeCourse(raw);
    delete cleaned.id;
    delete cleaned.schoolSync; // A remote response cannot assign local provenance.
    return cleaned;
  }

  function schoolInput(input) {
    if (!input || typeof input !== "object" || !Array.isArray(input.rows)) {
      throw new Error("学校课表预览格式无效");
    }
    const semester = String(input.semester || "").trim();
    if (!/^[0-9a-zA-Z_-]{3,40}$/.test(semester)) throw new Error("学校学期标识无效");
    if (input.rows.length === 0 || input.rows.length > MAX_IMPORT_COURSES) {
      throw new Error("学校课表应包含 1–5000 条记录");
    }
    const unique = new Map();
    for (const [index, raw] of input.rows.entries()) {
      const course = verifiedCourse(raw, index);
      const bare = toSchoolCourse(course);
      unique.set(courseSignature(bare), bare);
    }
    return {semester, rows: [...unique.values()], duplicates: input.rows.length - unique.size};
  }

  function courseCode(course) {
    return (String(course.note || "").match(/课程代码：([^；\n]+)/) || [])[1] || "";
  }
  function sameIdentity(a, b) {
    const ac = courseCode(a), bc = courseCode(b);
    if (ac && bc && ac !== bc) return false;
    return a.name === b.name && (a.teacher === b.teacher || (ac && ac === bc));
  }
  function makeMeta(semester, baseline) {
    return {schema: 1, semester, baseline: toSchoolCourse(baseline)};
  }

  // Only definite matches are linked automatically. A course with no provenance
  // is never fuzzily adopted: it could be a user's independent handmade course.
  function createSyncPlan(existing, input) {
    const normalized = schoolInput(input);
    const {semester, rows} = normalized;
    const linked = existing.filter(c => c.schoolSync);
    if (linked.some(c => c.schoolSync.semester !== semester)) {
      throw new Error("检测到其他学期的学校同步记录。请先备份并切换课表，不能跨学期直接覆盖。");
    }
    const used = new Set();
    const matched = new Map();
    const unresolved = new Set();
    const remoteUsed = new Set();

    function bind(r, local) {
      matched.set(r, local);
      used.add(local.id);
      remoteUsed.add(r);
    }

    // 1. Exact previous-school snapshot is most reliable, even after local edits.
    for (const remote of rows) {
      const matches = linked.filter(c => !used.has(c.id) &&
        courseSignature(c.schoolSync.baseline) === courseSignature(remote));
      if (matches.length === 1) bind(remote, matches[0]);
      else if (matches.length > 1) unresolved.add(remote);
    }

    // 2. A unique matching day/section for an already linked course can change
    // classroom, teacher, week range etc., if its identity is still recognizable.
    function pairUnique(predicate) {
      const pending = rows.filter(r => !remoteUsed.has(r) && !unresolved.has(r));
      const candidates = new Map(pending.map(r => [r, linked.filter(c =>
        !used.has(c.id) && sameIdentity(c.schoolSync.baseline, r) &&
        predicate(c.schoolSync.baseline, r))]));
      for (const r of pending) {
        const match = candidates.get(r);
        if (match.length !== 1) continue;
        const local = match[0];
        const competitors = pending.filter(other => candidates.get(other).some(c => c.id === local.id));
        if (competitors.length === 1) bind(r, local);
      }
    }
    pairUnique((a, b) => a.weekday === b.weekday && a.start_section === b.start_section && a.end_section === b.end_section);
    pairUnique((a, b) => a.weekday === b.weekday);
    pairUnique(() => true); // only when identity occurs exactly once on both sides

    // 3. Safely adopt exact legacy V1 rows without losing the user's edits.
    const untracked = existing.filter(c => !c.schoolSync);
    for (const remote of rows) {
      if (remoteUsed.has(remote) || unresolved.has(remote)) continue;
      const matches = untracked.filter(c => !used.has(c.id) && courseSignature(c) === courseSignature(remote));
      if (matches.length === 1) bind(remote, matches[0]);
      else if (matches.length > 1) unresolved.add(remote);
    }

    const operations = [];
    const details = [];
    const summary = {added: 0, updated: 0, linked: 0, unchanged: 0, conflicts: 0,
      ambiguous: 0, missing: 0, duplicates: normalized.duplicates};

    for (const remote of rows) {
      if (remoteUsed.has(remote)) {
        const current = matched.get(remote);
        if (!current.schoolSync) {
          operations.push({action: "update", course: {...current, schoolSync: makeMeta(semester, remote)}});
          summary.linked++;
          continue;
        }
        const base = current.schoolSync.baseline;
        const merged = {...current};
        const nextBaseline = {...base};
        const changes = [], conflicts = [];
        // Treat sections and week ranges as atomic groups. Mixing a student's
        // changed start with school's changed end could produce invalid dates.
        const groups = [
          ["name"], ["teacher"], ["classroom"],
          ["weekday", "start_section", "end_section"],
          ["start_week", "end_week"], ["note"],
        ];
        for (const group of groups) {
          const locallyChanged = group.some(f => current[f] !== base[f]);
          const schoolChanged = group.some(f => remote[f] !== base[f]);
          const identical = group.every(f => current[f] === remote[f]);
          if (!locallyChanged || identical) {
            for (const field of group) {
              if (current[field] !== remote[field]) {
                changes.push({field: FIELD_LABELS[field], before: current[field], after: remote[field]});
              }
              merged[field] = remote[field];
              nextBaseline[field] = remote[field];
            }
          } else if (schoolChanged) {
            const label = group.length === 1 ? FIELD_LABELS[group[0]] :
              (group.includes("weekday") ? "星期与节次" : "上课周数");
            conflicts.push({field: label,
              local: group.map(f => current[f]).join("/"),
              school: group.map(f => remote[f]).join("/")});
          }
        }
        merged.schoolSync = makeMeta(semester, nextBaseline);
        if (changes.length || conflicts.length ||
            courseSignature(nextBaseline) !== courseSignature(base)) {
          operations.push({action: "update", course: merged});
          if (changes.length) summary.updated++;
          summary.conflicts += conflicts.length;
          details.push({name: current.name, changes, conflicts});
        } else summary.unchanged++;
      } else if (unresolved.has(remote) || linked.some(c =>
        !used.has(c.id) && sameIdentity(c.schoolSync.baseline, remote))) {
        summary.ambiguous++;
        details.push({name: remote.name, ambiguous: true, changes: [], conflicts: []});
      } else {
        operations.push({action: "add", course: {...remote, schoolSync: makeMeta(semester, remote)}});
        summary.added++;
        details.push({name: remote.name, added: true, changes: [], conflicts: []});
      }
    }
    summary.missing = linked.filter(c => !used.has(c.id)).length;
    if (summary.missing) {
      details.push({name: `${summary.missing} 条原学校课程本次未出现`, missing: true, changes: [], conflicts: []});
    }
    if (existing.length + summary.added > MAX_IMPORT_COURSES) {
      throw new Error("同步后本地课程总数超过 5000 条");
    }
    return {semester, summary, details, operations};
  }

  async function inspectSchoolSync(input) {
    const existing = await getCourses();
    const plan = createSyncPlan(existing, input);
    // Detect edits between preview and confirmation (including other tabs).
    return {semester: plan.semester, summary: plan.summary, details: plan.details,
      snapshot: JSON.stringify(existing)};
  }

  async function applySchoolSync(input, expectedSnapshot) {
    if (typeof expectedSnapshot !== "string") throw new Error("请先预览本次更新");
    schoolInput(input); // Fully validate before starting any write transaction.
    const db = await openDatabase();
    const tx = db.transaction("courses", "readwrite");
    const finished = transactionDone(tx);
    try {
      const store = tx.objectStore("courses");
      const existing = sortCourses(await requestResult(store.getAll()));
      if (JSON.stringify(existing) !== expectedSnapshot) {
        tx.abort();
        await finished.catch(() => {});
        throw new Error("本地课表在预览后发生变化，请重新获取并预览学校课表");
      }
      const plan = createSyncPlan(existing, input);
      for (const op of plan.operations) {
        if (op.action === "add") store.add(op.course);
        else store.put(op.course);
      }
      await finished;
      return plan.summary;
    } catch (error) {
      if (!tx.error) {
        try { tx.abort(); } catch (_) { /* already closed */ }
      }
      await finished.catch(() => {});
      throw error;
    }
  }

  // 补充官方导出 HTML 中的独立备注。一次事务内更新，绝不修改课程其他字段。
  async function applyNoteUpdates(changes, expectedSnapshot) {
    if (!Array.isArray(changes) || changes.length < 1 || changes.length > 100 ||
        typeof expectedSnapshot !== "string") {
      throw new Error("请先预览学校备注。");
    }
    const ids = new Set();
    for (const item of changes) {
      if (!item || !Number.isSafeInteger(item.id) || item.id < 1 ||
          typeof item.before !== "string" || typeof item.after !== "string" ||
          item.after.length > 500 || ids.has(item.id)) {
        throw new Error("备注变更数据无效或超过 500 字。");
      }
      ids.add(item.id);
    }
    const db = await openDatabase();
    const tx = db.transaction("courses", "readwrite");
    const finished = transactionDone(tx);
    try {
      const store = tx.objectStore("courses");
      const all = sortCourses(await requestResult(store.getAll()));
      if (JSON.stringify(all) !== expectedSnapshot) {
        tx.abort();
        await finished.catch(() => {});
        throw new Error("预览后课表发生变化，请重新选择官方文件。");
      }
      const coursesById = new Map(all.map(c => [c.id, c]));
      for (const item of changes) {
        const current = coursesById.get(item.id);
        if (!current || String(current.note || "") !== item.before) {
          tx.abort();
          await finished.catch(() => {});
          throw new Error("课程内容已变化，请重新预览。");
        }
        store.put({...current, note: item.after});
      }
      await finished;
      return {updated: changes.length};
    } catch (error) {
      try { tx.abort(); } catch (_) { /* transaction already settled */ }
      await finished.catch(() => {});
      throw error;
    }
  }

  // School HTML Import V1: replace the current semester atomically after a
  // separately downloaded backup and explicit, fresh-data confirmation.
  async function replaceSemesterFromHtml(payload, expectedSnapshot) {
    if (!payload || !Array.isArray(payload.courses) ||
        payload.courses.length < 1 || payload.courses.length > MAX_IMPORT_COURSES) {
      throw new Error('学校课表必须包含 1–5000 条有效课程。');
    }
    const courses = payload.courses.map(verifiedCourse).map(c => {
      const {id, schoolSync, ...clean} = c;
      return clean; // 学校文件不能带入其他学期的本地 ID 或同步基线
    });
    const semester = verifiedSettings(payload.settings);
    if (!semester.start_date) throw new Error('请填写新学期第 1 周的周一日期。');
    const [year, month, day] = semester.start_date.split('-').map(Number);
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() !== 1) {
      throw new Error('新学期第一周必须从星期一开始。');
    }
    if (courses.some(c => c.end_week > semester.total_weeks)) {
      throw new Error('学期总周数不能小于最后一门课的结束周次。');
    }
    if (typeof expectedSnapshot !== 'string' || !expectedSnapshot) {
      throw new Error('缺少导入前的数据快照，请重新选择文件。');
    }
    const db = await openDatabase();
    const tx = db.transaction(['courses', 'settings', 'meta'], 'readwrite');
    const finished = transactionDone(tx);
    try {
      const store = tx.objectStore('courses');
      const currentCourses = sortCourses(await requestResult(store.getAll()));
      const currentSemester = ensureSettings((await requestResult(tx.objectStore('settings').get('semester')))?.value);
      if (JSON.stringify({courses: currentCourses, settings: currentSemester}) !== expectedSnapshot) {
        tx.abort();
        await finished.catch(() => {});
        throw new Error('预览后本地课程或学期设置已变化，请重新预览并备份。');
      }
      store.clear();
      courses.forEach(c => store.add(c));
      tx.objectStore('settings').put({key: 'semester', value: semester});
      tx.objectStore('meta').put({key: 'initialized', at: new Date().toISOString(), htmlImported: true});
      await finished;
      return {total: courses.length, semester};
    } catch (error) {
      try { tx.abort(); } catch (_) { /* transaction may have settled */ }
      await finished.catch(() => {});
      throw error;
    }
  }

  root.CourseStore = Object.freeze({
    initialize, getCourses, getSettings, putSettings, saveCourse, deleteCourse,
    createBackup, inspectImport, importData, inspectSchoolSync, applySchoolSync, applyNoteUpdates, replaceSemesterFromHtml,
  });
})(window);
