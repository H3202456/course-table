/* =========================================================
   课表 App
========================================================= */


/* =========================================================
   ① 课程时间表
========================================================= */

const SECTION_TIMES = {
  1: { start: "08:30", end: "09:15" },
  2: { start: "09:20", end: "10:05" },
  3: { start: "10:25", end: "11:10" },
  4: { start: "11:15", end: "12:00" },

  5: { start: "14:00", end: "14:45" },
  6: { start: "14:50", end: "15:35" },
  7: { start: "15:45", end: "16:30" },
  8: { start: "16:35", end: "17:20" },

  9: { start: "17:30", end: "18:15" },
  10: { start: "18:15", end: "18:55" },
  11: { start: "19:05", end: "19:50" },
  12: { start: "19:50", end: "20:30" },
};


/* =========================================================
   ② 全局状态
========================================================= */

const state = {

  courses: [],

  settings: null,

  saving: false,

  view: "today",

  selectedWeek: 1,

  // 当前正在编辑的课程 ID
  editingCourseId: null,

  // 当前正在查看详情的课程
  detailCourseId: null,

};


/* =========================================================
   ③ 页面元素
========================================================= */

const todayView =
  document.querySelector("#todayView");

const weekView =
  document.querySelector("#weekView");

const todayBtn =
  document.querySelector("#todayBtn");

const weekBtn =
  document.querySelector("#weekBtn");

const addCourseBtn =
  document.querySelector("#addCourseBtn");

const addCourseBtnWeek =
  document.querySelector("#addCourseBtnWeek");

const dialog =
  document.querySelector("#courseDialog");

const form =
  document.querySelector("#courseForm");

const closeDialogBtn =
  document.querySelector("#closeDialogBtn");

const saveButton =
  document.querySelector("#saveCourseBtn");

const saveStatus =
  document.querySelector("#saveStatus");

const courseDialogTitle =
  document.querySelector(
    "#courseDialogTitle"
  );


/* ---------- 课程详情 ---------- */

const detailDialog =
  document.querySelector(
    "#courseDetailDialog"
  );

const closeDetailDialogBtn =
  document.querySelector(
    "#closeDetailDialogBtn"
  );

const editCourseBtn =
  document.querySelector(
    "#editCourseBtn"
  );

const deleteCourseBtn =
  document.querySelector(
    "#deleteCourseBtn"
  );


const detailCourseName =
  document.querySelector(
    "#detailCourseName"
  );

const detailWeekLabel =
  document.querySelector(
    "#detailWeekLabel"
  );

const detailCourseTime =
  document.querySelector(
    "#detailCourseTime"
  );

const detailCourseWeekday =
  document.querySelector(
    "#detailCourseWeekday"
  );

const detailCourseClassroom =
  document.querySelector(
    "#detailCourseClassroom"
  );

const detailCourseTeacher =
  document.querySelector(
    "#detailCourseTeacher"
  );

const detailCourseWeeks =
  document.querySelector(
    "#detailCourseWeeks"
  );

const detailCourseNote =
  document.querySelector(
    "#detailCourseNote"
  );

const detailNoteRow =
  document.querySelector(
    "#detailNoteRow"
  );


/* ---------- 周课表 ---------- */

const previousWeekBtn =
  document.querySelector(
    "#previousWeekBtn"
  );

const nextWeekBtn =
  document.querySelector(
    "#nextWeekBtn"
  );

const currentWeekBtn =
  document.querySelector(
    "#currentWeekBtn"
  );

const backToCurrentWeekBtn =
  document.querySelector(
    "#backToCurrentWeekBtn"
  );


/* =========================================================
   开发测试用：日期预览（不会修改系统时间或数据库）

   示例：?preview=2026-10-16T14:30
   恢复实时：去掉地址栏中的 ?preview=... 即可

   部署给其他同学之前，可以删掉这一段预览入口。
========================================================= */

const PREVIEW_DATE = (() => {
  const value = new URLSearchParams(window.location.search).get("preview");
  if (!value) return null;

  // 只接受明确的本地日期和分钟，避免无效日期被悄悄纠正。
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }

  return date;
})();

function appNow() {
  // 每次返回新的 Date 对象，避免调用 setHours() 时污染预览时间。
  return PREVIEW_DATE ? new Date(PREVIEW_DATE.getTime()) : new Date();
}


/* =========================================================
   ④ 星期
========================================================= */

function currentWeekday() {

  const day =
    appNow().getDay();

  return day === 0
    ? 7
    : day;

}


