const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const sourcePath = path.join(__dirname, 'auto-study.user.js');
let source = fs.readFileSync(sourcePath, 'utf8');
// 仅在测试副本中允许替换 MD5，以便用合成路径命中真实指纹表；正式脚本仍冻结字体库。
const frozenFontLib = 'return Object.freeze({ Typr, md5: scope.md5 });';
assert(source.includes(frozenFontLib), '找不到字体库测试注入点');
source = source.replace(frozenFontLib, 'return { Typr, md5: scope.md5 };');
const marker = "  log('启动成功 ✅";
assert(source.includes(marker), '找不到测试注入点');
source = source.replace(marker, `  window.__test = {
    AI: AI,
    cxFontLib: CX_FONT_LIB,
    aiFetch: aiFetch,
    aiAskPage: aiAskPage,
    aiAskPageRaw: aiAskPageRaw,
    aiFetchModels: aiFetchModels,
    restorePageQuestion: restorePageQuestion,
    modelReportedGarbledText: modelReportedGarbledText,
    buildPageAskPrompt: buildPageAskPrompt,
    findRequiredPageQuizRetry: findRequiredPageQuizRetry,
    platformCompletionWaits: platformCompletionWaits,
    isLastSection: isLastSection,
    pageQuizState: () => pageQuizState,
    pageQuizCache: () => pageQuizCache,
    parseAnswerLetters: parseAnswerLetters,
    stripLetter: stripLetter,
    pageOptionsOf: pageOptionsOf,
    rowSelected: rowSelected,
    applyPageAnswer: applyPageAnswer,
    autoAdvance: autoAdvance,
    applyVideoRate: applyVideoRate,
    processVideoStatusPayload: processVideoStatusPayload,
    installVideoStatusProbe: installVideoStatusProbe,
    videoStatusSignals: () => videoStatusSignals,
    diagnoseVideoResume: diagnoseVideoResume,
    findCompletedVideoTask: findCompletedVideoTask,
    videoInFinishedTask: videoInFinishedTask,
    keepPlaying: keepPlaying,
    findCompletedPageQuiz: findCompletedPageQuiz,
    handlePageQuiz: handlePageQuiz,
    handleEmptySection: handleEmptySection,
    emptySectionState: emptySectionState
  };
${marker}`);

function makeElement(doc, text) {
  return {
    textContent: text || '',
    className: '',
    children: [],
    style: {},
    ownerDocument: doc,
    parentElement: null,
    isConnected: true,
    getBoundingClientRect() { return { width: 20, height: 20, left: 0, top: 0 }; },
    getAttribute() { return null; },
    matches() { return false; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return false; },
    dispatchEvent() { return true; },
    click() {}
  };
}

function createContext({ userscript, config, gmImpl, fetchImpl }) {
  const store = Object.create(null);
  const nodes = Object.create(null);
  if (!userscript) store['autoStudy:autoStudyCfg'] = JSON.stringify(config);
  const document = {
    title: '测试课程',
    body: null,
    documentElement: null,
    getElementById(id) { return nodes[id] || null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createTreeWalker() { return { nextNode() { return null; } }; },
    createElement() {
      const el = makeElement(document, '');
      el.style = {};
      let html = '';
      Object.defineProperty(el, 'innerHTML', {
        get() { return html; },
        set(value) {
          html = String(value);
          const re = /id="([^"]+)"/g;
          let match;
          while ((match = re.exec(html))) nodes[match[1]] = makeElement(document, '');
        }
      });
      el.appendChild = function (child) { return child; };
      return el;
    }
  };
  const mount = makeElement(document, '');
  mount.appendChild = function (child) {
    if (child.id) nodes[child.id] = child;
    child.parentNode = { removeChild() { if (child.id) delete nodes[child.id]; } };
    return child;
  };
  document.body = mount;
  document.documentElement = mount;
  document.defaultView = null;

  const context = {
    document,
    console: { log() {}, warn() {}, error() {}, group() {}, groupEnd() {} },
    localStorage: {
      getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value) { store[key] = String(value); },
      removeItem(key) { delete store[key]; }
    },
    navigator: {},
    location: { href: 'https://example.test/course', reload() { context.__reloads++; } },
    alert() { context.__alertCalls++; },
    prompt() { context.__promptCalls++; return null; },
    __menus: [],
    __gmWrites: [],
    __promptCalls: 0,
    __alertCalls: 0,
    __reloads: 0,
    setInterval() { return 1; },
    clearInterval() {},
    setTimeout(fn, ms) {
      const timer = setTimeout(fn, ms);
      if (ms >= 3000 && timer.unref) timer.unref();
      return timer;
    },
    clearTimeout,
    AbortController,
    Promise,
    JSON,
    Date,
    Math,
    String,
    Number,
    Boolean,
    Object,
    Array,
    RegExp,
    Error,
    TypeError,
    parseInt,
    parseFloat,
    isFinite,
    encodeURIComponent,
    addEventListener() {}
  };
  context.window = context;
  context.self = context;
  context.top = context;
  document.defaultView = context;
  context.getComputedStyle = function () { return { display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' }; };
  context.MouseEvent = function (type, init) { return { type, init }; };
  context.Event = function (type, init) { return { type, init }; };
  context.KeyboardEvent = function (type, init) { return { type, init }; };
  if (userscript) {
    context.GM_getValue = function () { return config; };
    context.GM_setValue = function (key, value) {
      context.__gmWrites.push({ key, value: JSON.parse(JSON.stringify(value)) });
      store['gm:' + key] = JSON.stringify(value);
    };
    context.GM_registerMenuCommand = function (name, fn) { context.__menus.push({ name, fn }); };
    context.GM_xmlhttpRequest = gmImpl;
  } else {
    context.fetch = fetchImpl;
  }
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'auto-study.user.js', timeout: 3000 });
  return context;
}

function response(text, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(text),
    json: () => Promise.resolve().then(() => JSON.parse(text))
  };
}

function makeOptionFixture(ctx) {
  const doc = ctx.document;
  const block = makeElement(doc, '【单选题】测试');
  const rows = [];
  const all = [];
  for (const [letter, text] of [['A', '苹果'], ['B', '香蕉']]) {
    const row = makeElement(doc, `${letter}.${text}`);
    row.parentElement = block;
    const marker = makeElement(doc, `${letter}.`);
    marker.parentElement = row;
    const label = makeElement(doc, `${letter}.${text}`);
    label.parentElement = row;
    label.click = function () { row.className = 'option is-active'; };
    row.querySelector = function (selector) { return selector === 'label' ? label : null; };
    row.querySelectorAll = function () { return []; };
    row.label = label;
    rows.push(row);
    all.push(marker, row);
  }
  block.querySelectorAll = function (selector) {
    if (selector === '*') return all;
    return [];
  };
  return { block, rows };
}

function makeEmptyPageFixture(ctx) {
  const doc = ctx.document;
  const active = makeElement(doc, '3.1 大国工匠劳动故事');
  active.id = 'cur31';
  active.className = 'posCatalog_select posCatalog_active';
  const emptyMarker = makeElement(doc, '暂无内容');
  const nextButton = makeElement(doc, '下一节');
  nextButton.closest = function () { return null; };
  let clicks = 0;
  nextButton.click = function () { clicks++; };
  doc.body.textContent = '暂无内容 上一节 下一节';
  doc.querySelector = function (selector) {
    if (selector === '#coursetree .posCatalog_active') return active;
    return null;
  };
  doc.querySelectorAll = function (selector) {
    if (selector === 'div,p,span,section,article') return [emptyMarker];
    if (selector === 'a,button,span,div,label,p,li,input[type=button],input[type=submit]') {
      return [emptyMarker, nextButton];
    }
    return [];
  };
  return { doc, active, emptyMarker, nextButton, clicks: () => clicks };
}

