/* 特殊执行名单页交互（原型）
 *
 * 这是**前端原型的模拟实现**：名单数据、文件解析结果、批次状态全部在内存里。
 * 真实系统里：文件解析与校验、一人一标签校验、批次落库、执行时名单校验都在后端完成。
 *
 * 演示数据口径：预览「解析条数 / 通过 / 重复非法」与导入后的名单条数、批次条数三者一致。
 */
(function () {
  var root = document.querySelector('.sl-page');
  if (!root) return;

  // ── 字典 ──────────────────────────────────────────────
  var TAGS = {
    no_adjust: { en: 'No adjustment', zh: '不参与调额', badge: 'sl-badge-gray' },
    increase_only: { en: 'Increase only', zh: '仅参与提额', badge: 'sl-badge-green' },
    decrease_only: { en: 'Decrease only', zh: '仅参与降额', badge: 'sl-badge-orange' }
  };
  var LEVELS = {
    user: { en: 'User', zh: '用户级' },
    account: { en: 'Account', zh: '账户级' }
  };
  var SOURCES = {
    file: { en: 'File', zh: '文件上传' },
    manual: { en: 'Manual', zh: '手工维护' }
  };
  var BATCH_STATUS = {
    active: { en: 'Active', zh: '生效中', badge: 'sl-badge-blue' },
    overwritten: { en: 'Overwritten', zh: '已覆盖', badge: 'sl-badge-gray' },
    closed: { en: 'Closed', zh: '已作废', badge: 'sl-badge-gray' }
  };

  function isZh() {
    return document.documentElement.getAttribute('data-lang') === 'zh';
  }

  function attr(el, en, zh) {
    el.setAttribute('data-en', en);
    el.setAttribute('data-zh', zh);
    el.textContent = isZh() ? zh : en;
    return el;
  }

  function fmt(n) {
    return Number(n).toLocaleString('en-US');
  }

  function shortId(id) {
    return id.length > 22 ? id.slice(0, 12) + '…' + id.slice(-6) : id;
  }

  function nowText() {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
      p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }

  var batchSeq = 3;
  function nextBatchNo() {
    batchSeq += 1;
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return 'SL' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
      String(batchSeq).padStart(3, '0');
  }

  // ── 演示数据：确定性生成（同一批次每次生成结果一致）──────
  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hexId(rnd) {
    var out = '';
    while (out.length < 64) {
      out += Math.floor(rnd() * 4294967296).toString(16).padStart(8, '0');
    }
    return out.slice(0, 64).toUpperCase();
  }

  var MANUAL_POOL = [
    ['user', 'increase_only', 'Staff组', 'manual'],
    ['user', 'increase_only', '白名单', 'manual'],
    ['user', 'decrease_only', '人工降额名单', 'manual']
  ];
  var FILE_POOL = [
    ['account', 'no_adjust', '回捞组', 'file'],
    ['account', 'no_adjust', '激进提额组', 'file'],
    ['account', 'no_adjust', '降额实验组', 'file'],
    ['account', 'no_adjust', '模型切换实验组', 'file'],
    ['account', 'decrease_only', '风险触发组', 'file']
  ];

  function buildRows(batchNo, count, createdAt) {
    var rnd = mulberry32(hashStr(batchNo));
    var rows = [];
    for (var i = 0; i < count; i += 1) {
      var manual = rnd() < 0.12;
      var pool = manual ? MANUAL_POOL : FILE_POOL;
      var spec = pool[Math.floor(rnd() * pool.length)];
      rows.push({
        cid: hexId(rnd),
        od: String(10000000 + Math.floor(rnd() * 89999999)),
        level: spec[0], tag: spec[1], group: spec[2], source: spec[3],
        updatedAt: createdAt
      });
    }
    return rows;
  }

  // ── 状态 ──────────────────────────────────────────────
  var INITIAL_BATCH = 'SL20261012-003';
  var state = {
    activeBatch: INITIAL_BATCH,
    batches: [
      { no: INITIAL_BATCH, source: 'file', count: 1240, status: 'active', operator: 'baksun', createdAt: '2026-10-12 08:20:31' },
      { no: 'SL20261012-002', source: 'file', count: 1842, status: 'overwritten', operator: 'baksun', createdAt: '2026-10-12 07:55:02' },
      { no: 'SL20261011-001', source: 'file', count: 1795, status: 'overwritten', operator: 'jolie', createdAt: '2026-10-11 19:03:44' }
    ],
    rows: [],
    filter: '',
    page: 1,
    pageSize: 10
  };
  state.rows = buildRows(INITIAL_BATCH, 1240, state.batches[0].createdAt);

  var el = {
    tabs: root.querySelectorAll('[data-sl-tab]'),
    panels: root.querySelectorAll('[data-sl-panel]'),
    tbody: root.querySelector('#sl-tbody'),
    batchTbody: root.querySelector('#sl-batch-tbody'),
    activeBatch: root.querySelector('#sl-active-batch'),
    total: root.querySelector('#sl-total'),
    pagerTotal: root.querySelector('#sl-pager-total'),
    pagerList: root.querySelector('#sl-pager-list'),
    pagerSize: root.querySelector('#sl-pager-size'),
    pagerJump: root.querySelector('#sl-pager-jump'),
    keyword: root.querySelector('#sl-keyword'),
    toast: root.querySelector('#sl-toast'),
    confirmTitle: root.querySelector('#sl-confirm-title'),
    confirmText: root.querySelector('#sl-confirm-text'),
    confirmOk: root.querySelector('#sl-confirm-ok'),
    uploadError: root.querySelector('#sl-upload-error'),
    uploadDetail: root.querySelector('#sl-upload-detail'),
    uploadDetailList: root.querySelector('#sl-upload-detail-list'),
    templateLink: root.querySelector('#sl-template-link'),
    singleAccountReq: root.querySelector('#sl-single-account-req')
  };

  function activeBatchObj() {
    for (var i = 0; i < state.batches.length; i += 1) {
      if (state.batches[i].no === state.activeBatch) return state.batches[i];
    }
    return null;
  }

  // ── 渲染：名单 ────────────────────────────────────────
  function visibleRows() {
    var kw = state.filter.trim().toLowerCase();
    if (!kw) return state.rows;
    return state.rows.filter(function (r) {
      return r.cid.toLowerCase().indexOf(kw) >= 0 || String(r.od).indexOf(kw) >= 0;
    });
  }

  function renderList() {
    var rows = visibleRows();
    el.tbody.innerHTML = '';

    var pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
    if (state.page > pageCount) state.page = pageCount;
    if (state.page < 1) state.page = 1;
    var start = (state.page - 1) * state.pageSize;
    var pageRows = rows.slice(start, start + state.pageSize);

    if (!pageRows.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 8;
      td.className = 'sl-empty';
      attr(td, 'No data', '暂无数据');
      tr.appendChild(td);
      el.tbody.appendChild(tr);
    }
    pageRows.forEach(function (row) {
      var tr = document.createElement('tr');

      var tdCid = document.createElement('td');
      var spanCid = document.createElement('span');
      spanCid.className = 'sl-mono';
      spanCid.textContent = shortId(row.cid);
      spanCid.title = row.cid;
      tdCid.appendChild(spanCid);
      tr.appendChild(tdCid);

      var tdOd = document.createElement('td');
      tdOd.className = 'sl-mono';
      tdOd.textContent = row.od || '—';
      tr.appendChild(tdOd);

      var tdLevel = document.createElement('td');
      attr(tdLevel, LEVELS[row.level].en, LEVELS[row.level].zh);
      tr.appendChild(tdLevel);

      var tdTag = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'sl-badge ' + TAGS[row.tag].badge;
      attr(badge, TAGS[row.tag].en, TAGS[row.tag].zh);
      tdTag.appendChild(badge);
      tr.appendChild(tdTag);

      var tdGroup = document.createElement('td');
      tdGroup.textContent = row.group || '—';
      tr.appendChild(tdGroup);

      var tdSource = document.createElement('td');
      attr(tdSource, SOURCES[row.source].en, SOURCES[row.source].zh);
      tr.appendChild(tdSource);

      var tdTime = document.createElement('td');
      tdTime.className = 'sl-mono';
      tdTime.textContent = row.updatedAt;
      tr.appendChild(tdTime);

      var tdAction = document.createElement('td');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sl-link';
      btn.style.border = '0';
      btn.style.background = 'transparent';
      btn.style.cursor = 'pointer';
      btn.style.padding = '0';
      btn.dataset.slRemove = row.cid;
      attr(btn, 'Remove', '移除');
      tdAction.appendChild(btn);
      tr.appendChild(tdAction);

      el.tbody.appendChild(tr);
    });

    el.activeBatch.textContent = state.activeBatch;
    el.total.textContent = fmt(state.rows.length);
    renderPager(rows.length, pageCount);
    if (window.__ugApplyLang) window.__ugApplyLang();
  }

  // ── 分页 ──────────────────────────────────────────────
  function pageNumbers(current, total) {
    var pages = [];
    for (var p = 1; p <= total; p += 1) {
      if (p === 1 || p === total || Math.abs(p - current) <= 1) pages.push(p);
      else if (pages[pages.length - 1] !== '...') pages.push('...');
    }
    return pages;
  }

  function makePageItem(text, options) {
    var opts = options || {};
    if (opts.dots) {
      var span = document.createElement('span');
      span.className = 'sl-page-dots';
      span.textContent = text;
      return span;
    }
    var node = document.createElement('button');
    node.type = 'button';
    node.className = 'sl-page-item' + (opts.active ? ' sl-page-active' : '');
    node.textContent = text;
    if (opts.page) node.dataset.slPage = String(opts.page);
    if (opts.disabled) node.disabled = true;
    return node;
  }

  function renderPager(total, pageCount) {
    attr(el.pagerTotal, 'Total ' + fmt(total) + ' records', '共 ' + fmt(total) + ' 条');
    el.pagerList.innerHTML = '';
    el.pagerList.appendChild(
      makePageItem('‹', { page: state.page - 1, disabled: state.page <= 1 })
    );
    pageNumbers(state.page, pageCount).forEach(function (p) {
      if (p === '...') el.pagerList.appendChild(makePageItem('•••', { dots: true }));
      else el.pagerList.appendChild(makePageItem(fmt(p), { page: p, active: p === state.page }));
    });
    el.pagerList.appendChild(
      makePageItem('›', { page: state.page + 1, disabled: state.page >= pageCount })
    );
    el.pagerJump.value = String(state.page);
  }

  // ── 渲染：批次 ────────────────────────────────────────
  function renderBatches() {
    el.batchTbody.innerHTML = '';
    state.batches.forEach(function (batch) {
      var tr = document.createElement('tr');

      var tdNo = document.createElement('td');
      tdNo.className = 'sl-mono';
      tdNo.textContent = batch.no;
      tr.appendChild(tdNo);

      var tdSource = document.createElement('td');
      attr(tdSource, SOURCES[batch.source].en, SOURCES[batch.source].zh);
      tr.appendChild(tdSource);

      var tdCount = document.createElement('td');
      tdCount.textContent = fmt(batch.count);
      tr.appendChild(tdCount);

      var tdStatus = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'sl-badge ' + BATCH_STATUS[batch.status].badge;
      attr(badge, BATCH_STATUS[batch.status].en, BATCH_STATUS[batch.status].zh);
      tdStatus.appendChild(badge);
      tr.appendChild(tdStatus);

      var tdOperator = document.createElement('td');
      tdOperator.textContent = batch.operator;
      tr.appendChild(tdOperator);

      var tdTime = document.createElement('td');
      tdTime.className = 'sl-mono';
      tdTime.textContent = batch.createdAt;
      tr.appendChild(tdTime);

      var tdAction = document.createElement('td');
      if (batch.status === 'active') {
        attr(tdAction, 'In use', '使用中');
        tdAction.className = 'sl-muted';
      } else {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sl-link';
        btn.style.border = '0';
        btn.style.background = 'transparent';
        btn.style.cursor = 'pointer';
        btn.style.padding = '0';
        btn.dataset.slActivate = batch.no;
        attr(btn, 'Restore', '恢复为生效');
        tdAction.appendChild(btn);
      }
      tr.appendChild(tdAction);

      el.batchTbody.appendChild(tr);
    });
    if (window.__ugApplyLang) window.__ugApplyLang();
  }

  // ── 提示 / 弹窗 / 确认 ────────────────────────────────
  var toastTimer = null;
  function toast(en, zh, kind) {
    el.toast.hidden = false;
    el.toast.className = 'sl-toast' + (kind ? ' sl-toast-' + kind : '');
    attr(el.toast, en, zh);
    if (window.__ugApplyLang) window.__ugApplyLang();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 2600);
  }

  function openModal(name) {
    root.querySelectorAll('[data-sl-modal]').forEach(function (m) {
      if (m.getAttribute('data-sl-modal') === name) m.removeAttribute('hidden');
      else m.setAttribute('hidden', 'hidden');
    });
  }
  function closeModal() {
    root.querySelectorAll('[data-sl-modal]').forEach(function (m) {
      m.setAttribute('hidden', 'hidden');
    });
  }

  var confirmHandler = null;
  function openConfirm(opts) {
    attr(el.confirmTitle, opts.titleEn, opts.titleZh);
    attr(el.confirmText, opts.textEn, opts.textZh);
    el.confirmOk.className = 'sl-btn sl-btn-primary' + (opts.danger ? ' sl-btn-danger' : '');
    confirmHandler = opts.onOk || null;
    openModal('confirm');
    if (window.__ugApplyLang) window.__ugApplyLang();
  }
  el.confirmOk.addEventListener('click', function () {
    var fn = confirmHandler;
    confirmHandler = null;
    closeModal();
    if (fn) fn();
  });

  // ── 一人一标签校验 ────────────────────────────────────
  function findDuplicate(cid) {
    for (var i = 0; i < state.rows.length; i += 1) {
      if (state.rows[i].cid === cid) return state.rows[i];
    }
    return null;
  }

  // ── 文件解析（模拟）────────────────────────────────────
  function mockParseFile(fileName) {
    var lower = String(fileName || '').toLowerCase();
    var failing = /(dup|repeat|重复|非法|invalid|fail|error)/.test(lower);
    var parsed = 1240 + (hashStr(lower) % 420);
    if (!failing) {
      return { fileName: fileName, parsed: parsed, passed: parsed, failed: 0, details: [] };
    }
    var failed = 6 + (hashStr(lower + 'x') % 36);
    var detailRows = [7, 12, 23, 41, 58].slice(0, Math.min(5, failed));
    var details = detailRows.map(function (rowNo, i) {
      if (i % 3 === 1) {
        return { row: rowNo, en: 'pool_type value is not in the enum', zh: 'pool_type 值不在枚举内' };
      }
      if (i % 3 === 2) {
        return { row: rowNo, en: 'account level row without overdraft_id', zh: '账户级记录缺少 overdraft_id' };
      }
      return { row: rowNo, en: 'third_customer_id duplicated (same as row ' + Math.max(1, rowNo - 5) + ')', zh: 'third_customer_id 重复（与第 ' + Math.max(1, rowNo - 5) + ' 行相同）' };
    });
    return { fileName: fileName, parsed: parsed, passed: parsed - failed, failed: failed, details: details };
  }

  function resetUploadModal() {
    el.fileName.textContent = '';
    attr(el.fileName, 'No file selected', '未选择文件');
    el.uploadPreview.hidden = true;
    el.uploadError.hidden = true;
    el.uploadDetail.hidden = true;
    el.uploadDetailList.innerHTML = '';
    el.uploadConfirm.disabled = true;
    el.parseResult = null;
    if (el.fileInput) el.fileInput.value = '';
  }

  // ── 事件绑定 ──────────────────────────────────────────
  function bind() {
    // Tab
    el.tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var key = tab.getAttribute('data-sl-tab');
        el.tabs.forEach(function (t) { t.classList.toggle('sl-tab-active', t === tab); });
        el.panels.forEach(function (p) {
          if (p.getAttribute('data-sl-panel') === key) p.removeAttribute('hidden');
          else p.setAttribute('hidden', 'hidden');
        });
      });
    });

    // 工具栏
    root.querySelectorAll('[data-sl-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-sl-action');
        if (action === 'upload') {
          resetUploadModal();
          openModal('upload');
        } else if (action === 'single') {
          el.singleError.hidden = true;
          openModal('single');
        } else if (action === 'search') {
          state.filter = el.keyword.value;
          state.page = 1;
          renderList();
        }
      });
    });
    el.keyword.addEventListener('input', function () {
      state.filter = el.keyword.value;
      state.page = 1;
      renderList();
    });

    // 分页
    el.pagerList.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sl-page]');
      if (!btn || btn.disabled) return;
      var page = parseInt(btn.getAttribute('data-sl-page'), 10);
      if (!page || page === state.page) return;
      state.page = page;
      renderList();
    });
    el.pagerSize.addEventListener('change', function () {
      state.pageSize = parseInt(el.pagerSize.value, 10) || 10;
      state.page = 1;
      renderList();
    });
    el.pagerJump.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var page = parseInt(el.pagerJump.value, 10);
      var pageCount = Math.max(1, Math.ceil(visibleRows().length / state.pageSize));
      if (!page || page < 1 || page > pageCount) {
        el.pagerJump.value = String(state.page);
        return;
      }
      state.page = page;
      renderList();
    });

    // 关闭
    root.querySelectorAll('[data-sl-close]').forEach(function (node) {
      node.addEventListener('click', closeModal);
    });

    // 名单：移除（带确认）
    el.tbody.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sl-remove]');
      if (!btn) return;
      var cid = btn.getAttribute('data-sl-remove');
      openConfirm({
        titleEn: 'Remove record',
        titleZh: '移除记录',
        textEn: 'Remove ' + shortId(cid) + ' from the active list? This takes effect immediately in limit adjustment.',
        textZh: '确认把 ' + shortId(cid) + ' 从当前生效名单中移除？移除后立即按常规逻辑参与调额。',
        danger: true,
        onOk: function () {
          state.rows = state.rows.filter(function (r) { return r.cid !== cid; });
          var batch = activeBatchObj();
          if (batch) batch.count = state.rows.length;
          renderList();
          renderBatches();
          toast('Record removed', '已移除该条记录', 'ok');
        }
      });
    });

    // 批次：恢复为生效（带确认）
    el.batchTbody.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sl-activate]');
      if (!btn) return;
      var no = btn.getAttribute('data-sl-activate');
      var target = null;
      state.batches.forEach(function (b) { if (b.no === no) target = b; });
      if (!target) return;
      openConfirm({
        titleEn: 'Restore batch',
        titleZh: '恢复为生效批次',
        textEn: 'Restore ' + no + ' (' + fmt(target.count) + ' records) as the active batch? The current active batch will be marked as overwritten.',
        textZh: '确认把批次 ' + no + '（' + fmt(target.count) + ' 条）恢复为生效？当前生效批次将被标记为「已覆盖」。',
        onOk: function () {
          state.batches.forEach(function (b) {
            b.status = (b.no === no) ? 'active' : (b.status === 'closed' ? 'closed' : 'overwritten');
          });
          state.activeBatch = no;
          state.rows = buildRows(no, target.count, target.createdAt);
          state.page = 1;
          renderBatches();
          renderList();
          toast('Batch switched', '已切换生效批次', 'ok');
        }
      });
    });

    // 上传弹窗：选择文件
    el.filePick.addEventListener('click', function () {
      el.fileInput.value = '';
      el.fileInput.click();
    });
    el.fileInput.addEventListener('change', function () {
      var file = el.fileInput.files && el.fileInput.files[0];
      if (!file) return;
      var result = mockParseFile(file.name);
      el.parseResult = result;
      el.fileName.textContent = file.name;
      el.fileName.removeAttribute('data-en');
      el.fileName.removeAttribute('data-zh');
      el.uploadPreview.hidden = false;
      el.uploadParsed.textContent = fmt(result.parsed);
      el.uploadPassed.textContent = fmt(result.passed);
      el.uploadFailed.textContent = fmt(result.failed);

      if (result.failed > 0) {
        attr(el.uploadError,
          result.failed + ' duplicate / invalid rows — the whole batch will not be imported. Fix the file and try again.',
          '存在 ' + result.failed + ' 条重复 / 非法记录，整批不导入；请修正后重试。');
        el.uploadDetailList.innerHTML = '';
        result.details.forEach(function (d) {
          var li = document.createElement('li');
          var prefixEn = 'Row ' + d.row + ': ';
          var prefixZh = '第 ' + d.row + ' 行：';
          attr(li, prefixEn + d.en, prefixZh + d.zh);
          el.uploadDetailList.appendChild(li);
        });
        if (result.failed > result.details.length) {
          var more = document.createElement('li');
          attr(more,
            'and ' + (result.failed - result.details.length) + ' more…',
            '……其余 ' + (result.failed - result.details.length) + ' 条');
          el.uploadDetailList.appendChild(more);
        }
        el.uploadDetail.hidden = false;
        el.uploadError.hidden = false;
        el.uploadConfirm.disabled = true;
      } else {
        el.uploadError.hidden = true;
        el.uploadDetail.hidden = true;
        el.uploadDetailList.innerHTML = '';
        el.uploadConfirm.disabled = false;
      }
      if (window.__ugApplyLang) window.__ugApplyLang();
    });

    // 上传弹窗：确认导入
    el.uploadConfirm.addEventListener('click', function () {
      var result = el.parseResult;
      if (!result || result.failed > 0) return;
      var no = nextBatchNo();
      var createdAt = nowText();
      state.batches.forEach(function (b) { if (b.status === 'active') b.status = 'overwritten'; });
      state.batches.unshift({
        no: no, source: 'file', count: result.passed, status: 'active',
        operator: 'baksun', createdAt: createdAt
      });
      state.activeBatch = no;
      state.rows = buildRows(no, result.passed, createdAt);
      state.page = 1;
      closeModal();
      renderBatches();
      renderList();
      toast('Imported ' + fmt(result.passed) + ' records',
        '已导入 ' + fmt(result.passed) + ' 条，上一批次自动标记为已覆盖', 'ok');
    });

    // 单条新增
    el.singleLevel.addEventListener('change', function () {
      el.singleAccountReq.hidden = el.singleLevel.value !== 'account';
    });
    el.singleConfirm.addEventListener('click', function () {
      var cid = el.singleCustomer.value.trim();
      var level = el.singleLevel.value;
      var od = el.singleAccount.value.trim();
      var tag = el.singleTag.value;
      function fail(en, zh) {
        el.singleError.hidden = false;
        attr(el.singleError, en, zh);
        if (window.__ugApplyLang) window.__ugApplyLang();
      }
      if (!cid) {
        fail('Customer ID is required', '用户标识必填');
        return;
      }
      if (level === 'account' && !od) {
        fail('Account ID is required for account-level records', '账户级标签必须填写账户标识');
        return;
      }
      var dup = findDuplicate(cid);
      if (dup) {
        fail('This customer already has a tag — one tag per customer.',
          '该用户已有标签（' + TAGS[dup.tag].zh + '），一人仅允许一个标签');
        return;
      }
      state.rows.unshift({
        cid: cid, od: od, level: level, tag: tag,
        group: el.singleGroup.value.trim() || '未分组',
        source: 'manual', updatedAt: nowText()
      });
      var batch = activeBatchObj();
      if (batch) batch.count = state.rows.length;
      el.singleCustomer.value = '';
      el.singleAccount.value = '';
      el.singleGroup.value = '';
      el.singleRemark.value = '';
      el.singleLevel.value = 'user';
      el.singleTag.value = 'no_adjust';
      el.singleAccountReq.hidden = true;
      el.singleError.hidden = true;
      state.page = 1;
      closeModal();
      renderList();
      renderBatches();
      toast('Record added', '已新增 1 条记录', 'ok');
    });

    // 下载导入模板（CSV）
    if (el.templateLink) {
      el.templateLink.addEventListener('click', function (e) {
        e.preventDefault();
        var header = 'third_customer_id,overdraft_id,tag_level,pool_type,detail_group,remark';
        var sample1 = 'F3B2F35A27F065672D506E99E76DF57F6988818498F860B80DDA84B13A985C14,72349947,user,increase_only,Staff组,员工入职';
        var sample2 = 'DFAC72F8DEF3BBD12ABD0A081428C1CDA6AC4E7824CEC788618A61F600DBDBE9,80111462,account,no_adjust,回捞组,回捞实验期内锁定';
        var csv = '﻿' + [header, sample1, sample2].join('\n') + '\n';
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'special_pool_list_template.csv';
        root.appendChild(a);
        a.click();
        root.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      });
    }
  }

  // 缓存常用节点
  el.filePick = root.querySelector('#sl-file-pick');
  el.fileInput = (function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.style.display = 'none';
    root.appendChild(input);
    return input;
  })();
  el.fileName = root.querySelector('#sl-file-name');
  el.uploadPreview = root.querySelector('#sl-upload-preview');
  el.uploadParsed = root.querySelector('#sl-upload-parsed');
  el.uploadPassed = root.querySelector('#sl-upload-passed');
  el.uploadFailed = root.querySelector('#sl-upload-failed');
  el.uploadConfirm = root.querySelector('#sl-upload-confirm');
  el.singleLevel = root.querySelector('#sl-single-level');
  el.singleCustomer = root.querySelector('#sl-single-customer');
  el.singleAccount = root.querySelector('#sl-single-account');
  el.singleTag = root.querySelector('#sl-single-tag');
  el.singleGroup = root.querySelector('#sl-single-group');
  el.singleRemark = root.querySelector('#sl-single-remark');
  el.singleError = root.querySelector('#sl-single-error');
  el.singleConfirm = root.querySelector('#sl-single-confirm');
  bind();
  renderList();
  renderBatches();
  if (window.__ugApplyLang) window.__ugApplyLang();
})();
