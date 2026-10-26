/* SZPU 学生课表 HTML 导出解析器（纯本地，不执行 HTML 中的脚本）。
 * 支持按“周次 × 星期(7) × 节次(12)”输出的 Excel/HTML 表格，
 * 正确处理跨周 rowspan 和跨节 colspan；非连续周次拆成多条课程。
 */
(function (root) {
  'use strict';
  const DAYS = {一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7};
  const key = v => String(v || '').replace(/\s+/g, '').toLowerCase();

  function textWithBreaks(node) {
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';
    if (node.tagName === 'BR') return '\n';
    return [...node.childNodes].map(textWithBreaks).join('');
  }
  function notesFor(table) {
    const row = [...table.querySelectorAll('tbody tr')].find(tr =>
      tr.cells?.[0]?.textContent?.trim() === '备注');
    const cell = row?.querySelector('td.bzxx') || row?.cells?.[1];
    if (!cell) return [];
    const notes = [];
    for (const line of textWithBreaks(cell).split(/\n+/)) {
      const m = line.trim().match(/^课程名：\s*(.*?)\s*\|\s*上课教师：\s*(.*?)\s*\|\s*备注信息：\s*(.+)$/);
      if (m) notes.push({name: m[1].trim(), teacher: m[2].trim(), text: m[3].trim()});
    }
    return notes;
  }
  function splitCell(text) {
    const pieces = text.split('/').map(x => x.trim());
    if (pieces.length < 2) throw new Error(`课程单元格缺少“课程名/教师”结构：${text.slice(0, 28)}`);
    const classroom = pieces.length > 2 ? pieces.pop() : '';
    const teacher = pieces.pop();
    const name = pieces.join('/');
    if (!name || !teacher) throw new Error(`课程或教师信息缺失：${text.slice(0, 28)}`);
    return {name, teacher, classroom};
  }
  function parse(html) {
    if (typeof html !== 'string' || html.length > 4 * 1024 * 1024 ||
        !/<table\b/i.test(html)) throw new Error('请选择学校导出的 HTML 表格（不支持真正的二进制 XLSX）。');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = doc.querySelector('table.excelTable');
    if (!table) throw new Error('没有找到 SZPU 官方学生课表的表格，请检查导出文件。');
    const header = table.querySelector('thead');
    const headers = header?.textContent || '';
    if (!headers.includes('周一') || !headers.includes('周日') || !headers.includes('12')) {
      throw new Error('不是预期的 7 天 × 12 节课表结构。');
    }
    const trs = [...table.querySelectorAll('tbody tr')];
    const weekRows = trs.filter(tr => /^第\s*\d+\s*周$/.test(tr.cells?.[0]?.textContent?.trim() || ''));
    if (!weekRows.length || weekRows.length > 60) throw new Error('未识别到有效的学期周次。');
    const weeks = weekRows.length;
    // 首列是“第 N 周”，后续列依次为每个工作日 12 节，共 85 个栅格。
    const occupancy = Array.from({length: weeks}, () => Array(85).fill(false));
    const bySchedule = new Map();
    let blocks = 0;
    for (let wi = 0; wi < weeks; wi++) {
      const cells = [...weekRows[wi].cells];
      const label = cells.shift().textContent.trim();
      const number = Number(label.match(/\d+/)[0]);
      if (number !== wi + 1) throw new Error('官方课表周次不连续，已终止导入。');
      occupancy[wi][0] = true;
      let column = 1;
      for (const cell of cells) {
        while (column < 85 && occupancy[wi][column]) column++;
        const cs = Number(cell.getAttribute('colspan') || 1);
        const rs = Number(cell.getAttribute('rowspan') || 1);
        if (!Number.isInteger(cs) || !Number.isInteger(rs) || cs < 1 || rs < 1 ||
            column + cs > 85 || wi + rs > weeks) {
          throw new Error(`第 ${number} 周表格存在越界合并单元格。`);
        }
        for (let w = wi; w < wi + rs; w++) {
          for (let c = column; c < column + cs; c++) {
            if (occupancy[w][c]) throw new Error(`第 ${number} 周存在重叠的课程单元格。`);
            occupancy[w][c] = true;
          }
        }
        const text = cell.textContent.replace(/\s+/g, ' ').trim();
        if (text) {
          const weekday = Math.floor((column - 1) / 12) + 1;
          const endDay = Math.floor((column + cs - 2) / 12) + 1;
          if (weekday !== endDay) throw new Error(`第 ${number} 周有一门课跨越星期边界。`);
          const start_section = ((column - 1) % 12) + 1;
          const end_section = start_section + cs - 1;
          const {name, teacher, classroom} = splitCell(text);
          const groupKey = JSON.stringify([name, teacher, classroom, weekday, start_section, end_section]);
          if (!bySchedule.has(groupKey)) bySchedule.set(groupKey, {
            name, teacher, classroom, weekday, start_section, end_section, weeks: new Set(),
          });
          for (let week = wi + 1; week <= wi + rs; week++) bySchedule.get(groupKey).weeks.add(week);
          blocks++;
        }
        column += cs;
      }
      if (!occupancy[wi].every(Boolean)) throw new Error(`第 ${number} 周的表格节次不完整。`);
    }
    const rows = [];
    for (const group of bySchedule.values()) {
      const sorted = [...group.weeks].sort((a, b) => a - b);
      let start = sorted[0], end = sorted[0];
      for (const week of [...sorted.slice(1), null]) {
        if (week !== null && week === end + 1) { end = week; continue; }
        const course = {
          name: group.name, teacher: group.teacher, classroom: group.classroom,
          weekday: group.weekday, start_section: group.start_section,
          end_section: group.end_section, start_week: start, end_week: end, note: '',
        };
        rows.push(course);
        start = end = week;
      }
    }
    rows.sort((a, b) => a.weekday - b.weekday || a.start_section - b.start_section || a.start_week - b.start_week || a.name.localeCompare(b.name, 'zh'));
    if (!rows.length) throw new Error('未从官方表格中提取到课程，请核对文件。');
    if (rows.length > 5000) throw new Error('课表课程数量超过限制。');
    const noteEntries = notesFor(table);
    const warnings = [];
    for (const entry of noteEntries) {
      let matches = rows.filter(c => key(c.name) === key(entry.name) && key(c.teacher) === key(entry.teacher));
      // 教务备注标题有时比课程表标题多一段括号说明。
      if (!matches.length) matches = rows.filter(c => key(c.teacher) === key(entry.teacher) &&
        (key(entry.name).startsWith(key(c.name) + '（') || key(c.name).startsWith(key(entry.name) + '（')));
      const m = entry.text.match(/(\d+)\s*-\s*(\d+)\s*周\s*星期([一二三四五六日天])\s*第\s*(\d+)\s*-\s*(\d+)\s*节/);
      if (m) {
        matches = matches.filter(c => c.weekday === DAYS[m[3]] &&
          c.start_section === Number(m[4]) && c.end_section === Number(m[5]) &&
          c.start_week >= Number(m[1]) && c.end_week <= Number(m[2]));
      }
      if (!matches.length) { warnings.push(`${entry.name}：官方备注未匹配到课程，请手动核对。`); continue; }
      for (const course of matches) {
        const note = `学校备注：${entry.text}`;
        if (note.length > 500) throw new Error(`课程“${course.name}”的官方备注超过 500 字，请手动处理。`);
        course.note = note;
      }
    }
    return {rows, warnings, weeksInFile: weeks, maxCourseWeek: Math.max(...rows.map(r => r.end_week)),
      sourceBlocks: blocks, noteEntries: noteEntries.length, notes: noteEntries};
  }
  root.SchoolHtmlParser = Object.freeze({parse});
})(window);