function makeCompletedQuizFixture(ctx) {
  const doc = ctx.document;
  const active = makeElement(doc, '2.1 工程师职业');
  active.id = 'cur21';
  active.className = 'posCatalog_select posCatalog_active';
  const next = makeElement(doc, '2.2 下一节');
  next.id = 'cur22';
  next.className = 'posCatalog_select';
  const nextInner = makeElement(doc, '2.2 下一节');
  let navigations = 0;
  nextInner.click = function () { navigations++; };
  next.querySelector = function (selector) {
    return selector.includes('.posCatalog_name') ? nextInner : null;
  };
  next.click = function () {};

  const taskDone = makeElement(doc, '任务点已完成');
  const quizDone = makeElement(doc, '已完成');
  let redoClicks = 0;
  const redo = makeElement(doc, '重做（剩余 1 次）');
  redo.click = function () { redoClicks++; };
  const score = makeElement(doc, '本次成绩 66.7 分');
  const markers = [taskDone, quizDone, redo, score];
  doc.body.textContent = '任务点已完成 章节测验 已完成 重做（剩余 1 次） 本次成绩 66.7 分 ' +
    '1【单选题】很多工科大学被称为工程师的摇篮。 A 正确 B 错误';
  doc.querySelector = function (selector) {
    if (selector === '#coursetree .posCatalog_active') return active;
    return null;
  };
  doc.querySelectorAll = function (selector) {
    if (selector === '#coursetree .posCatalog_select') return [active, next];
    if (selector === '#prev_tab .prev_ul li, .prev_ul li') return [];
    if (selector === 'div,p,span,section,article,button,a') return markers;
    if (selector === 'a,button,span,div,label,p,li,input[type=button],input[type=submit]') return markers;
    return [];
  };
  return {
    doc,
    navigations: () => navigations,
    redoClicks: () => redoClicks
  };
}

function makeVideoTaskFixture(ctx, options) {
  options = options || {};
  const doc = ctx.document;
  const active = makeElement(doc, '3.1 视频任务');
  active.id = 'cur31';
  active.className = 'posCatalog_select posCatalog_active';
  const next = makeElement(doc, '3.2 下一节');
  next.id = 'cur32';
  next.className = 'posCatalog_select';
  const nextInner = makeElement(doc, '3.2 下一节');
  let navigations = 0;
  let playCalls = 0;
  nextInner.click = function () { navigations++; };
  next.querySelector = function (selector) {
    return selector.includes('.posCatalog_name') ? nextInner : null;
  };
  next.click = function () {};

  const frames = [];
  function addFrame(type, done) {
    const parent = makeElement(doc, '');
    parent.className = done ? 'ans-job-finished' : 'ans-job';
    const id = frames.length + 1;
    const src = 'https://example.test/ananas/modules/' + type + '/index.html?id=' + id + '&objectId=task' + id;
    const frame = makeElement(doc, '');
    frame.parentElement = parent;
    frame.src = src;
    frame.getAttribute = function (name) { return name === 'src' ? src : null; };
    frame.closest = function (selector) {
      return done && selector.includes('.ans-job-finished') ? parent : null;
    };
    frames.push(frame);
  }
  if (!options.direct) {
    addFrame('video', options.completed !== false);
    if (options.unfinishedVideo) addFrame('video', false);
    if (options.pendingWork) addFrame('work', false);
  }

  const video = makeElement(doc, '');
  video.duration = 0;
  video.currentTime = 0;
  video.paused = true;
  video.currentSrc = 'https://example.test/video.mp4';
  video.play = function () { playCalls++; return Promise.resolve(); };
  const marker = makeElement(doc, '任务点已完成');
  doc.body.textContent = options.direct ? '任务点已完成' : '';
  doc.querySelector = function (selector) {
    if (selector === '#coursetree .posCatalog_active') return active;
    return null;
  };
  doc.querySelectorAll = function (selector) {
    if (selector === 'iframe[src*="/ananas/modules/"]') return frames;
    if (selector === '#coursetree .posCatalog_select') return [active, next];
    if (selector === '#prev_tab .prev_ul li, .prev_ul li') return [];
    if (selector === 'video') return options.direct ? [video] : [];
    if (selector === '.ans-job-finished,.ans-jobfinished,div,p,span') {
      return options.direct ? [marker] : [];
    }
    return [];
  };
  return {
    doc,
    navigations: () => navigations,
    playCalls: () => playCalls
  };
}

function makeQuizResultFixture(ctx, options) {
  options = options || {};
  const doc = ctx.document;
  const active = makeElement(doc, '4.1 当前测验');
  active.id = 'cur41';
  active.className = 'posCatalog_select posCatalog_active';
  const next = makeElement(doc, '4.2 下一节');
  next.id = 'cur42';
  next.className = 'posCatalog_select';
  const nextInner = makeElement(doc, '4.2 下一节');
  let navigations = 0;
  let redoClicks = 0;
  let confirmClicks = 0;
  let cancelClicks = 0;
  nextInner.click = function () { navigations++; };
  next.querySelector = selector => selector.includes('.posCatalog_name') ? nextInner : null;
  next.click = function () {};

  let completed = !!options.completed;
  const failed = !!options.failed;
  const score = options.score == null ? null : options.score;
  const hasRedo = options.redo !== false;
  const hasFailureModal = !!options.failureModal;
  const taskDone = makeElement(doc, '任务点已完成');
  const failedMarker = makeElement(doc, options.failureText || '本次测验不及格，请重做');
  const scoreMarker = makeElement(doc, score == null ? '' : `本次成绩 ${score} 分`);
  const redo = makeElement(doc, options.redoText || '重做');
  redo.click = function () { redoClicks++; };
  const modal = makeElement(doc, hasFailureModal ? '未达到及格线，请重做 取消 确定' : '');
  modal.className = 'modal dialog';
  const cancel = makeElement(doc, '取消');
  const confirm = makeElement(doc, '确定');
  cancel.click = function () { cancelClicks++; };
  confirm.click = function () { confirmClicks++; };
  modal.querySelectorAll = function (selector) {
    return /button|span|div|label|input/.test(selector) ? [cancel, confirm] : [];
  };
  const markers = [];

  function sync() {
    markers.length = 0;
    const parts = [];
    if (completed) { markers.push(taskDone); parts.push(taskDone.textContent); }
    if (failed) { markers.push(failedMarker); parts.push(failedMarker.textContent); }
    if (score != null) { markers.push(scoreMarker); parts.push(scoreMarker.textContent); }
    if (hasRedo) { markers.push(redo); parts.push(redo.textContent); }
    if (hasFailureModal) parts.push(modal.textContent);
    parts.push('1【单选题】平台结果页测试 A 正确 B 错误');
    doc.body.textContent = parts.join(' ');
  }
  sync();

  doc.querySelector = selector => selector === '#coursetree .posCatalog_active' ? active : null;
  doc.querySelectorAll = function (selector) {
    if (selector === '#coursetree .posCatalog_select') return [active, next];
    if (selector === '#prev_tab .prev_ul li, .prev_ul li') return [];
    if (selector === 'div,section,article' || selector === 'div,section,article,form') {
      return hasFailureModal ? [modal] : [];
    }
    if (selector === '*') return [];
    if (/button|div|span|label/.test(selector)) return markers;
    return [];
  };
  return {
    doc,
    complete() { completed = true; sync(); },
    navigations: () => navigations,
    redoClicks: () => redoClicks,
    confirmClicks: () => confirmClicks,
    cancelClicks: () => cancelClicks
  };
}

function createSequenceContext(baseConfig, answers, extraConfig) {
  const calls = [];
  const queue = answers.slice();
  const config = Object.assign({}, baseConfig, extraConfig || {});
  const ctx = createContext({
    userscript: true,
    config,
    gmImpl(options) {
      calls.push(options);
      setTimeout(() => {
        const answer = queue.length ? queue.shift() : 'C';
        const content = answer.includes('最终答案') ? answer : `分析过程\n最终答案：${answer}`;
        options.onload({
          status: 200,
          responseText: JSON.stringify({ choices: [{ message: { content } }] })
        });
      }, 2);
      return { abort() {} };
    }
  });
  return { ctx, calls };
}

