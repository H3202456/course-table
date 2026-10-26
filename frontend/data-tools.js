/* Course Table · Local Data V2 / backup, inspect, merge and restore UI.
 * School authentication or credentials never enter this module.
 */
(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('dataDialog');
  const fileInput = $('importJsonFile');
  const preview = $('importPreview');
  const status = $('dataStatus');
  const selection = $('importMode');
  const confirmInput = $('replaceConfirm');
  const importAction = $('confirmImportBtn');
  const panelActions = [
    $('exportBackupBtn'), $('selectImportBtn'), $('confirmImportBtn'),
    $('fetchSchoolCoursesBtn'), $('selectSchoolNotesBtn'), $('applySchoolNotesBtn'),
    $('editSemesterBtn'), $('saveSemesterBtn'), $('cancelSemesterBtn'),
    ...document.querySelectorAll('.data-open-btn'),
  ];

  const semesterForm = $('semesterForm');
  const semesterSummary = $('semesterSummary');
  const semesterNameInput = $('semesterNameInput');
  const semesterStartInput = $('semesterStartInput');
  const semesterWeeksInput = $('semesterWeeksInput');
  let semesterOpening = false;

  function showSemesterForm(show) {
    semesterForm.hidden = !show;
    dialog.classList.toggle('semester-editing', show);
    $('dataDialogTitle').textContent = show ? '学期设置' : '备份与恢复';
    if (dialog.open) dialog.scrollTop = 0;
  }

  async function refreshSemesterSummary() {
    try {
      const semester = await root.CourseStore.getSettings();
      semesterSummary.textContent = semester.start_date
        ? `${semester.name} · 首周 ${semester.start_date} · 共 ${semester.total_weeks} 周`
        : '尚未设置第一周日期，课表周次会错位';
      return semester;
    } catch (error) {
      semesterSummary.textContent = '学期设置读取失败，请刷新后重试';
      throw error;
    }
  }

  $('editSemesterBtn').addEventListener('click', async () => {
    if (busy || semesterOpening) return;
    if (!semesterForm.hidden) { showSemesterForm(false); return; }
    semesterOpening = true;
    try {
      const semester = await refreshSemesterSummary();
      semesterNameInput.value = semester.name || '当前学期';
      semesterStartInput.value = semester.start_date || '2026-09-07';
      semesterWeeksInput.value = String(semester.total_weeks || 20);
      showSemesterForm(true);
      message('请确认首周周一日期。课程记录本身不会改变。');
    } catch (error) {
      message(error.message || '无法读取学期设置', true);
    } finally {
      semesterOpening = false;
    }
  });

  $('cancelSemesterBtn').addEventListener('click', () => {
    if (!busy) showSemesterForm(false);
  });

  semesterForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const name = semesterNameInput.value.trim();
    const start_date = semesterStartInput.value;
    const total_weeks = Number(semesterWeeksInput.value);
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(start_date) ||
        !Number.isInteger(total_weeks) || total_weeks < 1 || total_weeks > 60) {
      message('请填写有效的学期名称、日期及总周数。', true);
      return;
    }
    const [year, month, day] = start_date.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.toISOString().slice(0, 10) !== start_date || date.getUTCDay() !== 1) {
      message('请将首周日期设为周一，例如 2026-09-07。', true);
      return;
    }
    setBusy(true);
    try {
      await root.CourseStore.putSettings({name, start_date, total_weeks});
      await refreshSemesterSummary();
      message('学期设置已保存，正在重新计算课表…');
      setTimeout(() => root.location.reload(), 400);
    } catch (error) {
      message(error.message || '学期设置保存失败。', true);
      setBusy(false);
    }
  });

  let proposed = null;
  let busy = false;
  let source = null;
  let syncInput = null;
  let syncPreview = null;
  const isLocal = ['localhost', '127.0.0.1', '::1'].includes(root.location.hostname);
  $('localSchoolImportFeature').hidden = !isLocal;

  function message(value, isError = false) {
    status.textContent = value || '';
    status.classList.toggle('error', isError);
  }

  let noteChanges = null;
  let noteSnapshot = null;
  const notesFile = $('schoolNotesFile');
  const notesPreview = $('schoolNotesPreview');

  // 官方的“Excel”下载可能实际上是 HTML 表格；只取最后的「备注」行。
  // 不执行源文件脚本，也不向任何网络发送文件或个人信息。
  function extractSchoolNotes(html) {
    if (!/<(?:html|table|tbody|tr)[\s>]/i.test(html)) {
      throw new Error('文件不是学校导出的 HTML 课表；标准 XLSX 暂不支持此入口。');
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const noteRow = [...doc.querySelectorAll('tr')].find(tr =>
      tr.cells?.[0]?.textContent?.trim() === '备注');
    if (!noteRow) throw new Error('未在官方课表末尾找到「备注」行。');
    const cell = noteRow.querySelector('td.bzxx') || noteRow.cells?.[1];
    if (!cell) throw new Error('学校备注行为空。');
    function readableText(node) {
      if (node.nodeType === 3) return node.nodeValue || '';
      if (node.nodeType !== 1) return '';
      if (node.tagName === 'BR') return '\n';
      return [...node.childNodes].map(readableText).join('');
    }
    const entries = [];
    for (const line of readableText(cell).split(/\n+/)) {
      const match = line.trim().match(/^课程名：\s*(.*?)\s*\|\s*上课教师：\s*(.*?)\s*\|\s*备注信息：\s*(.+)$/);
      if (!match) continue;
      entries.push({name: match[1].trim(), teacher: match[2].trim(), note: match[3].trim()});
    }
    if (!entries.length) throw new Error('找到了备注行，但没有识别到课程备注条目。');
    return entries;
  }

  function buildSchoolNotePlan(entries, courses) {
    const trimKey = s => String(s || '').replace(/\s+/g, '').toLowerCase();
    const changes = [], skipped = [];
    const weekdayNumber = {一:1, 二:2, 三:3, 四:4, 五:5, 六:6, 日:7, 天:7};
    for (const entry of entries) {
      const name = trimKey(entry.name), teacher = trimKey(entry.teacher);
      let candidates = courses.filter(c => trimKey(c.teacher) === teacher &&
        (trimKey(c.name) === name || name.startsWith(trimKey(c.name) + '（')));
      // 同名同教师多段排课时，必须进一步核对官方的时间信息。
      if (candidates.length > 1) {
        const when = entry.note.match(/(\d+)-(\d+)周\s*星期([一二三四五六日天])\s*第(\d+)-(\d+)节/);
        if (when) candidates = candidates.filter(c =>
          c.start_week === Number(when[1]) && c.end_week === Number(when[2]) &&
          c.weekday === weekdayNumber[when[3]] &&
          c.start_section === Number(when[4]) && c.end_section === Number(when[5]));
      }
      if (candidates.length !== 1) {
        skipped.push(`${entry.name}：${candidates.length ? '有多条匹配课程，需手动核对' : '本地找不到对应课程'}`);
        continue;
      }
      const current = candidates[0];
      const before = String(current.note || '');
      if (before.includes(entry.note)) {
        skipped.push(`${entry.name}：备注已存在`);
        continue;
      }
      const after = before ? `${before}\n学校备注：${entry.note}` : `学校备注：${entry.note}`;
      if (after.length > 500) {
        skipped.push(`${entry.name}：合并后超过 500 字，未覆盖原备注`);
        continue;
      }
      if (changes.some(c => c.id === current.id)) {
        skipped.push(`${entry.name}：对应课程重复，未自动合并`);
        continue;
      }
      changes.push({id: current.id, name: current.name, before, after});
    }
    return {changes, skipped};
  }

  $('selectSchoolNotesBtn').addEventListener('click', () => {
    if (!busy) notesFile.click();
  });
  notesFile.addEventListener('change', async () => {
    const file = notesFile.files?.[0];
    notesFile.value = '';
    if (!file || busy) return;
    clearImport();
    setBusy(true);
    message('正在本地解析学校导出的课表备注…');
    try {
      if (!file.size || file.size > 4 * 1024 * 1024) throw new Error('文件必须为 1 B–4 MB。');
      const raw = await file.text();
      const entries = extractSchoolNotes(raw);
      const courses = await root.CourseStore.getCourses();
      const plan = buildSchoolNotePlan(entries, courses);
      noteChanges = plan.changes;
      noteSnapshot = JSON.stringify(courses);
      $('schoolNotesSummary').textContent = `官方备注 ${entries.length} 条，可安全补充 ${plan.changes.length} 条，跳过 ${plan.skipped.length} 条。仅增加备注，不覆盖课程代码、时间和个人编辑。`;
      const list = $('schoolNotesItems');
      list.replaceChildren();
      for (const item of plan.changes) {
        const row = document.createElement('div');
        row.className = 'school-sync-item';
        const name = document.createElement('strong');
        name.textContent = item.name;
        const desc = document.createElement('span');
        desc.textContent = item.after;
        row.append(name, desc);
        list.append(row);
      }
      for (const skipped of plan.skipped) {
        const row = document.createElement('div');
        row.className = 'school-sync-item conflict';
        row.textContent = skipped;
        list.append(row);
      }
      notesPreview.hidden = false;
      $('applySchoolNotesBtn').disabled = plan.changes.length === 0;
      message('请先检查补充内容，确认后才会更新本地课程。');
    } catch (error) {
      noteChanges = null;
      noteSnapshot = null;
      notesPreview.hidden = true;
      message(error.message || '无法识别学校备注。', true);
    } finally {
      setBusy(false);
    }
  });

  $('applySchoolNotesBtn').addEventListener('click', async () => {
    if (!noteChanges?.length || busy) return;
    setBusy(true);
    try {
      const result = await root.CourseStore.applyNoteUpdates(noteChanges, noteSnapshot);
      message(`已安全补充 ${result.updated} 条学校备注，正在刷新课程详情…`);
      setTimeout(() => root.location.reload(), 500);
    } catch (error) {
      message(error.message || '备注补充失败；未覆盖原有课程。', true);
      setBusy(false);
    }
  });

  function clearImport() {
    noteChanges = null;
    noteSnapshot = null;
    notesPreview.hidden = true;
    $('applySchoolNotesBtn').disabled = true;
    $('schoolNotesItems').replaceChildren();
    proposed = null;
    source = null;
    syncInput = null;
    syncPreview = null;
    $('schoolSyncChanges').hidden = true;
    $('schoolSyncChanges').replaceChildren();
    $('importModeLabel').hidden = false;
    selection.hidden = false;
    $('schoolImportNotice').hidden = true;
    $('schoolTermConfirmRow').hidden = true;
    $('schoolTermConfirm').checked = false;
    fileInput.value = '';
    preview.hidden = true;
    confirmInput.checked = false;
    selection.value = 'merge';
  }

  function updateImportControls() {
    if (!proposed && !syncPreview) return;
    const replace = source !== 'school' && selection.value === 'replace';
    $('replaceWarning').hidden = !replace;
    $('schoolImportNotice').hidden = source !== 'school';
    $('schoolTermConfirmRow').hidden = source !== 'school';
    $('confirmRow').hidden = !replace;
    importAction.disabled = busy || (replace && !confirmInput.checked) ||
      (source === 'school' && !$('schoolTermConfirm').checked);
    importAction.textContent = source === 'school' ? '确认应用学校更新' :
      (replace ? '确认恢复完整备份' : '合并课程到本地');
  }

  function setBusy(value) {
    busy = value;
    panelActions.forEach(btn => { btn.disabled = busy; });
    $('closeDataDialogBtn').disabled = busy;
    selection.disabled = busy;
    confirmInput.disabled = busy;
    $('schoolTermConfirm').disabled = busy;
    $('applySchoolNotesBtn').disabled = busy || !noteChanges?.length;
    if (!busy) updateImportControls();
  }

  document.querySelectorAll('.data-open-btn').forEach(button => {
    button.addEventListener('click', () => {
      if (busy) return;
      clearImport();
      message('');
      showSemesterForm(false);
      refreshSemesterSummary().catch(error => console.warn('学期设置无法读取', error));
      dialog.showModal();
    });
  });

  $('closeDataDialogBtn').addEventListener('click', () => {
    if (!busy) dialog.close();
  });
  dialog.addEventListener('cancel', event => {
    if (busy) event.preventDefault();
  });
  dialog.addEventListener('click', event => {
    if (!busy && event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => { clearImport(); showSemesterForm(false); });

  $('exportBackupBtn').addEventListener('click', async () => {
    setBusy(true);
    message('正在整理本地课表…');
    try {
      const backup = await root.CourseStore.createBackup();
      const content = JSON.stringify(backup, null, 2) + '\n';
      const file = new Blob([content], {type: 'application/json;charset=utf-8'});
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');
      const when = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      link.href = url;
      link.download = `course-table-backup-${when}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      message(`备份文件已生成，包含 ${backup.courses.length} 条课程。请妥善保存。`);
    } catch (error) {
      console.error('导出失败', error);
      message(error.message || '导出失败，请重试。', true);
    } finally {
      setBusy(false);
    }
  });

  $('selectImportBtn').addEventListener('click', () => {
    if (busy) return;
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    clearImport();
    if (!file) return;
    message('正在检查导入文件…');
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('JSON 文件不能超过 2 MB。');
      if (file.size === 0) throw new Error('这个文件是空的。');
      const text = await file.text();
      const raw = JSON.parse(text);
      proposed = root.CourseStore.inspectImport(raw);
      source = 'file';
      const isBackup = proposed.kind === 'backup';
      $('importSummary').textContent = isBackup
        ? `检测到 Course Table 完整备份：${proposed.count} 条课程，学期「${proposed.semesterName}」。合并仅添加课程，不改变学期设置；完整恢复才恢复学期。`
        : `检测到课程数据：${proposed.count} 条课程（无学期设置）。请在上方「设置学期」填写首周日期。`;
      $('restoreOption').hidden = !isBackup;
      selection.value = 'merge';
      confirmInput.checked = false;
      preview.hidden = false;
      updateImportControls();
      message('文件校验通过。请选择导入方式。');
    } catch (error) {
      clearImport();
      console.error('无法读取导入文件', error);
      message(`文件无法导入：${error instanceof SyntaxError ? 'JSON 格式不正确' : error.message}`, true);
    } finally {
      fileInput.value = '';
    }
  });

  function renderSchoolChanges(report) {
    const {summary, details} = report;
    const host = $('schoolSyncChanges');
    host.replaceChildren();
    const count = document.createElement('p');
    count.className = 'school-sync-count';
    count.textContent = `新增 ${summary.added} · 更新 ${summary.updated} · 关联旧记录 ${summary.linked} · 未变 ${summary.unchanged}`;
    host.appendChild(count);
    const caution = document.createElement('p');
    caution.textContent = `字段冲突 ${summary.conflicts} · 无法匹配 ${summary.ambiguous} · 学校未返回的旧课 ${summary.missing}（保留）`;
    host.appendChild(caution);
    for (const entry of details.slice(0, 8)) {
      const item = document.createElement('div');
      item.className = 'school-sync-item' + (entry.conflicts.length || entry.ambiguous ? ' conflict' : '');
      const label = document.createElement('strong');
      label.textContent = entry.name;
      item.appendChild(label);
      const description = document.createElement('span');
      if (entry.ambiguous) description.textContent = '对应关系不明确：已跳过，需手动核对';
      else if (entry.missing) description.textContent = '未自动删除，避免误删课程';
      else if (entry.added) description.textContent = '新增学校排课';
      else description.textContent = [
        ...entry.changes.map(c => `${c.field}：${String(c.before || '无')} → ${String(c.after || '无')}`),
        ...entry.conflicts.map(c => `${c.field}冲突：保留本地「${c.local}」，学校为「${c.school}」`),
      ].join('；');
      item.appendChild(description);
      host.appendChild(item);
    }
    if (details.length > 8) {
      const more = document.createElement('p');
      more.textContent = `另外还有 ${details.length - 8} 条变更未展开。`;
      host.appendChild(more);
    }
    host.hidden = false;
  }

  // 本机开发阶段：使用服务器环境变量里的临时 Cookie 只读获取学校课表。
  // 真实学生登录尚未接入。切勿把本开发接口部署到公网上。
  $('fetchSchoolCoursesBtn').addEventListener('click', async () => {
    if (busy || !isLocal) return;
    clearImport();
    setBusy(true);
    message('正在从学校获取课表，这可能需要几秒钟…');
    try {
      const response = await root.fetch('/api/szpu/local-preview', {
        method: 'POST',
        headers: {'X-Course-Table-Local-Import': '1'},
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!response.ok) {
        let detail = '';
        try { detail = (await response.json()).detail || ''; } catch (_) {}
        throw new Error(detail || `学校导入请求失败（HTTP ${response.status}）`);
      }
      const result = await response.json();
      if (!result?.success || !Array.isArray(result.rows) || result.rows.length === 0) {
        throw new Error('学校没有返回可导入的课程。');
      }
      syncInput = {semester: result.semester, rows: result.rows};
      syncPreview = await root.CourseStore.inspectSchoolSync(syncInput);
      source = 'school';
      selection.value = 'merge';
      $('restoreOption').hidden = true;
      $('importModeLabel').hidden = true;
      selection.hidden = true;
      const localSemester = await root.CourseStore.getSettings();
      $('importSummary').textContent = `SZPU 学期 ${result.semester || '未知'}：原始 ${result.raw_rows} 条，标准化 ${result.rows.length} 条排课。当前本地学期：「${localSemester.name || '未设置'}」。`;
      renderSchoolChanges(syncPreview);
      preview.hidden = false;
      updateImportControls();
      message('预览完成。请检查变更、冲突和学期，再确认应用。');
    } catch (error) {
      clearImport();
      console.error('本机 SZPU 预览失败', error);
      message(error.message || '学校课表预览失败。', true);
    } finally {
      setBusy(false);
    }
  });

  $('schoolTermConfirm').addEventListener('change', updateImportControls);
  selection.addEventListener('change', () => {
    confirmInput.checked = false;
    updateImportControls();
  });
  confirmInput.addEventListener('change', updateImportControls);

  importAction.addEventListener('click', async () => {
    if ((!proposed && !syncPreview) || busy) return;
    const mode = selection.value;
    if (source !== 'school' && mode === 'replace' && !confirmInput.checked) return;
    if (source === 'school' && !$('schoolTermConfirm').checked) return;
    setBusy(true);
    message(source === 'school' ? '正在安全应用学校更新…' :
      (mode === 'replace' ? '正在恢复完整备份…' : '正在合并课程…'));
    try {
      if (source === 'school') {
        const outcome = await root.CourseStore.applySchoolSync(syncInput, syncPreview.snapshot);
        message(`学校更新完成：新增 ${outcome.added}，更新 ${outcome.updated}，保留 ${outcome.conflicts} 个冲突字段；未删除旧课程。正在刷新…`);
      } else {
        const outcome = await root.CourseStore.importData(proposed.payload, {mode});
        if (mode === 'replace') {
          message(`恢复成功：${outcome.total} 条课程及学期设置。正在刷新…`);
        } else {
          message(`导入成功：新增 ${outcome.added} 条，跳过 ${outcome.skipped} 条重复课程。正在刷新…`);
        }
      }
      setTimeout(() => root.location.reload(), 900);
    } catch (error) {
      console.error('本地导入失败', error);
      message(error.message || '导入失败，原数据没有被替换。', true);
      setBusy(false);
    }
  });
})(window);
