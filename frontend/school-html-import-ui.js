/* Course Table · SZPU School HTML Import V1
 * Local file only. Explicit old-term download + confirmation before atomic replace.
 */
(function (root) {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('dataDialog');
  const input = $('schoolHtmlFile');
  const summary = $('schoolHtmlSummary');
  const preview = $('schoolHtmlPreview');
  const name = $('newSemesterName');
  const dateInput = $('newSemesterStart');
  const weeksInput = $('newSemesterWeeks');
  const backupButton = $('downloadOldSemesterBtn');
  const checkbox = $('schoolHtmlBackupConfirm');
  const applyButton = $('applySchoolHtmlBtn');
  let proposed = null;
  let baseline = '';
  let downloaded = false;
  let busy = false;

  function say(text, error = false) {
    const status = $('dataStatus');
    status.textContent = text;
    status.classList.toggle('error', error);
  }
  function setBusy(value) {
    busy = value;
    for (const id of ['selectSchoolHtmlBtn', 'downloadOldSemesterBtn', 'applySchoolHtmlBtn', 'cancelSchoolHtmlBtn']) {
      const btn = $(id);
      btn.disabled = value;
    }
    checkbox.disabled = value || !downloaded;
    if (!value) updateAction();
  }
  function updateAction() {
    applyButton.disabled = !proposed || !downloaded || !checkbox.checked || busy;
  }
  function reset() {
    proposed = null;
    baseline = '';
    downloaded = false;
    checkbox.checked = false;
    checkbox.disabled = true;
    preview.hidden = true;
    $('schoolHtmlSamples').replaceChildren();
    $('schoolHtmlWarnings').hidden = true;
    dialog.classList.remove('school-html-importing');
    $('dataDialogTitle').textContent = '备份与恢复';
    input.value = '';
    updateAction();
  }
  function renderSamples(rows, notes = []) {
    const holder = $('schoolHtmlSamples');
    holder.replaceChildren();
    const days = ['','周一','周二','周三','周四','周五','周六','周日'];
    for (const row of rows.slice(0, 7)) {
      const box = document.createElement('div');
      box.className = 'school-html-sample';
      const title = document.createElement('strong');
      title.textContent = row.name;
      const detail = document.createElement('span');
      detail.textContent = `${days[row.weekday]} · 第 ${row.start_section}–${row.end_section} 节 · 第 ${row.start_week}–${row.end_week} 周 · ${row.classroom || '教室待定'}`;
      box.append(title, detail);
      holder.append(box);
    }
    for (const note of notes.slice(0, 3)) {
      const box = document.createElement('div');
      box.className = 'school-html-sample';
      const title = document.createElement('strong');
      title.textContent = `官方备注 · ${note.name}`;
      const detail = document.createElement('span');
      detail.textContent = note.text;
      box.append(title, detail);
      holder.append(box);
    }
  }
  function downloadedOldBackup(backup) {
    const json = JSON.stringify(backup, null, 2) + '\n';
    const blob = new Blob([json], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `course-table-before-new-semester-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  $('selectSchoolHtmlBtn').addEventListener('click', () => {
    if (!busy) input.click();
  });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file || busy) return;
    reset();
    setBusy(true);
    say('正在本地解析学校课表…');
    try {
      if (!file.size || file.size > 4 * 1024 * 1024) {
        throw new Error('学校 HTML 文件大小必须在 1 B–4 MB 之间。');
      }
      const parsed = root.SchoolHtmlParser.parse(await file.text());
      const backup = await root.CourseStore.createBackup();
      baseline = JSON.stringify({courses: backup.courses, settings: backup.settings});
      proposed = parsed;
      name.value = '';
      dateInput.value = '';
      weeksInput.value = String(Math.max(20, parsed.maxCourseWeek));
      summary.textContent = `识别到 ${parsed.rows.length} 条排课，课程最晚到第 ${parsed.maxCourseWeek} 周，原文件共有 ${parsed.weeksInFile} 周（空白周不会生成课程）；官方独立备注 ${parsed.noteEntries} 条。当前本地有 ${backup.courses.length} 条课程，切换后将不再显示。`;
      renderSamples(parsed.rows, parsed.notes);
      const warn = $('schoolHtmlWarnings');
      warn.textContent = parsed.warnings.join('；');
      warn.hidden = !parsed.warnings.length;
      dialog.classList.add('school-html-importing');
      $('dataDialogTitle').textContent = '导入学校课表';
      preview.hidden = false;
      dialog.scrollTop = 0;
      say('解析完成。填写新学期信息，先下载旧学期备份，再确认切换。');
    } catch (error) {
      reset();
      say(error.message || '学校课表解析失败，未修改本地数据。', true);
    } finally {
      setBusy(false);
    }
  });
  backupButton.addEventListener('click', async () => {
    if (!proposed || busy) return;
    setBusy(true);
    try {
      const backup = await root.CourseStore.createBackup();
      const fresh = JSON.stringify({courses: backup.courses, settings: backup.settings});
      if (fresh !== baseline) {
        throw new Error('课表在预览后发生变化，请重新选择学校 HTML 文件。');
      }
      downloadedOldBackup(backup);
      downloaded = true;
      say(`已生成旧学期完整备份（${backup.courses.length} 条）。请确认下载完成并妥善保存后勾选。`);
    } catch (error) {
      downloaded = false;
      checkbox.checked = false;
      say(error.message || '旧学期备份失败。', true);
    } finally {
      setBusy(false);
    }
  });
  checkbox.addEventListener('change', updateAction);
  $('cancelSchoolHtmlBtn').addEventListener('click', () => { if (!busy) { reset(); say('已返回数据管理；原课程没有改变。'); } });
  dialog.addEventListener('close', reset);
  applyButton.addEventListener('click', async () => {
    if (busy || !proposed || !downloaded || !checkbox.checked) return;
    const semesterName = name.value.trim();
    const start_date = dateInput.value;
    const total_weeks = Number(weeksInput.value);
    if (!semesterName || !/^\d{4}-\d{2}-\d{2}$/.test(start_date) ||
        !Number.isInteger(total_weeks) || total_weeks < proposed.maxCourseWeek || total_weeks > 60) {
      say('请填写有效的学期名称、第一周周一日期和足够的学期总周数。', true);
      return;
    }
    const [y,m,d] = start_date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m-1, d));
    if (dt.toISOString().slice(0,10) !== start_date || dt.getUTCDay() !== 1) {
      say('第一周日期必须是真实日期，且必须是周一。', true);
      return;
    }
    // Prevent accidental navigation while the single IndexedDB transaction runs.
    setBusy(true);
    say('正在原子切换新学期；请勿关闭页面…');
    try {
      const current = await root.CourseStore.getSettings();
      if (current.start_date && current.start_date === start_date) {
        throw new Error('新旧学期首周日期相同。如果只是更新本学期，请不要选择“切换新学期”。');
      }
      const result = await root.CourseStore.replaceSemesterFromHtml({
        courses: proposed.rows,
        settings: {name: semesterName, start_date, total_weeks},
      }, baseline);
      say(`切换成功：${result.total} 条新学期课程已保存，正在刷新页面…`);
      setTimeout(() => root.location.reload(), 750);
    } catch (error) {
      say(error.message || '切换新学期失败，当前课程未被替换。', true);
      setBusy(false);
    }
  });
})(window);