const fontExpected = {
  '甲': 23247,
  '乙': 34076,
  '丙': 35052,
  '戊': 21815,
  '己': 40666
};

function installFakeFontLibrary(ctx, missingMap) {
  ctx.atob = () => '\0';
  const glyphs = { '甲': 7, '乙': 8, '丙': 9, '戊': 10, '己': 11 };
  const hashes = {
    7: '10434866', 8: '10583225', 9: '10642690', 10: '10722294', 11: '10940728'
  };
  const lib = ctx.__test.cxFontLib;
  lib.Typr.parse = () => [{ cmap: { synthetic: true } }];
  lib.Typr.U.codeToGlyph = (font, cp) => {
    const chars = Object.keys(glyphs);
    for (const ch of chars) if (ch.codePointAt(0) === cp) return glyphs[ch];
    return 0;
  };
  lib.Typr.U.glyphToPath = (font, glyph) => ({ cmds: [String(glyph)], crds: [glyph, glyph + 1] });
  lib.md5 = path => {
    if (missingMap) return '00000000000000000000000099999999';
    const glyph = JSON.parse(path).cmds[0];
    return '000000000000000000000000' + hashes[glyph];
  };
}

function makeFontQuestionFixture(ctx, mode) {
  const doc = ctx.document;
  const plain = mode === 'plain';
  const base64 = 'AA==';
  let css = '.font-cxsecret{font-family:cx-test}\n' +
    '@font-face{font-family:"cx-test";src:url(data:font/ttf;base64,AA==)}';
  if (mode === 'ambiguous') css += '\n@font-face{font-family:"cx-test";src:url(data:font/ttf;base64,BB==)}';
  const style = makeElement(doc, mode === 'missing-font' || plain ? '' : css);
  doc.querySelectorAll = selector => selector === 'style' ? [style] : [];
  ctx.getComputedStyle = function (el) {
    return {
      display: el && el.__secret ? 'inline' : 'block', visibility: 'visible',
      fontFamily: el && el.__secret ? '"cx-test", sans-serif' : 'sans-serif'
    };
  };

  function secretText(text) {
    const el = makeElement(doc, text);
    el.nodeType = 1;
    el.nodeName = 'SPAN';
    el.className = plain ? '' : 'font-cxsecret';
    el.__secret = !plain;
    const node = {
      nodeType: 3, nodeName: '#text', nodeValue: text,
      ownerDocument: doc, parentElement: el
    };
    el.childNodes = [node];
    el.innerText = text;
    el.closest = selector => selector === '.font-cxsecret' && !plain ? el : null;
    return el;
  }

  const stemEl = secretText('【单选题】甲乙');
  const optionA = secretText('A. 丙丁');
  const optionB = secretText('B. 戊己');
  const optionC = secretText('C. 庚辛');
  const q = {
    text: '【单选题】甲乙', type: 'single', stemEl,
    opts: [
      { letter: 'A', text: '丙丁', el: optionA },
      { letter: 'B', text: '戊己', el: optionB },
      { letter: 'C', text: '庚辛', el: optionC }
    ]
  };
  return { q, stemEl, optionA, optionB };
}

