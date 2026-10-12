/* 特殊执行名单页交互（原型）
 *
 * 说明：这是**前端原型的模拟实现**，数据都在内存里。
 * 真实系统里：文件解析、一人一标签校验、批次落库都在后端完成。
 */
(function () {
  var root = document.querySelector('.sl-page');
  if (!root) return;

  // ── 执行标签字典（与后端 pool_type 对应）──
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
    manual: { en: 'Manual', zh: '手工维护' },
    rule: { en: 'Auto rule', zh: '自动规则' }
  };
  var BATCH_STATUS = {
    active: { en: 'Active', zh: '生效中', badge: 'sl-badge-blue' },
    overwritten: { en: 'Overwritten', zh: '已覆盖', badge: 'sl-badge-gray' },
    closed: { en: 'Closed', zh: '已作废', badge: 'sl-badge-gray' }
  };

  function t(dict, key) {
    var item = dict[key];
    if (!item) return key;
    return document.documentElement.getAttribute('data-lang') === 'zh' ? item.zh : item.en;
  }

  function attr(el, en, zh) {
    el.setAttribute('data-en', en);
    el.setAttribute('data-zh', zh);
    el.textContent = document.documentElement.getAttribute('data-lang') === 'zh' ? zh : en;
    return el;
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

  // ── 模拟数据 ──
  var state = {
    activeBatch: 'SL20261012-003',
    batches: [
      { no: 'SL20261012-003', source: 'manual', count: 8, status: 'active', operator: 'baksun', createdAt: '2026-10-12 08:20:31' },
      { no: 'SL20261012-002', source: 'file', count: 186432, status: 'overwritten', operator: 'baksun', createdAt: '2026-10-12 07:55:02' },
      { no: 'SL20261011-001', source: 'file', count: 184905, status: 'overwritten', operator: 'jolie', createdAt: '2026-10-11 19:03:44' }
    ],
    rows: [
      { cid: 'F3B2F35A27F065672D506E99E76DF57F6988818498F860B80DDA84B13A985C14', od: '72349947', level: 'user', tag: 'increase_only', group: 'Staff组', source: 'manual', updatedAt: '2026-10-12 08:20:31' },
      { cid: 'E65D090AC8584311AB682C7F2E1E5848F2FA5A0E74B3E8D8DB59FB74284A58CC', od: '83431854', level: 'user', tag: 'increase_only', group: '白名单', source: 'manual', updatedAt: '2026-10-12 08:20:31' },
      { cid: 'DFAC72F8DEF3BBD12ABD0A081428C1CDA6AC4E7824CEC788618A61F600DBDBE9', od: '80111462', level: 'account', tag: 'no_adjust', group: '激进提额组', source: 'rule', updatedAt: '2026-10-12 08:20:31' },
      { cid: 'D8F1C0491CCC8AB909869978813D5036D8E3364D79004F626E89C71E1DBB6481', od: '84185089', level: 'account', tag: 'no_adjust', group: '降额实验组', source: 'rule', updatedAt: '2026-10-12 08:20:31' },
      { cid: 'DC52D79E99AF72BF2345D40B73B1F6DA5400BC73D811437E83FB806FFFB54CC6', od: '83861800', level: 'account', tag: 'no_adjust', group: '回捞组', source: 'rule', updatedAt: '2026-10-12 08:20:31' },
      { cid: 'DFAC323F3D4EDD481BAAC7FE9EEE80E3FC522310333C0265B12E2FA241E9E988', od: '58523826', level: 'account', tag: 'no_adjust', group: '模型切换实验组', source: 'rule', updatedAt: '2026-10-12 08:20:31' },
      { cid: 'E65CFDAA2A16BAD1CB2AD4476F4E6A29DB4288FC0C58CAA222D9B4BACAF64260', od: '76597516', level: 'account', tag: 'decrease_only', group: '风险触发组', source: 'rule', updatedAt: '2026-10-12 08:20:31' },
      { cid: 'F3B2C16D88A9DA27786F2F5343117496F4247169E6F6719C7BA42BE0F8CA7F08', od: '73954831', level: 'user', tag: 'decrease_only', group: '人工降额名单', source: 'manual', updatedAt: '2026-10-12 08:20:31' }
    ],
    filter: ''
  };

  var el = {
    tabs: root.querySelectorAll('[data-sl-tab]'),
    panels: root.querySelectorAll('[data-sl-panel]'),
    tbody: root.querySelector('#sl-tbody'),
    batchTbody: root.querySelector('#sl-batch-tbody'),
    activeBatch: root.querySelector('#sl-active-batch'),
    total: root.querySelector('#sl-total'),
    pageInfo: root.querySelector('#sl-page-info'),
    keyword: root.querySelector('#sl-keyword'),
    toast: root.querySelector('#sl-toast')
  };

  // ── 渲染 ──
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
    if (!rows.length) {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.colSpan = 8;
      td.className = 'sl-empty';
      attr(td, 'No data', '暂无数据');
      tr.appendChild(td);
      el.tbody.appendChild(tr);
    }
    rows.forEach(function (row, index) {
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
      btn.dataset.slRemove = String(index);
      btn.dataset.slCid = row.cid;
      attr(btn, 'Remove', '移除');
      tdAction.appendChild(btn);
      tr.appendChild(tdAction);

      el.tbody.appendChild(tr);
    });

    el.activeBatch.textContent = state.activeBatch;
    el.total.textContent = String(state.rows.length);
    attr(el.pageInfo, 'Total ' + state.rows.length + ' records', '共 ' + state.rows.length + ' 条');
    if (window.__ugApplyLang) window.__ugApplyLang();
  }

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
      tdCount.textContent = batch.count.toLocaleString('en-US');
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

  // ── 提示 ──
  var toastTimer = null;
  function toast(en, zh, kind) {
    el.toast.hidden = false;
    el.toast.className = 'sl-toast' + (kind ? ' sl-toast-' + kind : '');
    attr(el.toast, en, zh);
    if (window.__ugApplyLang) window.__ugApplyLang();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.hidden = true; }, 2600);
  }

  // ── 弹窗 ──
  function openModal(name) {
    root.querySelectorAll('[data-sl-modal]').forEach(function (m) {
      if (m.getAttribute('data-sl-modal') === name) m.removeAttribute('hidden');
      else m.setAttribute('hidden', 'hidden');
    });
  }
  function closeModal() {
    root.querySelectorAll('[data-sl-modal]').forEach(function (m) { m.setAttribute('hidden', 'hidden'); });
  }

  // ── 一人一标签校验 ──
  function findDuplicate(cid, exceptCid) {
    for (var i = 0; i < state.rows.length; i += 1) {
      if (state.rows[i].cid === cid && state.rows[i].cid !== exceptCid) return state.rows[i];
    }
    return null;
  }

  // ── 上传（覆盖）──
  function mockParseFile(fileName) {
    var parsed = 186432 + Math.floor(Math.random() * 900);
    var failed = 12 + Math.floor(Math.random() * 40);
    return { parsed: parsed, passed: parsed - failed, failed: failed, fileName: fileName };
  }

  // ── 事件绑定 ──
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
          el.fileName.textContent = '';
          attr(el.fileName, 'No file selected', '未选择文件');
          el.uploadPreview.hidden = true;
          el.uploadConfirm.disabled = true;
          openModal('upload');
        } else if (action === 'single') {
          el.singleError.hidden = true;
          openModal('single');
        } else if (action === 'search') {
          state.filter = el.keyword.value;
          renderList();
        }
      });
    });
    el.keyword.addEventListener('input', function () {
      state.filter = el.keyword.value;
      renderList();
    });

    // 关闭
    root.querySelectorAll('[data-sl-close]').forEach(function (node) {
      node.addEventListener('click', closeModal);
    });

    // 移除单条 / 恢复批次
    el.tbody.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sl-remove]');
      if (!btn) return;
      var cid = btn.getAttribute('data-sl-cid');
      state.rows = state.rows.filter(function (r) { return r.cid !== cid; });
      var batch = state.batches.find(function (b) { return b.no === state.activeBatch; });
      if (batch) batch.count = state.rows.length;
      renderList();
      renderBatches();
      toast('Record removed', '已移除该条记录', 'ok');
    });
    el.batchTbody.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-sl-activate]');
      if (!btn) return;
      var no = btn.getAttribute('data-sl-activate');
      state.batches.forEach(function (b) {
        b.status = b.no === no ? 'active' : 'overwritten';
      });
      state.activeBatch = no;
      renderBatches();
      renderList();
      toast('Batch switched', '已切换生效批次', 'ok');
    });

    // 上传弹窗
    el.filePick.addEventListener('click', function () { el.fileInput.click(); });
    el.fileInput.addEventListener('change', function () {
      var file = el.fileInput.files && el.fileInput.files[0];
      if (!file) return;
      var result = mockParseFile(file.name);
      el.parseResult = result;
      el.fileName.textContent = file.name;
      el.fileName.removeAttribute('data-en');
      el.fileName.removeAttribute('data-zh');
      el.uploadPreview.hidden = false;
      el.uploadParsed.textContent = result.parsed.toLocaleString('en-US');
      el.uploadPassed.textContent = result.passed.toLocaleString('en-US');
      el.uploadFailed.textContent = result.failed.toLocaleString('en-US');
      el.uploadConfirm.disabled = false;
    });
    el.uploadConfirm.addEventListener('click', function () {
      var result = el.parseResult;
      if (!result) return;
      var no = nextBatchNo();
      state.batches.forEach(function (b) { if (b.status === 'active') b.status = 'overwritten'; });
      state.batches.unshift({
        no: no, source: 'file', count: result.passed, status: 'active',
        operator: 'baksun', createdAt: nowText()
      });
      state.activeBatch = no;
      renderBatches();
      renderList();
      closeModal();
      toast('Imported ' + result.passed.toLocaleString('en-US') + ' records',
        '已导入 ' + result.passed.toLocaleString('en-US') + ' 条，上一批次自动标记为已覆盖', 'ok');
    });

    // 单条新增
    el.singleConfirm.addEventListener('click', function () {
      var cid = el.singleCustomer.value.trim();
      var tag = el.singleTag.value;
      if (!cid) {
        el.singleError.hidden = false;
        attr(el.singleError, 'Customer ID is required', '用户标识必填');
        if (window.__ugApplyLang) window.__ugApplyLang();
        return;
      }
      var dup = findDuplicate(cid, null);
      if (dup) {
        el.singleError.hidden = false;
        attr(el.singleError,
          'This customer already has a tag — one tag per customer.',
          '该用户已有标签（' + TAGS[dup.tag].zh + '），一人仅允许一个标签');
        if (window.__ugApplyLang) window.__ugApplyLang();
        return;
      }
      state.rows.push({
        cid: cid, od: el.singleAccount.value.trim(), level: el.singleLevel.value,
        tag: tag, group: el.singleGroup.value.trim() || '未分组',
        source: 'manual', updatedAt: nowText()
      });
      var batch = state.batches.find(function (b) { return b.no === state.activeBatch; });
      if (batch) batch.count = state.rows.length;
      el.singleCustomer.value = '';
      el.singleAccount.value = '';
      el.singleGroup.value = '';
      el.singleRemark.value = '';
      el.singleError.hidden = true;
      renderList();
      renderBatches();
      closeModal();
      toast('Record added', '已新增 1 条记录', 'ok');
    });

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