/* =========================================================
   V2.0 · 教学周统一从周一开始
   学期日期若误填为周日，则归到紧接着的周一；
   周一至周六日期归到所在周的周一（不修改后端设置）。
========================================================= */
function getTeachingWeekStart() {
  const raw = state.settings?.start_date;
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;

  const weekday = date.getDay();
  // 周日提前 1 天填入时，首周应从次日周一开始；其余按本周周一对齐。
  const offset = weekday === 0 ? 1 : 1 - weekday;
  date.setDate(date.getDate() + offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

/* =========================================================
   ⑤ 当前周
========================================================= */

function currentWeek() {

  const start = getTeachingWeekStart();

  if (!start) return 1;


  const today =
    appNow();


  start.setHours(
    0,
    0,
    0,
    0
  );


  today.setHours(
    0,
    0,
    0,
    0
  );


  // 用日历日而非毫秒差计算，避免夏令时导致周数偏移。
  const difference = Math.round(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
     Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000
  );


  return (
    Math.floor(
      difference / 7
    ) + 1
  );

}


/* =========================================================
   ⑥ 加载数据
========================================================= */

async function load() {
  try {
    await CourseStore.initialize();

    [state.courses, state.settings] = await Promise.all([
      CourseStore.getCourses(),
      CourseStore.getSettings(),
    ]);

    state.selectedWeek = currentWeek();
    render();
  } catch (error) {
    console.error("本地课表加载失败：", error);
    document.querySelector("#todayCourses").innerHTML = `
      <div class="empty">本地课表读取失败。请检查浏览器是否允许存储数据，再刷新重试。</div>
    `;
  }
}


/* =========================================================
   ⑦ 判断课程属于某一周
========================================================= */

function isCourseInWeek(
  course,
  week
) {

  // 没有学期起始日期时不能把当前周冒充第 1 周。
  if (!state.settings?.start_date) return false;
  return (
    week >= Number(course.start_week) &&
    week <= Number(course.end_week)
  );

}


/* =========================================================
   ⑧ HTML 转义
========================================================= */

function escapeHtml(
  value
) {

  return String(value ?? "")

    .replaceAll(
      "&",
      "&amp;"
    )

    .replaceAll(
      "<",
      "&lt;"
    )

    .replaceAll(
      ">",
      "&gt;"
    )

    .replaceAll(
      '"',
      "&quot;"
    )

    .replaceAll(
      "'",
      "&#039;"
    );

}


/* =========================================================
   ⑨ 日期格式
========================================================= */

function formatDate(
  date
) {

  return date.toLocaleDateString(
    "zh-CN",
    {
      month: "numeric",
      day: "numeric",
    }
  );

}


/* =========================================================
   ⑩ 获取某一周周一
========================================================= */

function getMondayOfWeek(
  week
) {

  const startDate =
    state.settings?.start_date;


  if (!startDate) {

    const today =
      appNow();


    const day =
      today.getDay();


    const monday =
      new Date(today);


    const diff =
      day === 0
        ? -6
        : 1 - day;


    monday.setDate(
      today.getDate() + diff
    );


    monday.setHours(
      0,
      0,
      0,
      0
    );


    monday.setDate(
      monday.getDate()
      +
      (week - 1) * 7
    );


    return monday;

  }


  const monday = getTeachingWeekStart();
  if (!monday) return new Date();

  monday.setDate(
    monday.getDate()
    +
    (week - 1) * 7
  );


  return monday;

}


/* =========================================================
   ⑪ 周日期范围
========================================================= */

function formatWeekRange(
  week
) {

  const monday =
    getMondayOfWeek(week);


  const sunday =
    new Date(monday);


  sunday.setDate(
    monday.getDate() + 6
  );


  return (
    `${formatDate(monday)} — ` +
    `${formatDate(sunday)}`
  );

}


/* =========================================================
   ⑫ 获取课程具体时间
========================================================= */

function getCourseTime(
  course
) {

  const startSection =
    Number(
      course.start_section
    );


  const endSection =
    Number(
      course.end_section
    );


  const start =
    SECTION_TIMES[startSection];


  const end =
    SECTION_TIMES[endSection];


  if (!start || !end) {

    return {

      start: "--:--",

      end: "--:--",

    };

  }


  return {

    start: start.start,

    end: end.end,

  };

}


/* =========================================================
   ⑬ 显示课程时间
========================================================= */

function formatCourseTime(
  course
) {

  const time =
    getCourseTime(course);


  return (
    `${time.start}–${time.end}`
  );

}


/* =========================================================
   ⑭ 获取星期文字
========================================================= */

function weekdayText(
  weekday
) {

  const names = {

    1: "周一",

    2: "周二",

    3: "周三",

    4: "周四",

    5: "周五",

    6: "周六",

    7: "周日",

  };


  return (
    names[
    Number(weekday)
    ] || ""
  );

}


/* =========================================================
   ⑮ 把 HH:MM 转成今天的 Date
========================================================= */

function timeToday(
  time
) {

  const [
    hour,
    minute
  ] =
    time
      .split(":")
      .map(Number);


  const date =
    appNow();


  date.setHours(
    hour,
    minute,
    0,
    0
  );


  return date;

}


/* =========================================================
   ⑯ 获取课程状态
========================================================= */

function getCourseStatus(
  course
) {

  const time =
    getCourseTime(course);


  if (
    time.start === "--:--" ||
    time.end === "--:--"
  ) {

    return {

      type: "unknown",

      text: "",

      progress: 0,

      startAt: null,

      endAt: null,

      remainingMinutes: null,

    };

  }


  const now =
    appNow();


  const start =
    timeToday(
      time.start
    );


  const end =
    timeToday(
      time.end
    );


  /*
   * 统一返回课程的时间状态。
   *
   * Today 页面只需要关心三种状态：
   *
   * upcoming  → 下一节
   * current   → 正在上课
   * finished  → 已结束
   *
   * progress 只对 current 有意义，
   * 这样 Hero 和课程列表可以共享同一套状态。
   */

  if (now < start) {

    const minutes =
      Math.max(
        0,
        Math.ceil(
          (start - now) / 60000
        )
      );


    return {

      type: "upcoming",

      text:
        formatCountdown(minutes),

      progress: 0,

      startAt: start,

      endAt: end,

      remainingMinutes: minutes,

    };

  }


  if (now < end) {

    const remainingMinutes =
      Math.max(
        0,
        Math.ceil(
          (end - now) / 60000
        )
      );


    const total =
      end - start;


    const elapsed =
      now - start;


    const progress =
      total > 0
        ? (elapsed / total) * 100
        : 0;


    return {

      type: "current",

      text:
        `还剩 ${formatCountdown(remainingMinutes)}`,

      progress:
        Math.min(
          100,
          Math.max(
            0,
            progress
          )
        ),

      startAt: start,

      endAt: end,

      remainingMinutes,

    };

  }


  return {

    type: "finished",

    text: "已结束",

    progress: 100,

    startAt: start,

    endAt: end,

    remainingMinutes: 0,

  };

}


/* =========================================================
   当前课程进度
========================================================= */

function getCourseProgress(course) {

  const status =
    getCourseStatus(course);


  if (
    status.type !== "current"
  ) {

    return status.progress || 0;

  }


  return status.progress;

}


/* =========================================================
   ⑰ 倒计时文字
========================================================= */

function formatCountdown(
  minutes
) {

  if (minutes < 1) {

    return "马上";

  }


  if (minutes < 60) {

    return `${minutes} 分钟`;

  }


  const hours =
    Math.floor(
      minutes / 60
    );


  const remaining =
    minutes % 60;


  if (remaining === 0) {

    return `${hours} 小时`;

  }


  return (
    `${hours} 小时 ${remaining} 分钟`
  );

}


/* =========================================================
   ⑱ 渲染全部
========================================================= */

function render() {

  renderToday();

  renderWeek();

  updateView();

}


/* =========================================================
   ⑲ 今天页面
========================================================= */

function renderToday() {

  const now =
    appNow();


  const week =
    currentWeek();


  document.querySelector(
    "#weekLabel"
  ).textContent =
    `${state.settings?.start_date ? `第 ${week} 周` : "学期未设置"}${PREVIEW_DATE ? " · 预览模式" : ""}`;


  document.querySelector(
    "#todayDate"
  ).textContent =
    now.toLocaleDateString(
      "zh-CN",
      {
        month: "long",
        day: "numeric",
        weekday: "long",
      }
    );


  const weekday =
    currentWeekday();


  const todayCourses =
    state.courses

      .filter(
        course =>
          Number(course.weekday) ===
          weekday
      )

      .filter(
        course =>
          isCourseInWeek(
            course,
            week
          )
      )

      .sort(
        (a, b) =>
          Number(a.start_section) -
          Number(b.start_section)
      );


  renderNextClass(
    todayCourses
  );


  renderTodayCourses(
    todayCourses
  );

}


/* =========================================================
   ⑳ 下一节课程
========================================================= */

function renderNextClass(
  courses
) {

  const container =
    document.querySelector(
      "#nextClass"
    );


  /*
   * data-state 给 CSS / 后续交互留下统一的状态入口。
   *
   * empty    → 今天没有课程
   * finished → 今天课程已经结束
   * upcoming → 下一节课程
   * current  → 正在上课
   */

  container.dataset.state =
    "empty";


  if (!courses.length) {

    container.innerHTML = `

      <div class="next-label">
        今日状态
      </div>

      <div class="next-empty">
        ${!state.settings?.start_date && state.courses.length ? '请点击右上角「数据」，设置学期首周日期' : '今天没有课程'}
      </div>

    `;

    return;

  }


  let targetCourse = null;

  let targetStatus = null;


  for (
    const course of courses
  ) {

    const status =
      getCourseStatus(course);


    /*
     * 当前课程优先级最高。
     */

    if (
      status.type === "current"
    ) {

      targetCourse =
        course;

      targetStatus =
        status;

      break;

    }


    /*
     * 如果没有正在上的课，
     * 就取最早的一节 upcoming。
     */

    if (
      status.type === "upcoming" &&
      !targetCourse
    ) {

      targetCourse =
        course;

      targetStatus =
        status;

    }

  }


  /*
   * 所有课程都结束。
   */

  if (!targetCourse) {

    container.dataset.state =
      "finished";


    container.innerHTML = `

      <div class="next-label">
        今日状态
      </div>

      <div class="next-empty">
        今天的课程已经结束
      </div>

    `;

    return;

  }


  const isCurrent =
    targetStatus.type === "current";


  container.dataset.state =
    targetStatus.type;


  const progress =
    getCourseProgress(
      targetCourse
    );

  // 教室是 Today 中仅次于课程名的信息；即使缺失，也应明确提示。
  const hasClassroom = Boolean(String(targetCourse.classroom || "").trim());


  /*
   * 当前课程：
   *
   * 正在上课
   * 课程时间
   * 教室
   * 剩余时间
   * 进度
   *
   * 下一节：
   *
   * 下一节
   * 课程时间
   * 教室
   * 距离开始时间
   */

  container.innerHTML = `

    <div class="next-label">

      ${isCurrent
      ? "正在上课"
      : "下一节"
    }

    </div>


    <div
      class="
        next-card
        clickable-course
        state-${targetStatus.type}
      "
      data-course-id="${targetCourse.id}"
      data-course-state="${targetStatus.type}"
      aria-label="${
        isCurrent
          ? `正在上课：${escapeHtml(targetCourse.name)}`
          : `下一节：${escapeHtml(targetCourse.name)}`
      }"
    >

      <div class="course-name">

        ${escapeHtml(
      targetCourse.name
    )}

      </div>


      <div class="course-location ${hasClassroom ? "" : "location-missing"}">
        <span class="location-label">教室</span>
        <span class="location-value">${hasClassroom
          ? escapeHtml(String(targetCourse.classroom).trim())
          : "未填写 · 点击课程补充"}</span>
      </div>

      <div class="course-time">
        ${formatCourseTime(targetCourse)}
      </div>


      <div
        class="countdown"
        aria-live="polite"
      >

        ${isCurrent
      ? targetStatus.text
      : `还有 ${targetStatus.text}`
    }

      </div>


      ${isCurrent
      ? `
        <div
          class="next-progress"
          role="progressbar"
          aria-label="课程进度"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow="${progress.toFixed(0)}"
        >
          <span
            style="width:${progress.toFixed(2)}%"
          ></span>
        </div>
      `
      : ""
    }

    </div>

  `;

}


/* =========================================================
   ㉑ 今天课程列表
========================================================= */

function renderTodayCourses(
  courses
) {

  const list =
    document.querySelector(
      "#todayCourses"
    );

  // Today 标题显示当天的排课安排数，不改动课程过滤和渲染逻辑。
  const heading = document.querySelector(
    "#todayView .section-header h2"
  );
  if (heading) {
    heading.textContent = `今日课程 · ${courses.length} 节`;
  }


  if (!courses.length) {

    list.innerHTML = `

      <div class="empty">
        ${!state.settings?.start_date && state.courses.length ? '课程已经导入，请先设置学期开始日期。' : '今天没有安排，去做点自己的事吧。'}
      </div>

    `;

    return;

  }


  list.innerHTML =
    courses
      .map(courseCard)
      .join("");

}


/* =========================================================
   ㉒ 今天课程卡片
========================================================= */

function courseCard(
  course
) {

  const status =
    getCourseStatus(course);

  const hasClassroom = Boolean(String(course.classroom || "").trim());

  let statusText = "";


  if (
    status.type === "current"
  ) {

    statusText =
      status.text;

  }


  if (
    status.type === "upcoming"
  ) {

    statusText =
      `还有 ${status.text}`;

  }


  if (
    status.type === "finished"
  ) {

    statusText =
      "已结束";

  }


  return `

    <article
      class="
        course-item
        clickable-course
        status-${status.type}
      "
      data-course-id="${course.id}"
      data-course-state="${status.type}"
      tabindex="0"
      role="button"
      aria-label="${escapeHtml(course.name)}，${escapeHtml(statusText)}"
    >

      <div
        class="course-time-column"
      >

        <div class="course-time">

          ${formatCourseTime(
            course
          )}

        </div>


        <div
          style="
            margin-top:5px;
            color:#aaa;
            font-size:11px;
          "
        >

          ${formatSections(course)}

        </div>

      </div>


      <div
        class="course-content"
      >

        <div class="course-name">

          ${escapeHtml(
            course.name
          )}

        </div>


        <div class="course-room ${hasClassroom ? "" : "location-missing"}">
          ${hasClassroom ? `教室 · ${escapeHtml(String(course.classroom).trim())}` : "教室未填写"}
        </div>

        <div class="course-meta">
          ${escapeHtml(buildCourseMeta(course))}
        </div>


        ${statusText
      ? `

              <div
                class="
                  course-status
                  ${status.type}
                "
                aria-live="polite"
              >

                ${statusText}

              </div>

            `
      : ""
    }

      </div>

    </article>

  `;

}


/* =========================================================
   ㉓ 课程信息
========================================================= */

function buildCourseMeta(
  course
) {

  return [

    course.teacher,

    `第 ${course.start_week}–${course.end_week} 周`,

  ]

    .filter(Boolean)

    .join(" · ");

}


/* =========================================================
   ㉔ 节数
========================================================= */

function formatSections(
  course
) {

  if (
    Number(course.start_section) ===
    Number(course.end_section)
  ) {

    return `第 ${course.start_section} 节`;

  }


  return (
    `第 ${course.start_section}–` +
    `${course.end_section} 节`
  );

}


/* =========================================================
   V2.2 · 每门课程固定使用一种低饱和色
   同名课程（即使在不同星期、周次或记录中）颜色一致。
   不改变课程数据，也不存储额外的颜色字段。
========================================================= */
const WEEK_COURSE_TONES = ["blue", "sage", "lavender", "peach", "teal", "rose", "sand", "slate"];

function normalizeCourseColorName(name) {
  return String(name ?? "").normalize("NFKC").trim();
}

function getCourseToneIndex(name) {
  let hash = 2166136261;
  for (const character of name) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % WEEK_COURSE_TONES.length;
}

function buildCourseToneMap(courses) {
  // 每个周次都使用全部课程参与映射，以免翻周时颜色改变。
  // 优先避免撞色；课程种类多于颜色数时才复用。
  const names = [...new Set(courses.map(course => normalizeCourseColorName(course.name)))].sort();
  const assigned = new Set();
  const colors = new Map();
  for (const name of names) {
    let index = getCourseToneIndex(name);
    for (let step = 0; step < WEEK_COURSE_TONES.length && assigned.has(index); step++) {
      index = (index + 1) % WEEK_COURSE_TONES.length;
    }
    assigned.add(index);
    colors.set(name, WEEK_COURSE_TONES[index]);
  }
  return colors;
}


/* =========================================================
   ㉕ 周课表
========================================================= */

function renderWeek() {

  const week =
    state.selectedWeek;

  // 正在浏览本周时，收起重复的“回到本周”按钮。
  backToCurrentWeekBtn.hidden = week === currentWeek();

  document.querySelector(
    "#selectedWeekLabel"
  ).textContent =
    state.settings?.start_date ? `第 ${week} 周` : "学期未设置";


  document.querySelector(
    "#selectedWeekDate"
  ).textContent =
    state.settings?.start_date ? formatWeekRange(week) : "请在「数据」中设置首周日期";


  document.querySelector(
    "#weekSemesterLabel"
  ).textContent =
    state.settings?.name ||
    "课程表";


  const table =
    document.querySelector(
      "#weekTable"
    );


  let html = "";


  /* =====================================================
     左上角
  ====================================================== */

  html += `

    <div
      class="week-header-cell"
      style="
        grid-column: 1;
        grid-row: 1;
      "
    >
      #
    </div>

  `;


  /* =====================================================
     星期表头
  ====================================================== */

  const monday =
    getMondayOfWeek(week);


  const names = [

    "",

    "周一",

    "周二",

    "周三",

    "周四",

    "周五",

    "周六",

    "周日",

  ];


  for (
    let weekday = 1;
    weekday <= 7;
    weekday++
  ) {

    const date =
      new Date(monday);


    date.setDate(
      monday.getDate()
      +
      weekday
      -
      1
    );


    const isToday =
      week === currentWeek() &&
      weekday === currentWeekday();


    html += `

      <div
        class="
          week-header-cell
          ${isToday ? "today" : ""}
        "
        style="
          grid-column: ${weekday + 1};
          grid-row: 1;
        "
      >

        <span class="week-day-name">${names[weekday]}</span>
        <span class="week-day-date">${formatDate(date)}</span>

      </div>

    `;

  }


  /* =====================================================
     生成 12 节背景网格
     
     关键：
     所有格子都明确指定 grid-column / grid-row。
     禁止浏览器自动排版。
  ====================================================== */

  for (
    let section = 1;
    section <= 12;
    section++
  ) {

    const time =
      SECTION_TIMES[section];


    /* ---------- 左侧节次 ---------- */

    html += `

      <div
        class="section-number"
        style="
          grid-column: 1;
          grid-row: ${section + 1};
        "
      >

        <div>

          ${section}

          ${time
        ? `
                <div
                  style="
                    margin-top:2px;
                    color:#bbb;
                    font-size:9px;
                  "
                >
                  ${time.start}
                </div>
              `
        : ""
      }

        </div>

      </div>

    `;


    /* ---------- 周一～周日 ---------- */

    for (
      let weekday = 1;
      weekday <= 7;
      weekday++
    ) {

      html += `

        <div
          class="week-slot ${week === currentWeek() && weekday === currentWeekday() ? "today-column" : ""}"
          style="
            grid-column: ${weekday + 1};
            grid-row: ${section + 1};
          "
        ></div>

      `;

    }

  }


  /* =====================================================
     当前周课程
  ====================================================== */

  const courseToneMap = buildCourseToneMap(state.courses);

  const weekCourses =
    state.courses.filter(
      course =>
        isCourseInWeek(
          course,
          week
        )
    );


  /* =====================================================
     课程卡片
  ====================================================== */

  weekCourses.forEach(
    course => {

      const start =
        Number(
          course.start_section
        );


      const end =
        Number(
          course.end_section
        );


      /* 课程跨多少节 */

      const span =
        end - start + 1;


      /*

        weekday:
        1 = 周一
        2 = 周二
        ...
        7 = 周日

        因为第 1 列是节次，
        所以真正的课程列 = weekday + 1

      */

      const gridColumn =
        Number(
          course.weekday
        ) + 1;


      /*
        第 1 行是星期表头，
        所以第 1 节对应第 2 行。

        因此：
        第1节 -> row 2
        第2节 -> row 3
        第3节 -> row 4
      */

      const gridRow =
        start + 1;


      html += `

        <div
          class="
            week-course
            clickable-course
            tone-${courseToneMap.get(normalizeCourseColorName(course.name)) || "slate"}
            ${week === currentWeek() && Number(course.weekday) === currentWeekday() ? "today-course" : ""}
          "

          data-course-id="${course.id}"

          style="
            grid-column: ${gridColumn};
            grid-row: ${gridRow} / span ${span};
          "

          title="${escapeHtml(
        course.name
      )}"

          role="button"

          tabindex="0"
        >


          <!-- 课程名称 -->

          <div
            class="week-course-name"
          >

            ${escapeHtml(
        course.name
      )}

          </div>


          <!-- 时间 -->

          <div class="week-course-time">

            ${formatCourseTime(
        course
      )}

          </div>


          <!-- 教室 -->

          ${course.classroom
          ? `

                <div
                  class="week-course-room"
                >

                  ${escapeHtml(
            course.classroom
          )}

                </div>

              `
          : ""
        }


        </div>

      `;

    }
  );


  /* =====================================================
     没有课程
  ====================================================== */

  if (
    !weekCourses.length
  ) {

    html += `

      <div
        class="week-no-course"
        style="
          grid-column: 2 / 9;
          grid-row: 2 / 14;
        "
      >
        ${!state.settings?.start_date && state.courses.length ? '请在「数据」中设置学期首周日期' : '这一周没有课程'}
      </div>

    `;

  }


  /* =====================================================
     一次性写入页面
  ====================================================== */

  table.innerHTML =
    html;

}


/* =========================================================
   ㉖ 页面切换
========================================================= */

function updateView() {

  if (
    state.view === "today"
  ) {

    todayView.classList.add(
      "active-view"
    );

    weekView.classList.remove(
      "active-view"
    );


    todayBtn.classList.add(
      "active"
    );

    weekBtn.classList.remove(
      "active"
    );


  } else {

    todayView.classList.remove(
      "active-view"
    );

    weekView.classList.add(
      "active-view"
    );


    todayBtn.classList.remove(
      "active"
    );

    weekBtn.classList.add(
      "active"
    );

  }

}


/* =========================================================
   ㉗ 打开课程详情
========================================================= */

function openCourseDetail(
  courseId
) {

  const course =
    state.courses.find(
      item =>
        Number(item.id) ===
        Number(courseId)
    );


  if (!course) {

    return;

  }


  state.detailCourseId =
    Number(course.id);


  detailWeekLabel.textContent =
    `第 ${course.start_week}–${course.end_week} 周`;


  detailCourseName.textContent =
    course.name ||
    "未命名课程";


  detailCourseTime.textContent =
    formatCourseTime(course);


  detailCourseWeekday.textContent =
    `${weekdayText(course.weekday)} · ${formatSections(course)}`;


  detailCourseClassroom.textContent =
    course.classroom ||
    "未设置";


  detailCourseTeacher.textContent =
    course.teacher ||
    "未设置";


  detailCourseWeeks.textContent =
    `第 ${course.start_week}–${course.end_week} 周`;


  if (course.note) {

    detailCourseNote.textContent =
      course.note;

    detailNoteRow.style.display =
      "";

  } else {

    detailCourseNote.textContent =
      "无";

    detailNoteRow.style.display =
      "";

  }


  detailDialog.showModal();

}


/* =========================================================
   ㉘ 点击课程
========================================================= */

/*
 * 使用事件委托。
 *
 * 好处：
 * render() 每次都会重新生成课程卡片，
 * 但我们不需要每次重新绑定 click。
 */

document.addEventListener(
  "click",
  event => {

    const courseElement =
      event.target.closest(
        ".clickable-course"
      );


    if (!courseElement) {

      return;

    }


    const courseId =
      courseElement.dataset.courseId;


    if (!courseId) {

      return;

    }


    openCourseDetail(
      courseId
    );

  }
);


/* =========================================================
   ㉙ 键盘打开课程
========================================================= */

document.addEventListener(
  "keydown",
  event => {

    if (
      event.key !== "Enter" &&
      event.key !== " "
    ) {

      return;

    }


    const courseElement =
      event.target.closest(
        ".clickable-course"
      );


    if (!courseElement) {

      return;

    }


    event.preventDefault();


    const courseId =
      courseElement.dataset.courseId;


    if (!courseId) {

      return;

    }


    openCourseDetail(
      courseId
    );

  }
);


/* =========================================================
   ㉚ 关闭课程详情
========================================================= */

closeDetailDialogBtn.addEventListener(
  "click",
  () => {

    detailDialog.close();

    state.detailCourseId =
      null;

  }
);


/* =========================================================
   ㉛ 点击详情外部关闭
========================================================= */

detailDialog.addEventListener(
  "click",
  event => {

    if (
      event.target ===
      detailDialog
    ) {

      detailDialog.close();

      state.detailCourseId =
        null;

    }

  }
);


/* =========================================================
   ㉜ 编辑课程
========================================================= */

editCourseBtn.addEventListener(
  "click",
  () => {

    const course =
      state.courses.find(
        item =>
          Number(item.id) ===
          Number(
            state.detailCourseId
          )
      );


    if (!course) {

      return;

    }


    detailDialog.close();


    openCourseDialog(
      course
    );

  }
);


/* =========================================================
   ㉝ 删除课程
========================================================= */

deleteCourseBtn.addEventListener(
  "click",
  async () => {

    const courseId =
      state.detailCourseId;


    if (!courseId) {

      return;

    }


    const course =
      state.courses.find(
        item =>
          Number(item.id) ===
          Number(courseId)
      );


    if (!course) {

      return;

    }


    const confirmed =
      window.confirm(
        `确定要删除「${course.name}」吗？\n\n删除后无法恢复。`
      );


    if (!confirmed) {

      return;

    }


    deleteCourseBtn.disabled =
      true;


    deleteCourseBtn.textContent =
      "删除中…";


    try {

      await CourseStore.deleteCourse(courseId);


      /*
       * 从本地状态删除
       */

      state.courses =
        state.courses.filter(
          item =>
            Number(item.id) !==
            Number(courseId)
        );


      state.detailCourseId =
        null;


      detailDialog.close();


      render();


    } catch (error) {

      console.error(error);


      window.alert(
        error.message ||
        "删除失败，请稍后再试。"
      );

    } finally {

      deleteCourseBtn.disabled =
        false;

      deleteCourseBtn.textContent =
        "删除课程";

    }

  }
);


/* =========================================================
   ㉞ 打开添加课程
========================================================= */

function openCourseDialog(
  course = null
) {

  clearSaveStatus();


  state.editingCourseId =
    course
      ? Number(course.id)
      : null;


  /*
   * 先重置表单
   */

  form.reset();


  if (course) {

    /* ---------- 编辑 ---------- */

    courseDialogTitle.textContent =
      "编辑课程";


    saveButton.textContent =
      "保存修改";


    form.elements.name.value =
      course.name || "";


    form.elements.weekday.value =
      String(
        course.weekday
      );


    form.elements.start_section.value =
      course.start_section;


    form.elements.end_section.value =
      course.end_section;


    form.elements.start_week.value =
      course.start_week;


    form.elements.end_week.value =
      course.end_week;


    form.elements.classroom.value =
      course.classroom || "";


    form.elements.teacher.value =
      course.teacher || "";


    form.elements.note.value =
      course.note || "";


  } else {

    /* ---------- 添加 ---------- */

    courseDialogTitle.textContent =
      "添加课程";


    saveButton.textContent =
      "保存课程";


    const weekday =
      currentWeekday();


    form.elements.weekday.value =
      String(weekday);


    const week =
      currentWeek();


    form.elements.start_week.value =
      week;


    form.elements.end_week.value =
      Math.max(
        week,
        20
      );

  }


  saveButton.disabled =
    false;


  state.saving =
    false;


  dialog.showModal();

}


/* =========================================================
   ㉟ 添加课程按钮
========================================================= */

addCourseBtn.addEventListener(
  "click",
  () => {

    openCourseDialog();

  }
);


addCourseBtnWeek.addEventListener(
  "click",
  () => {

    openCourseDialog();

  }
);


/* =========================================================
   ㊱ 关闭添加 / 编辑弹窗
========================================================= */

closeDialogBtn.addEventListener(
  "click",
  () => {

    if (state.saving) {

      return;

    }


    dialog.close();


    state.editingCourseId =
      null;


    clearSaveStatus();

  }
);


/* =========================================================
   ㊲ 点击弹窗外部关闭
========================================================= */

dialog.addEventListener(
  "click",
  event => {

    if (
      event.target ===
      dialog &&
      !state.saving
    ) {

      dialog.close();

      state.editingCourseId =
        null;

    }

  }
);


/* =========================================================
   ㊳ 保存课程 / 编辑课程
========================================================= */

form.addEventListener(
  "submit",
  async event => {

    event.preventDefault();


    /*
     * 最重要的一层防重复提交。
     *
     * 即使用户疯狂点击保存，
     * 也只允许一个请求进行。
     */

    if (state.saving) {

      return;

    }


    state.saving =
      true;


    saveButton.disabled =
      true;


    saveButton.textContent =
      state.editingCourseId
        ? "保存中…"
        : "添加中…";


    setSaveStatus(
      state.editingCourseId
        ? "正在保存修改…"
        : "正在添加课程…"
    );


    try {

      const formData =
        new FormData(form);


      const payload =
        Object.fromEntries(
          formData.entries()
        );


      /*
       * 数字字段转换
       */

      [
        "weekday",
        "start_section",
        "end_section",
        "start_week",
        "end_week",
      ].forEach(
        key => {

          payload[key] =
            Number(
              payload[key]
            );

        }
      );


      /*
       * 基础验证
       */

      if (
        payload.end_section <
        payload.start_section
      ) {

        throw new Error(
          "结束节不能早于开始节"
        );

      }


      if (
        payload.end_week <
        payload.start_week
      ) {

        throw new Error(
          "结束周不能早于开始周"
        );

      }


      // 本地优先：只有 IndexedDB 事务提交成功才更新页面状态。
      // 学生每天查看、添加、编辑课程都不再调用 FastAPI。
      const savedCourse = await CourseStore.saveCourse(
        state.editingCourseId
          ? { ...payload, id: state.editingCourseId }
          : payload
      );


      /* =====================================================
         更新本地状态
      ====================================================== */

      if (
        state.editingCourseId
      ) {

        const index =
          state.courses.findIndex(
            item =>
              Number(item.id) ===
              Number(
                state.editingCourseId
              )
          );


        if (index !== -1) {

          state.courses[index] =
            savedCourse;

        }


      } else {

        state.courses.push(
          savedCourse
        );

      }


      /*
       * 立即刷新页面
       */

      render();


      /*
       * 给用户明确反馈
       */

      saveButton.textContent =
        state.editingCourseId
          ? "已保存 ✓"
          : "已添加 ✓";


      setSaveStatus(
        state.editingCourseId
          ? "课程修改成功"
          : "课程添加成功"
      );


      /*
       * 稍微停留一下，
       * 让用户真的看到成功反馈。
       */

      setTimeout(
        () => {

          if (
            dialog.open
          ) {

            dialog.close();

          }


          form.reset();


          state.editingCourseId =
            null;


          clearSaveStatus();


          saveButton.textContent =
            "保存课程";


        },
        700
      );


    } catch (error) {

      console.error(error);


      setSaveStatus(
        error.message ||
        "操作失败，请稍后再试。"
      );


      saveButton.textContent =
        "重新保存";


      state.saving =
        false;


      saveButton.disabled =
        false;


      return;

    }


    state.saving =
      false;


    saveButton.disabled =
      false;

  }
);


/* =========================================================
   ㊴ 保存状态
========================================================= */

function setSaveStatus(
  message
) {

  saveStatus.textContent =
    message;

}


function clearSaveStatus() {

  saveStatus.textContent =
    "";

}


/* =========================================================
   V1.9 · 手机周课表初始定位
   - 当前周：打开时让今天出现在视口中间附近
   - 其他周：默认从周一开始
   - 用户仍可自由横向滚动，不监听或接管手势
========================================================= */

function focusWeekDay() {
  const wrapper = document.querySelector("#weekView .week-table-wrapper");
  if (!wrapper) return;
  if (!window.matchMedia("(max-width: 600px)").matches) return;

  if (state.selectedWeek !== currentWeek()) {
    wrapper.scrollLeft = 0;
    return;
  }

  const todayHeader = wrapper.querySelector(".week-header-cell.today");
  if (!todayHeader) {
    wrapper.scrollLeft = 0;
    return;
  }

  // 尽量完整展示“昨天 + 今天”，并露出下一天的边缘，提示可以横滑。
  // 周一、周二自然从最左侧起步，周末自动受到最大滚动位置限制。
  const railWidth = wrapper.querySelector(".section-number")?.offsetWidth || 0;
  const target = todayHeader.offsetLeft - todayHeader.offsetWidth - railWidth;
  wrapper.scrollLeft = Math.max(0, target);
}

/* =========================================================
   ㊵ 周课表切换
========================================================= */

todayBtn.addEventListener(
  "click",
  () => {

    state.view =
      "today";

    updateView();

  }
);


weekBtn.addEventListener(
  "click",
  () => {

    state.view =
      "week";

    updateView();

    renderWeek();
    focusWeekDay();

  }
);


/* =========================================================
   ㊶ 上一周
========================================================= */

previousWeekBtn.addEventListener(
  "click",
  () => {

    if (
      state.selectedWeek > 1
    ) {

      state.selectedWeek--;

      renderWeek();
      focusWeekDay();

    }

  }
);


/* =========================================================
   ㊷ 下一周
========================================================= */

nextWeekBtn.addEventListener(
  "click",
  () => {

    if (
      state.selectedWeek < 60
    ) {

      state.selectedWeek++;

      renderWeek();
      focusWeekDay();

    }

  }
);


/* =========================================================
   ㊸ 当前周
========================================================= */

currentWeekBtn.addEventListener(
  "click",
  () => {

    state.selectedWeek =
      currentWeek();

    renderWeek();
    focusWeekDay();

  }
);


/* =========================================================
   ㊹ 回到本周
========================================================= */

backToCurrentWeekBtn.addEventListener(
  "click",
  () => {

    state.selectedWeek =
      currentWeek();

    renderWeek();
    focusWeekDay();

  }
);


/* =========================================================
   ㊺ 启动
========================================================= */

load();


/* =========================================================
   ㊻ 自动更新时间
========================================================= */

setInterval(
  () => {

    if (
      state.courses.length
    ) {

      renderToday();

    }

  },
  30000
);