(async () => {
  const gmCalls = [];
  const config = {
    aiKey: 'sk-test-not-a-real-key',
    aiEndpoint: 'https://api.deepseek.com/chat/completions',
    aiModel: 'deepseek-chat',
    aiTimeout: 12345,
    aiGap: 1
  };
  const ctx = createContext({
    userscript: true,
    config,
    gmImpl(options) {
      gmCalls.push(options);
      const req = {
        abort() { if (options.onabort) options.onabort(); }
      };
      setTimeout(() => {
        if (options.url.endsWith('/models')) {
          options.onload({ status: 200, responseText: JSON.stringify({ data: [{ id: 'deepseek-chat' }] }) });
        } else if (options.__neverRespond) {
          // 由具体测试手工触发。
        } else {
          options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: 'C' } }] }) });
        }
      }, 5);
      return req;
    }
  });

  assert.strictEqual(ctx.__test.AI.timeout, 12345, '设置面板的超时时间未传入核心');
  assert.strictEqual(ctx.__test.AI.model, 'deepseek-chat');
  assert(ctx.__autoStudyTimer, '主循环未启动');

  const q = {
    text: '【单选题】下列哪项正确？',
    type: 'single',
    opts: [{ letter: 'A', text: '甲' }, { letter: 'B', text: '乙' }, { letter: 'C', text: '丙' }]
  };
  const answer = await ctx.__test.aiAskPageRaw(q);
  assert.deepStrictEqual(Array.from(answer), ['C'], '油猴通道答题解析失败');
  const chatCall = gmCalls.find(call => call.url.endsWith('/chat/completions'));
  assert(chatCall, '没有通过 GM_xmlhttpRequest 发起答题请求');
  assert.strictEqual(chatCall.headers.Authorization, 'Bearer sk-test-not-a-real-key');
  assert.strictEqual(JSON.parse(chatCall.data).model, 'deepseek-chat');

  const models = await ctx.__test.aiFetchModels();
  assert.deepStrictEqual(Array.from(models), ['deepseek-chat'], '模型列表请求失败');

  assert.deepStrictEqual(Array.from(ctx.__test.parseAnswerLetters('答案：C', 4, false)), ['C']);
  assert.deepStrictEqual(Array.from(ctx.__test.parseAnswerLetters('B,A', 4, true)), ['B', 'A']);
  assert.strictEqual(ctx.__test.stripLetter('A. 苹果'), '苹果');
  assert.strictEqual(ctx.__test.stripLetter('A火神山'), '火神山');
  assert.strictEqual(ctx.__test.stripLetter('Apple'), 'Apple');

  const fixture = makeOptionFixture(ctx);
  const parsedRows = ctx.__test.pageOptionsOf(fixture.block);
  assert.strictEqual(parsedRows.length, 2, '带标点选项行识别失败');
  assert.strictEqual(parsedRows[0].letter, 'A', 'A. 被错误当成选项字母');
  assert.strictEqual(parsedRows[0].text, '苹果');
  ctx.__test.applyPageAnswer({ opts: parsedRows }, ['A']);
  assert.strictEqual(fixture.rows[0].className, 'option is-active', '选项点击未执行');
  assert.strictEqual(ctx.__test.rowSelected(fixture.rows[0]), true, 'is-active 选中状态未识别');
  fixture.rows[1].className = 'current';
  assert.strictEqual(ctx.__test.rowSelected(fixture.rows[1]), false, 'current 不应被误判为 cur');

  assert.strictEqual(ctx.__test.AI.accuracy, 'high', '默认应开启高精度模式');
  const beforeHighCalls = gmCalls.filter(call => call.url.endsWith('/chat/completions')).length;
  const highAnswer = await ctx.__test.aiAskPage(q);
  assert.deepStrictEqual(Array.from(highAnswer), ['C'], '高精度一致答案处理失败');
  const highCalls = gmCalls.filter(call => call.url.endsWith('/chat/completions'));
  assert.strictEqual(highCalls.length - beforeHighCalls, 2, '两次一致时不应发起第三次请求');
  assert(JSON.parse(highCalls[highCalls.length - 2].data).messages[1].content.includes('逐项'));
  assert(JSON.parse(highCalls[highCalls.length - 1].data).messages[1].content.includes('第一次候选答案'));

  assert.deepStrictEqual(
    Array.from(ctx.__test.parseAnswerLetters('分析中曾写答案：A\n重新核查\n最终答案：C', 4, false)),
    ['C'], '应取最后一个最终答案'
  );
  assert.deepStrictEqual(
    Array.from(ctx.__test.parseAnswerLetters('分析第 1 项\n最终答案：2', 4, false)),
    ['B'], '明确的最终数字答案转换失败'
  );
  assert.deepStrictEqual(
    Array.from(ctx.__test.parseAnswerLetters('最终答案：AB', 4, false)),
    [], '单选返回多个字母时不应猜第一个'
  );

  const judged = createSequenceContext(config, ['C', 'A', 'C']);
  assert.deepStrictEqual(Array.from(await judged.ctx.__test.aiAskPage(q)), ['C'], '第三次裁决应采纳一致答案');
  assert.strictEqual(judged.calls.length, 3, '两次分歧后应进行第三次裁决');

  const unresolved = createSequenceContext(config, ['C', 'A', 'B']);
  assert.strictEqual(await unresolved.ctx.__test.aiAskPage(q), null, '三次不一致时必须留作人工');
  assert.strictEqual(unresolved.calls.length, 3);

  const fast = createSequenceContext(config, ['A'], { aiAccuracy: 'fast' });
  assert.deepStrictEqual(Array.from(await fast.ctx.__test.aiAskPage(q)), ['A'], '快速模式答案处理失败');
  assert.strictEqual(fast.calls.length, 1, '快速模式只能请求一次');

  // 普通题不经过字体解析，文字保持原样，仍只发一次快速模式请求。
  const plainFontCtx = createSequenceContext(config, ['C'], { aiAccuracy: 'fast' });
  const plainFont = makeFontQuestionFixture(plainFontCtx.ctx, 'plain');
  assert.strictEqual(plainFontCtx.ctx.__test.restorePageQuestion(plainFont.q), plainFont.q);
  assert.strictEqual(plainFont.q.text, '【单选题】甲乙');
  assert.deepStrictEqual(Array.from(await plainFontCtx.ctx.__test.aiAskPage(plainFont.q)), ['C']);
  assert.strictEqual(plainFontCtx.calls.length, 1, '普通题不应增加字体或 AI 请求');

  // 合成字形：题干、选项都还原，宿主 DOM 保留混淆原文。
  const mappedFontCtx = createSequenceContext(config, ['C']);
  installFakeFontLibrary(mappedFontCtx.ctx, false);
  const mappedFont = makeFontQuestionFixture(mappedFontCtx.ctx, 'mapped');
  const mappedQ = mappedFontCtx.ctx.__test.restorePageQuestion(mappedFont.q);
  const expectedStem = '【单选题】' + String.fromCodePoint(fontExpected['甲'], fontExpected['乙']);
  const expectedA = String.fromCodePoint(fontExpected['丙']) + '丁';
  const expectedB = String.fromCodePoint(fontExpected['戊'], fontExpected['己']);
  assert(mappedQ && !mappedFont.q.__garbled, '合成字体还原失败：' + mappedFont.q.__fontError);
  assert.strictEqual(mappedQ.text, expectedStem, '题干汉字未按字形指纹还原');
  assert.strictEqual(mappedQ.opts[0].text, expectedA, '选项 A 未正确还原或字母未剥离');
  assert.strictEqual(mappedQ.opts[1].text, expectedB, '选项 B 未正确还原');
  assert.strictEqual(mappedFont.q.text, '【单选题】甲乙', '还原副本不应修改原问题对象');
  assert.strictEqual(mappedFont.stemEl.textContent, '【单选题】甲乙', '还原过程修改了宿主 DOM');
  assert.strictEqual(mappedFont.optionA.textContent, 'A. 丙丁', '选项 DOM 被修改');
  assert.deepStrictEqual(Array.from(await mappedFontCtx.ctx.__test.aiAskPageRaw(mappedQ)), ['C']);
  assert.strictEqual(mappedFontCtx.calls.length, 1);
  assert(mappedFontCtx.ctx.__autoStudyLastPrompt.includes(expectedStem), 'AI 请求仍使用混淆题干');
  assert(mappedFontCtx.ctx.__autoStudyLastPrompt.includes(expectedA), 'AI 请求仍使用混淆选项');
  assert(!mappedFontCtx.ctx.__autoStudyLastPrompt.includes('【单选题】甲乙'), 'AI 题面混入原始乱码');

  // 字体缺失、指纹缺字和同名字体归属不明：全部零请求、永久标记本题。
  for (const [mode, missingMap] of [['missing-font', false], ['missing-map', true], ['ambiguous', false]]) {
    const blocked = createSequenceContext(config, ['C']);
    installFakeFontLibrary(blocked.ctx, missingMap);
    const fixture = makeFontQuestionFixture(blocked.ctx, mode);
    assert.strictEqual(await blocked.ctx.__test.aiAskPage(fixture.q), null, `${mode} 不应给出答案`);
    assert.strictEqual(blocked.calls.length, 0, `${mode} 不应发起 AI 请求`);
    assert.strictEqual(fixture.q.__garbled, true, `${mode} 未标记永久乱码失败`);
  }

  // 模型即使同时给了选项，只要报告文字异常就必须熔断。
  assert.strictEqual(ctx.__test.modelReportedGarbledText('题目中存在大量异常字符\n最终答案：C'), true);
  assert.strictEqual(ctx.__test.modelReportedGarbledText('无法识别题目，但猜测最终答案：A'), true);
  assert.strictEqual(ctx.__test.modelReportedGarbledText('题目没有乱码或异常字符。\n最终答案：C'), false);
  const garbledFast = createSequenceContext(
    config, ['题目中存在大量异常字符\n最终答案：C'], { aiAccuracy: 'fast' }
  );
  const garbledQ = { text: q.text, type: q.type, opts: q.opts.map(opt => Object.assign({}, opt)) };
  assert.strictEqual(await garbledFast.ctx.__test.aiAskPage(garbledQ), null, '模型报告乱码时不应采纳选项');
  assert.strictEqual(garbledFast.calls.length, 1);
  assert.strictEqual(garbledQ.__garbled, true, '模型乱码熔断未标记本题');

  const garbledReview = createSequenceContext(config, [
    'C', '复核时发现字符异常，无法识别文字\n最终答案：A', 'C'
  ]);
  const reviewQ = {
    text: '【单选题】正常题干', type: 'single',
    opts: [{ letter: 'A', text: '甲' }, { letter: 'B', text: '乙' }, { letter: 'C', text: '丙' }]
  };
  assert.strictEqual(await garbledReview.ctx.__test.aiAskPage(reviewQ), null, '复核乱码不应退回首次答案');
  assert.strictEqual(garbledReview.calls.length, 2, '复核报告乱码后不应继续第三次裁决');
  assert.strictEqual(reviewQ.__garbled, true);

  const emptyPage = makeEmptyPageFixture(ctx);
  ctx.__test.autoAdvance([emptyPage.doc]);
  assert.strictEqual(emptyPage.clicks(), 0, '空白页第一次出现时不应立即跳节');
  ctx.__test.emptySectionState.since -= 5000;
  ctx.__test.autoAdvance([emptyPage.doc]);
  assert.strictEqual(emptyPage.clicks(), 1, '空白页稳定后应点击下一节');
  ctx.__test.autoAdvance([emptyPage.doc]);
  assert.strictEqual(emptyPage.clicks(), 1, '跳节冷却期间不应重复点击');

  const watchedCtx = createContext({ userscript: true, config, gmImpl() {} });
  const watchedVideo = makeVideoTaskFixture(watchedCtx);
  assert(watchedCtx.__test.findCompletedVideoTask([watchedVideo.doc]), '没有识别 ans-job-finished 视频任务');
  watchedCtx.__test.autoAdvance([watchedVideo.doc]);
  assert.strictEqual(watchedVideo.navigations(), 1, '已完成视频任务没有跳到下一节');
  watchedCtx.__test.autoAdvance([watchedVideo.doc]);
  assert.strictEqual(watchedVideo.navigations(), 1, '已完成视频跳转冷却期间不应重复跳节');

  const directCtx = createContext({ userscript: true, config, gmImpl() {} });
  const directVideo = makeVideoTaskFixture(directCtx, { direct: true });
  assert(directCtx.__test.findCompletedVideoTask([directVideo.doc]), '同文档的视频完成标记未识别');
  directCtx.__test.autoAdvance([directVideo.doc]);
  assert.strictEqual(directVideo.navigations(), 1, '零进度但已完成的视频没有跳过');
  assert.strictEqual(directVideo.playCalls(), 0, '已完成视频不应重新播放');

  const unfinishedVideoCtx = createContext({ userscript: true, config, gmImpl() {} });
  const unfinishedVideo = makeVideoTaskFixture(unfinishedVideoCtx, { completed: false });
  assert.strictEqual(unfinishedVideoCtx.__test.findCompletedVideoTask([unfinishedVideo.doc]), null);
  unfinishedVideoCtx.__test.autoAdvance([unfinishedVideo.doc]);
  assert.strictEqual(unfinishedVideo.navigations(), 0, '未完成视频不应被误跳过');

  const mixedVideoCtx = createContext({ userscript: true, config, gmImpl() {} });
  const mixedVideo = makeVideoTaskFixture(mixedVideoCtx, { unfinishedVideo: true });
  assert.strictEqual(
    mixedVideoCtx.__test.findCompletedVideoTask([mixedVideo.doc]),
    null,
    '同页还有未完成视频时不能跳过整节'
  );

  const pendingWorkCtx = createContext({ userscript: true, config, gmImpl() {} });
  const pendingWork = makeVideoTaskFixture(pendingWorkCtx, { pendingWork: true });
  assert.strictEqual(
    pendingWorkCtx.__test.findCompletedVideoTask([pendingWork.doc]),
    null,
    '同页还有未完成测验任务时不能跳过整节'
  );

  // 播放器明确完成可以覆盖滞后的任务标签，但其他任务点仍有保护。
  const statusSplitCtx = createContext({ userscript: true, config, gmImpl() {} });
  const statusSplit = makeVideoTaskFixture(statusSplitCtx, { completed: false });
  assert.strictEqual(statusSplitCtx.__test.findCompletedVideoTask([statusSplit.doc]), null);
  const splitSignal = statusSplitCtx.__test.processVideoStatusPayload(
    'https://example.test/ananas/status/task1?clazzId=1',
    'callback({"isFinished":true});',
    statusSplitCtx.document.defaultView
  );
  assert(splitSignal && splitSignal.finished, 'JSONP 中的 isFinished=true 未识别');
  const splitResult = statusSplitCtx.__test.findCompletedVideoTask([statusSplit.doc]);
  assert(splitResult && splitResult.source === 'player', '播放器完成状态没有覆盖滞后标签');
  statusSplitCtx.__test.autoAdvance([statusSplit.doc]);
  assert.strictEqual(statusSplit.navigations(), 1, '明确完成的视频没有进入下一任务');

  const statusPendingCtx = createContext({ userscript: true, config, gmImpl() {} });
  const statusPending = makeVideoTaskFixture(statusPendingCtx, { pendingWork: true });
  statusPendingCtx.__test.processVideoStatusPayload(
    'https://example.test/ananas/status/task1', '{"isPassed":true}', statusPendingCtx.document.defaultView
  );
  assert.strictEqual(
    statusPendingCtx.__test.findCompletedVideoTask([statusPending.doc]),
    null,
    '播放器完成但同节其他任务未完成时不能跳整节'
  );

  const statusFalseCtx = createContext({ userscript: true, config, gmImpl() {} });
  const statusFalse = makeVideoTaskFixture(statusFalseCtx, { completed: false });
  statusFalseCtx.__test.processVideoStatusPayload(
    'https://example.test/ananas/status/task1', '{"isPassed":false}', statusFalseCtx.document.defaultView
  );
  assert.strictEqual(statusFalseCtx.__test.findCompletedVideoTask([statusFalse.doc]), null, '明确未完成不能跳节');

  const unknownStatusCtx = createContext({ userscript: true, config, gmImpl() {} });
  const unknownStatus = makeVideoTaskFixture(unknownStatusCtx, { completed: false });
  unknownStatusCtx.__test.processVideoStatusPayload(
    'https://example.test/ananas/status/task1', '{"status":1}', unknownStatusCtx.document.defaultView
  );
  assert.strictEqual(unknownStatusCtx.__test.videoStatusSignals().length, 0, '普通 status=1 被误当完成字段');
  assert.strictEqual(unknownStatusCtx.__test.findCompletedVideoTask([unknownStatus.doc]), null);

  const mismatchStatusCtx = createContext({ userscript: true, config, gmImpl() {} });
  const mismatchStatus = makeVideoTaskFixture(mismatchStatusCtx, { completed: false });
  mismatchStatusCtx.__test.processVideoStatusPayload(
    'https://example.test/ananas/status/another-video', '{"isFinished":true}', mismatchStatusCtx.document.defaultView
  );
  assert.strictEqual(mismatchStatusCtx.__test.findCompletedVideoTask([mismatchStatus.doc]), null, '其他视频的完成状态串到当前任务');

  const conflictStatusCtx = createContext({ userscript: true, config, gmImpl() {} });
  const conflictStatus = makeVideoTaskFixture(conflictStatusCtx, { completed: false });
  conflictStatusCtx.__test.processVideoStatusPayload(
    'https://example.test/ananas/status/task1', '{"isFinished":true,"isPassed":false}', conflictStatusCtx.document.defaultView
  );
  assert.strictEqual(conflictStatusCtx.__test.findCompletedVideoTask([conflictStatus.doc]), null, '冲突完成字段不能猜');

  const directStatusCtx = createContext({ userscript: true, config, gmImpl() {} });
  const directStatus = makeVideoTaskFixture(directStatusCtx, { direct: true });
  directStatus.doc.body.textContent = '';
  directStatusCtx.__test.processVideoStatusPayload(
    'https://example.test/multimedia/log/a/direct1', '{"isPassed":true}', directStatusCtx.document.defaultView
  );
  const directStatusResult = directStatusCtx.__test.findCompletedVideoTask([directStatus.doc]);
  assert(directStatusResult && directStatusResult.source === 'player', '同文档播放器完成状态未识别');
  directStatusCtx.__test.autoAdvance([directStatus.doc]);
  assert.strictEqual(directStatus.navigations(), 1);
  assert.strictEqual(directStatus.playCalls(), 0, '明确完成的同文档视频不应重播');

  // 状态探针只增加监听：XHR 原调用和 fetch 原响应必须原样保留。
  const probeCtx = createContext({ userscript: true, config, gmImpl() {} });
  let xhrOpenCalls = 0;
  function FakeXHR() { this.listeners = {}; this.responseType = ''; }
  FakeXHR.prototype.open = function () { xhrOpenCalls++; this.openArgs = Array.from(arguments); return 'opened'; };
  FakeXHR.prototype.addEventListener = function (type, fn) { this.listeners[type] = fn; };
  let fetchCloneCalls = 0;
  const fetchStatusResponse = {
    clone() {
      fetchCloneCalls++;
      return { text: () => Promise.resolve('{"isFinished":true}') };
    }
  };
  const probeTarget = {
    XMLHttpRequest: FakeXHR,
    location: { href: 'https://example.test/ananas/modules/video/index.html?objectId=probe-fetch' },
    fetch() { return Promise.resolve(fetchStatusResponse); }
  };
  probeCtx.__test.installVideoStatusProbe(probeTarget);
  const probeXHR = new probeTarget.XMLHttpRequest();
  assert.strictEqual(probeXHR.open('GET', 'https://example.test/ananas/status/probe-xhr'), 'opened');
  assert.strictEqual(xhrOpenCalls, 1, 'XHR 原始 open 没有正确执行');
  probeXHR.responseText = '{"isPassed":true}';
  probeXHR.listeners.load();
  const returnedFetchResponse = await probeTarget.fetch('https://example.test/ananas/status/probe-fetch');
  assert.strictEqual(returnedFetchResponse, fetchStatusResponse, 'fetch 原响应被替换');
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(fetchCloneCalls, 1, '状态 fetch 没有只读复制响应');
  assert(probeCtx.__test.videoStatusSignals().some(item => item.objectId === 'probe-xhr' && item.finished), 'XHR 完成响应未接入');
  assert(probeCtx.__test.videoStatusSignals().some(item => item.objectId === 'probe-fetch' && item.finished), 'fetch 完成响应未接入');

  const playCtx = createContext({ userscript: true, config, gmImpl() {} });
  function makeTaskVideo(done) {
    const mediaDoc = { defaultView: null };
    const parent = makeElement(mediaDoc, '');
    parent.className = done ? 'ans-job-finished' : 'ans-job';
    const frame = makeElement(mediaDoc, '');
    const src = 'https://example.test/ananas/modules/video/index.html';
    frame.parentElement = parent;
    frame.getAttribute = function (name) { return name === 'src' ? src : null; };
    frame.closest = function () { return done ? parent : null; };
    mediaDoc.defaultView = { frameElement: frame, parent: null };
    const video = makeElement(mediaDoc, '');
    video.duration = 100;
    video.currentTime = 0;
    video.readyState = 4;
    video.paused = true;
    video.playCalls = 0;
    video.play = function () { video.playCalls++; return Promise.resolve(); };
    return video;
  }
  const finishedTaskVideo = makeTaskVideo(true);
  const unfinishedTaskVideo = makeTaskVideo(false);
  assert.strictEqual(playCtx.__test.videoInFinishedTask(finishedTaskVideo), true);
  assert.strictEqual(playCtx.__test.videoInFinishedTask(unfinishedTaskVideo), false);
  const playRoot = playCtx.document;
  playRoot.querySelectorAll = function (selector) {
    return selector === 'video' ? [finishedTaskVideo, unfinishedTaskVideo] : [];
  };
  playCtx.__test.keepPlaying(playRoot);
  assert.strictEqual(finishedTaskVideo.playCalls, 0, '多视频页面不应续播已完成视频');
  assert.strictEqual(unfinishedTaskVideo.playCalls, 1, '多视频页面应继续未完成视频');

  const completedCalls = [];
  const completedCtx = createContext({
    userscript: true,
    config,
    gmImpl(options) { completedCalls.push(options); }
  });
  const completedPage = makeCompletedQuizFixture(completedCtx);
  const completedResult = completedCtx.__test.findCompletedPageQuiz([completedPage.doc]);
  assert(completedResult, '没有识别已完成的历史测验结果页');
  assert.strictEqual(completedResult.score, '66.7', '历史成绩读取错误');
  assert.strictEqual(completedCtx.__test.handlePageQuiz([completedPage.doc]), true);
  assert.strictEqual(completedPage.navigations(), 1, '已完成测验没有跳到下一节');
  assert.strictEqual(completedPage.redoClicks(), 0, '已完成测验不应点击重做');
  assert.strictEqual(completedCalls.length, 0, '已完成测验不应发起 AI 请求');
  completedCtx.__test.handlePageQuiz([completedPage.doc]);
  assert.strictEqual(completedPage.navigations(), 1, '旧结果页未卸载时不应重复跳节');

  const unfinishedCtx = createContext({ userscript: true, config, gmImpl() {} });
  unfinishedCtx.document.body.textContent = '任务点已完成 【单选题】普通未完成测验 A 正确 B 错误';
  const taskOnly = makeElement(unfinishedCtx.document, '任务点已完成');
  unfinishedCtx.document.querySelectorAll = function (selector) {
    return selector === 'div,p,span,section,article,button,a' ? [taskOnly] : [];
  };
  assert.strictEqual(
    unfinishedCtx.__test.findCompletedPageQuiz([unfinishedCtx.document]),
    null,
    '只有视频任务点完成时不能误判整个测验已完成'
  );

  // 作答前的规则说明也可能写着“不及格请重新作答”，但没有重做按钮，绝不能判失败并停答。
  const freshRuleCtx = createContext({ userscript: true, config, gmImpl() {} });
  const freshRulePage = makeQuizResultFixture(freshRuleCtx, {
    failed: true,
    completed: false,
    score: null,
    redo: false,
    failureText: '测验说明：成绩不及格请重新作答，及格后方可进入下一节'
  });
  assert.strictEqual(
    freshRuleCtx.__test.findRequiredPageQuizRetry([freshRulePage.doc]),
    null,
    '作答前的规则说明被误判成本轮不及格结果'
  );
  freshRuleCtx.__test.handlePageQuiz([freshRulePage.doc]);
  assert.strictEqual(freshRuleCtx.__test.pageQuizState().done, false, '无重做按钮时错误停止了首次作答');
  assert.strictEqual(freshRulePage.redoClicks(), 0);
  assert.strictEqual(freshRulePage.navigations(), 0);
  assert.strictEqual(freshRuleCtx.__reloads, 0);

  // 截图场景：提交后出现“未达到及格线，请重做”浮层，只有取消/确定，没有独立重做按钮。
  // 失败浮层必须优先于“等待已完成”和单次刷新，点确定而不是取消，并清空旧答案。
  const failedModalCtx = createContext({ userscript: true, config, gmImpl() {} });
  const failedModalPage = makeQuizResultFixture(failedModalCtx, {
    failed: false,
    completed: false,
    score: null,
    redo: false,
    failureModal: true
  });
  const failedModalState = failedModalCtx.__test.pageQuizState();
  failedModalState.doc = failedModalPage.doc;
  failedModalState.submitted = true;
  failedModalState.submittedAt = Date.now() - 20000;
  failedModalState.waitingCompletion = true;
  failedModalCtx.__test.pageQuizCache().previousWrongAnswer = ['B'];
  const failedModalResult = failedModalCtx.__test.findRequiredPageQuizRetry([failedModalPage.doc]);
  assert(failedModalResult && failedModalResult.modal, '未识别只有确定按钮的不及格浮层');
  assert.strictEqual(failedModalCtx.__test.handlePageQuiz([failedModalPage.doc]), true);
  assert.strictEqual(failedModalPage.confirmClicks(), 1, '不及格浮层没有点击确定');
  assert.strictEqual(failedModalPage.cancelClicks(), 0, '不及格浮层不应点击取消');
  assert.strictEqual(failedModalPage.redoClicks(), 0, '该场景不存在独立重做按钮');
  assert.strictEqual(failedModalPage.navigations(), 0, '不及格浮层出现时跳到了下一节');
  assert.strictEqual(failedModalCtx.__reloads, 0, '失败浮层不应进入等待完成后的刷新');
  assert.strictEqual(Object.keys(failedModalCtx.__test.pageQuizCache()).length, 0, '浮层重做仍复用了旧答案');
  assert.strictEqual(failedModalCtx.__test.pageQuizState().submitted, false);
  assert.strictEqual(failedModalCtx.__test.pageQuizState().waitingCompletion, false);
  failedModalCtx.__test.handlePageQuiz([failedModalPage.doc]);
  assert.strictEqual(failedModalPage.confirmClicks(), 1, '旧失败浮层不应被重复点击');

  // 必须及格的测验：无分数 + 不及格 + 重做，应清空缓存并重做，不能跳节。
  const retryCtx = createContext({ userscript: true, config, gmImpl() {} });
  const retryPage = makeQuizResultFixture(retryCtx, { failed: true, completed: false, score: null });
  assert(retryCtx.__test.findRequiredPageQuizRetry([retryPage.doc]), '未识别必须重做结果页');
  assert.strictEqual(retryCtx.__test.findCompletedPageQuiz([retryPage.doc]), null, '不及格页不能算已完成');
  retryCtx.__test.pageQuizCache().previousWrongAnswer = ['A'];
  assert.strictEqual(retryCtx.__test.handlePageQuiz([retryPage.doc]), true);
  assert.strictEqual(retryPage.redoClicks(), 1, '不及格时没有点击重做');
  assert.strictEqual(retryPage.navigations(), 0, '不及格时跳到了下一节');
  assert.strictEqual(retryCtx.__reloads, 0, '不及格重试不应先刷新页面');
  assert.strictEqual(Object.keys(retryCtx.__test.pageQuizCache()).length, 0, '重做仍在复用上一轮答案缓存');
  assert.strictEqual(retryCtx.__test.pageQuizState().needAdvance, false);
  retryCtx.__test.handlePageQuiz([retryPage.doc]);
  assert.strictEqual(retryPage.redoClicks(), 1, '旧重做结果 DOM 不应被重复点击');
  const retryPrompt = retryCtx.__test.buildPageAskPrompt(q, 'answer');
  assert(retryPrompt.includes('第 1 次重做'), '重做提示没有要求 AI 重新独立审题');
  const secondRetryState = retryCtx.__test.pageQuizState();
  secondRetryState.submitted = true;
  secondRetryState.submittedAt = Date.now() - 20000;
  secondRetryState.retryHandled = false;
  secondRetryState.retryKey = '';
  retryCtx.__test.handlePageQuiz([retryPage.doc]);
  assert.strictEqual(retryPage.redoClicks(), 2, '第二次仍未及格时不应停止重做');
  assert.strictEqual(retryPage.navigations(), 0);

  // 已有成绩但任务完成标记延迟：等待 -> 仅刷新一次 -> 标记出现后跳节，不点可选重做。
  const delayedQuizCtx = createContext({ userscript: true, config, gmImpl() {} });
  const delayedQuiz = makeQuizResultFixture(delayedQuizCtx, { score: 100, completed: false });
  assert.strictEqual(delayedQuizCtx.__test.findCompletedPageQuiz([delayedQuiz.doc]), null, '只有分数不能当成完成');
  delayedQuizCtx.__test.handlePageQuiz([delayedQuiz.doc]);
  assert.strictEqual(delayedQuiz.navigations(), 0, '完成标记未出现就跳节');
  assert.strictEqual(delayedQuiz.redoClicks(), 0, '公布分数页不应消耗可选重做');
  assert.strictEqual(delayedQuizCtx.__test.pageQuizState().waitingCompletion, true);
  delayedQuizCtx.__test.platformCompletionWaits.quiz.since -= 9000;
  delayedQuizCtx.__test.handlePageQuiz([delayedQuiz.doc]);
  assert.strictEqual(delayedQuizCtx.__reloads, 1, '成绩完成状态延迟时应自动刷新一次');
  assert.strictEqual(delayedQuiz.navigations(), 0);
  delayedQuizCtx.__test.handlePageQuiz([delayedQuiz.doc]);
  assert.strictEqual(delayedQuizCtx.__reloads, 1, '同一任务不能无限自动刷新');
  delayedQuiz.complete();
  delayedQuizCtx.__test.handlePageQuiz([delayedQuiz.doc]);
  assert.strictEqual(delayedQuiz.navigations(), 1, '完成标记出现后没有跳节');
  assert.strictEqual(delayedQuiz.redoClicks(), 0);

  // 无分数、无完成标记时也不能跳；同样只刷新一次，完成标记补出后才放行。
  const pendingResultCtx = createContext({ userscript: true, config, gmImpl() {} });
  const pendingResult = makeQuizResultFixture(pendingResultCtx, { score: null, completed: false, redo: false });
  const pendingState = pendingResultCtx.__test.pageQuizState();
  pendingState.doc = pendingResult.doc;
  pendingState.submitted = true;
  pendingState.submittedAt = Date.now() - 20000;
  pendingResultCtx.__test.handlePageQuiz([pendingResult.doc]);
  assert.strictEqual(pendingResult.navigations(), 0, '结果未明时超时跳节');
  assert.strictEqual(pendingResultCtx.__reloads, 0);
  assert.strictEqual(pendingResultCtx.__test.pageQuizState().submitted, true);
  assert.strictEqual(pendingResultCtx.__test.pageQuizState().needAdvance, false);
  pendingResultCtx.__test.platformCompletionWaits.quiz.since -= 9000;
  pendingResultCtx.__test.handlePageQuiz([pendingResult.doc]);
  assert.strictEqual(pendingResultCtx.__reloads, 1, '无分数的完成标记延迟也应刷新一次');
  assert.strictEqual(pendingResult.navigations(), 0);
  pendingResultCtx.__test.handlePageQuiz([pendingResult.doc]);
  assert.strictEqual(pendingResultCtx.__reloads, 1, '无分数结果页不能无限刷新');
  pendingResult.complete();
  pendingResultCtx.__test.handlePageQuiz([pendingResult.doc]);
  assert.strictEqual(pendingResult.navigations(), 1, '无分数但平台确认完成后没有放行');

  // 最后一节停止；末章空白页也不能被“下一节”按钮绕过。
  const lastCtx = createContext({ userscript: true, config, gmImpl() {} });
  const lastActive = makeElement(lastCtx.document, '最后一节');
  lastActive.id = 'cur99';
  lastActive.className = 'posCatalog_select posCatalog_active';
  lastCtx.document.querySelector = selector => selector === '#coursetree .posCatalog_active' ? lastActive : null;
  lastCtx.document.querySelectorAll = function (selector) {
    if (selector === '#coursetree .posCatalog_select') return [lastActive];
    return [];
  };
  assert.strictEqual(lastCtx.__test.isLastSection(), true);
  assert.strictEqual(lastCtx.nextSection(), false);
  assert.strictEqual(lastCtx.__autoStudyTimer, null, '最后一节没有停止自动化');

  const lastEmptyCtx = createContext({ userscript: true, config, gmImpl() {} });
  const lastEmpty = makeEmptyPageFixture(lastEmptyCtx);
  const originalEmptyAll = lastEmpty.doc.querySelectorAll;
  lastEmpty.doc.querySelectorAll = function (selector) {
    if (selector === '#coursetree .posCatalog_select') return [lastEmpty.active];
    return originalEmptyAll(selector);
  };
  lastEmptyCtx.__test.handleEmptySection([lastEmpty.doc]);
  lastEmptyCtx.__test.emptySectionState.since -= 5000;
  lastEmptyCtx.__test.handleEmptySection([lastEmpty.doc]);
  assert.strictEqual(lastEmpty.clicks(), 0, '末章空白页不应再点下一节');
  assert.strictEqual(lastEmptyCtx.__autoStudyTimer, null, '末章空白页没有停止自动化');

  // 最后一节仍有下一卡片时先切卡片，不能提前停跑。
  const lastCardsCtx = createContext({ userscript: true, config, gmImpl() {} });
  const lastCardsActive = makeElement(lastCardsCtx.document, '最后一节');
  lastCardsActive.id = 'cur100';
  lastCardsActive.className = 'posCatalog_select posCatalog_active';
  const cardA = makeElement(lastCardsCtx.document, '卡片一');
  cardA.className = 'active';
  const cardB = makeElement(lastCardsCtx.document, '卡片二');
  let cardClicks = 0;
  cardB.click = function () { cardClicks++; };
  lastCardsCtx.document.querySelector = selector => selector === '#coursetree .posCatalog_active' ? lastCardsActive : null;
  lastCardsCtx.document.querySelectorAll = function (selector) {
    if (selector === '#coursetree .posCatalog_select') return [lastCardsActive];
    if (selector === '#prev_tab .prev_ul li, .prev_ul li') return [cardA, cardB];
    return [];
  };
  lastCardsCtx.__test.autoAdvance([lastCardsCtx.document], { key: 'last-card-video' });
  assert.strictEqual(cardClicks, 1, '末章还有卡片时没有先切卡片');
  assert(lastCardsCtx.__autoStudyTimer, '末章还有卡片时提前停止自动化');

  // 最后一节的测验完成后也应先切剩余卡片，而不是直接停止。
  const lastQuizCtx = createContext({ userscript: true, config, gmImpl() {} });
  const lastQuiz = makeQuizResultFixture(lastQuizCtx, { score: 100, completed: true });
  const lastQuizActive = lastQuiz.doc.querySelector('#coursetree .posCatalog_active');
  const originalLastQuizAll = lastQuiz.doc.querySelectorAll;
  const lastQuizCardA = makeElement(lastQuiz.doc, '测验卡片');
  lastQuizCardA.className = 'active';
  const lastQuizCardB = makeElement(lastQuiz.doc, '下一卡片');
  let lastQuizCardClicks = 0;
  lastQuizCardB.click = function () { lastQuizCardClicks++; };
  lastQuiz.doc.querySelectorAll = function (selector) {
    if (selector === '#coursetree .posCatalog_select') return [lastQuizActive];
    if (selector === '#prev_tab .prev_ul li, .prev_ul li') return [lastQuizCardA, lastQuizCardB];
    return originalLastQuizAll(selector);
  };
  lastQuizCtx.__test.handlePageQuiz([lastQuiz.doc]);
  assert.strictEqual(lastQuizCardClicks, 1, '末章测验完成后没有先切下一卡片');
  assert.strictEqual(lastQuiz.navigations(), 0);
  assert(lastQuizCtx.__autoStudyTimer, '末章测验仍有卡片时提前停止自动化');

  const menuCtx = createContext({
    userscript: true,
    config: Object.assign({}, config, { playbackRate: 3 }),
    gmImpl() {}
  });
  const speedMenu = menuCtx.__menus.find(item => item.name.includes('设置倍速'));
  assert(speedMenu, '倍速菜单未注册');
  speedMenu.fn();
  speedMenu.fn();
  assert.strictEqual(menuCtx.__promptCalls, 0, '倍速菜单不应再使用原生 prompt');
  assert.strictEqual(menuCtx.document.getElementById('__asRate').value, 3, '设置面板没有读出当前倍速');
  menuCtx.document.getElementById('__asRate').value = 99;
  menuCtx.document.getElementById('__asSave').onclick();
  assert.strictEqual(menuCtx.__reloads, 0, '非法倍速不应保存和刷新');
  assert(menuCtx.document.getElementById('__asError').textContent.includes('0.25'), '非法倍速没有面板内提示');
  menuCtx.document.getElementById('__asRate').value = 2;
  menuCtx.document.getElementById('__asSave').onclick();
  assert.strictEqual(menuCtx.__gmWrites.at(-1).value.playbackRate, 2, '设置面板没有保存 2 倍速');
  assert.strictEqual(menuCtx.__reloads, 1, '设置保存后应刷新一次');

  const restoreConfig = Object.assign({}, config, { playbackRate: 3 });
  const restoreCtx = createContext({ userscript: true, config: restoreConfig, gmImpl() {} });
  const restoreMenu = restoreCtx.__menus.find(item => item.name.includes('恢复 2 倍速'));
  assert(restoreMenu, '一键恢复 2 倍速菜单未注册');
  restoreMenu.fn();
  assert.strictEqual(restoreCtx.__gmWrites.at(-1).value.playbackRate, 2, '一键恢复没有写入 2 倍速');
  assert.strictEqual(restoreCtx.__promptCalls, 0, '一键恢复不应弹 prompt');
  assert.strictEqual(restoreCtx.__reloads, 1, '一键恢复后应刷新');

  const rateCtx = createContext({
    userscript: true,
    config: Object.assign({}, config, { playbackRate: 3 }),
    gmImpl() {}
  });
  const goodVideo = { playbackRate: 1, defaultPlaybackRate: 1 };
  rateCtx.__test.applyVideoRate(goodVideo);
  assert.strictEqual(goodVideo.playbackRate, 3, '正常支持的 3 倍速没有生效');
  goodVideo.playbackRate = 1;
  rateCtx.__test.applyVideoRate(goodVideo);
  assert.strictEqual(goodVideo.playbackRate, 1, '短时间重复 ratechange 应被限流');

  let limitedRate = 1;
  const limitedVideo = {
    defaultPlaybackRate: 1,
    get playbackRate() { return limitedRate; },
    set playbackRate(value) { limitedRate = Math.min(value, 2); }
  };
  rateCtx.__test.applyVideoRate(limitedVideo);
  limitedVideo.__autoStudyRateAt -= 1000;
  rateCtx.__test.applyVideoRate(limitedVideo);
  limitedVideo.__autoStudyRateAt -= 1000;
  limitedVideo.__autoStudyRateSince -= 6000;
  rateCtx.__test.applyVideoRate(limitedVideo);
  assert.strictEqual(limitedVideo.__autoStudyFallbackRate, 2, '播放器持续重置高倍速后应降级');
  assert.strictEqual(limitedVideo.playbackRate, 2, '降级后没有恢复到可播放的 2 倍速');

  let rejectingRate = 1;
  const rejectingVideo = {
    defaultPlaybackRate: 1,
    get playbackRate() { return rejectingRate; },
    set playbackRate(value) {
      if (value > 2) throw new Error('rate rejected');
      rejectingRate = value;
    }
  };
  rateCtx.__test.applyVideoRate(rejectingVideo);
  assert.strictEqual(rejectingVideo.playbackRate, 2, '播放器拒绝倍速赋值后应立即退回 2 倍速');

  let manualTimeout;
  const timeoutCtx = createContext({
    userscript: true,
    config,
    gmImpl(options) {
      manualTimeout = () => options.ontimeout();
      return { abort() {} };
    }
  });
  const timeoutPromise = timeoutCtx.__test.aiFetch(config.aiEndpoint, { timeout: 20 });
  manualTimeout();
  await assert.rejects(timeoutPromise, err => err && err.name === 'AbortError', 'GM 超时没有转成 AbortError');

  let abortCalled = false;
  const abortCtx = createContext({
    userscript: true,
    config,
    gmImpl(options) {
      return { abort() { abortCalled = true; options.onabort(); } };
    }
  });
  const controller = new AbortController();
  const abortPromise = abortCtx.__test.aiFetch(config.aiEndpoint, { signal: controller.signal });
  controller.abort();
  await assert.rejects(abortPromise, err => err && err.name === 'AbortError');
  assert.strictEqual(abortCalled, true, 'AbortController 未取消 GM 请求');

  let fetchCalled = false;
  const consoleCtx = createContext({
    userscript: false,
    config,
    fetchImpl(url, options) {
      fetchCalled = true;
      assert.strictEqual(url, config.aiEndpoint);
      assert.strictEqual(options.method, 'POST');
      return Promise.resolve(response(JSON.stringify({ choices: [{ message: { content: 'C' } }] })));
    }
  });
  const consoleAnswer = await consoleCtx.__test.aiAskPageRaw(q);
  assert.deepStrictEqual(Array.from(consoleAnswer), ['C'], '控制台 fetch 通道答题失败');
  assert.strictEqual(fetchCalled, true, '控制台版没有回退到 fetch');

  console.log('PASS: font restore/no DOM mutation, missing-font/missing-glyph/ambiguous-font zero requests, model-garble circuit breaker/no review fallback, plain-question regression, player-status JSONP/XHR/fetch stale-label guards, completed-video advance/no replay, multi-video guards, last-section stop/next-card guards, unsubmitted-rule/no-redo guard, failed-modal confirm/retry without completion wait, required-retry/cache-reset vs optional-redo, quiz completion-marker wait/single-refresh with and without score, completed-quiz advance/no redo/no AI, unfinished-task guards, empty-page advance, playback menu/throttle/fallback, GM/fetch AI and answer parsing');
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
