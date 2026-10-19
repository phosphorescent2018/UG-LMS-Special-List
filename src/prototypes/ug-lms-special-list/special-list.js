/* 特殊执行名单页交互（原型）
 *
 * 前端原型模拟实现：名单数据、文件解析结果、批次状态全部在内存里。
 * 真实系统：文件解析与校验、同键覆盖（增量合并）、批次落库、执行时名单校验（odid → tcid 优先级）都在后端完成。
 *
 * 演示口径：
 *   - 上传 = 增量导入：同键（同层级同 ID）以新文件为准覆盖、其余记录全部保留；任一行校验不过 → 本次整批放弃。
 *   - 预览「解析 / 新增 / 覆盖 / 非法」按本次文件口径；导入后名单条数 = 原条数 + 新增。
 *   - 记录带有效期（生效/失效时间，全必填）；状态派生：未生效 / 生效中 / 已失效 / 已停用。
 *   - 批次 = 一次导入的变更记录；状态机：处理中 → 已处理 / 处理失败；操作列「下载 + 详情」。
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
    file: { en: 'File import', zh: '文件上传' },
    manual: { en: 'Manual', zh: '手工维护' }
  };
  var PRODUCTS = {
    'OD': { en: 'OD', zh: 'OD' },
    'BL': { en: 'BL', zh: 'BL' },
    '': { en: 'All products', zh: '全部产品' }
  };
  var GROUPS = ['回捞组', '激进提额组', '降额实验组', '模型切换实验组', 'Staff组', '白名单组', '风险触发组', '人工降额名单组'];
  var GROUP_CATALOG = {
    '回捞组': { level: 'account', tag: 'no_adjust' },
    '激进提额组': { level: 'account', tag: 'no_adjust' },
    '降额实验组': { level: 'account', tag: 'no_adjust' },
    '模型切换实验组': { level: 'account', tag: 'no_adjust' },
    'Staff组': { level: 'user', tag: 'increase_only' },
    '白名单组': { level: 'user', tag: 'increase_only' },
    '风险触发组': { level: 'user', tag: 'decrease_only' },
    '人工降额名单组': { level: 'user', tag: 'decrease_only' }
  };
  var RECORD_STATUS = {
    active: { en: 'Active', zh: '生效中', badge: 'sl-badge-green' },
    upcoming: { en: 'Not started', zh: '未生效', badge: 'sl-badge-blue' },
    expired: { en: 'Expired', zh: '已失效', badge: 'sl-badge-gray' },
    disabled: { en: 'Disabled', zh: '已停用', badge: 'sl-badge-orange' }
  };
  var ENABLE_STATUS = {
    enabled: { en: 'Enabled', zh: '启用', badge: 'sl-badge-green' },
    disabled: { en: 'Disabled', zh: '已停用', badge: 'sl-badge-orange' }
  };
  var BATCH_STATUS = {
    processing: { en: 'Processing', zh: '处理中', badge: 'sl-badge-blue' },
    processed: { en: 'Processed', zh: '已处理', badge: 'sl-badge-green' },
    failed: { en: 'Failed', zh: '处理失败', badge: 'sl-badge-red' }
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

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function fmtD(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
      pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function nowText() {
    return fmtD(new Date());
  }

  function toInputVal(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' +
      pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function roundHour(d) {
    var x = new Date(d.getTime());
    x.setMinutes(0, 0, 0);
    return x;
  }

  function parseTime(str) {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(str)) return null;
    var p = str.split(/[-: ]/);
    var d = new Date(+p[0], +p[1] - 1, +p[2], +p[3], +p[4], +p[5]);
    if (d.getFullYear() !== +p[0] || d.getMonth() !== +p[1] - 1 || d.getDate() !== +p[2] ||
        d.getHours() !== +p[3] || d.getMinutes() !== +p[4] || d.getSeconds() !== +p[5]) {
      return null;
    }
    return d;
  }

  function parseInputVal(v) {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(v)) return null;
    var s = v;
    if (s.length === 16) s += ':00';
    return parseTime(s);
  }

  var batchSeq = 4;
  function nextBatchNo() {
    batchSeq += 1;
    var d = new Date();
    return 'SL' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
      String(batchSeq).padStart(3, '0');
  }

  // ── 演示数据：确定性生成（同一小时内刷新结果一致）──────
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

  var FILE_POOLS = [
    ['account', 'no_adjust', '回捞组'],
    ['account', 'no_adjust', '激进提额组'],
    ['account', 'no_adjust', '降额实验组'],
    ['account', 'no_adjust', '模型切换实验组'],
    ['user', 'decrease_only', '风险触发组']
  ];
  var MANUAL_POOLS = [
    ['user', 'increase_only', 'Staff组'],
    ['user', 'increase_only', '白名单组'],
    ['user', 'decrease_only', '人工降额名单组']
  ];

  function pickPool(pool, rnd) {
    return pool[Math.floor(rnd() * pool.length)];
  }

  function genRows(seedKey, count, createdAt, opts) {
    var o = opts || {};
    var rnd = mulberry32(hashStr(seedKey));
    var nowMs = roundHour(new Date()).getTime();
    var rows = [];
    for (var i = 0; i < count; i += 1) {
      var manual = !o.fileOnly && rnd() < 0.12;
      var spec = manual ? pickPool(MANUAL_POOLS, rnd) : pickPool(FILE_POOLS, rnd);
      var bucket = rnd();
      var startMs, endMs, stopped = false;
      if (bucket < 0.07) {
        startMs = nowMs + (1 + Math.floor(rnd() * 30 * 24)) * 3600000;
        endMs = startMs + (30 + Math.floor(rnd() * 300)) * 86400000;
      } else if (bucket < 0.14 && !o.noExpired) {
        endMs = nowMs - (1 + Math.floor(rnd() * 60 * 24)) * 3600000;
        startMs = endMs - (30 + Math.floor(rnd() * 300)) * 86400000;
      } else {
        startMs = nowMs - (1 + Math.floor(rnd() * 90 * 24)) * 3600000;
        endMs = nowMs + (7 + Math.floor(rnd() * 300)) * 86400000;
        stopped = rnd() < 0.05;
      }
      var id = spec[0] === 'user'
        ? hexId(rnd)
        : String(10000000 + Math.floor(rnd() * 89999999));
      // 本期业务产品固定 OD
      var product = 'OD';
      rows.push({
        id: id,
        level: spec[0],
        tag: spec[1],
        product: product,
        group: spec[2],
        start: fmtD(new Date(startMs)),
        end: fmtD(new Date(endMs)),
        stopped: stopped,
        source: manual ? 'manual' : 'file',
        updatedAt: createdAt
      });
    }
    return rows;
  }

  // ── 状态 ──────────────────────────────────────────────
  var state = {
    rows: [],
    lastBatch: 'SL20261015-004',
    batches: [
      { no: 'SL20261015-004', source: 'file', count: 1240, added: 1104, overwritten: 136, status: 'processed', operator: 'baksun', createdAt: '2026-10-15 09:12:44' },
      { no: 'SL20261014-003', source: 'file', count: 486, added: 420, overwritten: 66, status: 'processed', operator: 'baksun', createdAt: '2026-10-14 17:38:10' },
      { no: 'SL20261013-002', source: 'file', count: 318, added: 0, overwritten: 0, status: 'failed', operator: 'jolie', createdAt: '2026-10-13 10:02:55', failReason: '系统处理异常，整批未写入名单' },
      { no: 'SL20261012-001', source: 'file', count: 952, added: 952, overwritten: 0, status: 'processed', operator: 'jolie', createdAt: '2026-10-12 08:31:20' }
    ],
    filters: {},
    selected: [],
    changeFilters: { q: '', type: '', status: '', operator: '', from: '', to: '' },
    allSelected: false,
    cols: { tcid: true, odid: true, level: true, tag: true, product: true, group: true, start: true, end: true, status: true, source: true, updated: true },
    opLogs: [],
    page: 1,
    pageSize: 10,
    processing: false
  };
  state.rows = genRows('SL20261015-004', 1240, state.batches[0].createdAt);
  state.opLogs = [
    { no: 'OP20261019-007', typeZh: '批量删除', typeEn: 'Bulk delete', count: 10, operator: 'jolie', time: '2026-10-19 11:35:02', rows: genRows('op-007', 10, '2026-10-19 11:35:02', { fileOnly: true }) },
    { no: 'OP20261019-006', typeZh: '批量启用', typeEn: 'Bulk enable', count: 5, operator: 'jolie', time: '2026-10-19 11:10:33', rows: genRows('op-006', 5, '2026-10-19 11:10:33', { fileOnly: true }) },
    { no: 'OP20261019-005', typeZh: '批量停用', typeEn: 'Bulk disable', count: 2, operator: 'baksun', time: '2026-10-19 10:40:10', rows: genRows('op-005', 2, '2026-10-19 10:40:10', { fileOnly: true }) },
    { no: 'OP20261019-004', typeZh: '启用', typeEn: 'Enable', count: 1, operator: 'baksun', time: '2026-10-19 10:05:44', rows: genRows('op-004', 1, '2026-10-19 10:05:44', { fileOnly: true }) },
    { no: 'OP20261019-003', typeZh: '停用', typeEn: 'Disable', count: 1, operator: 'jolie', time: '2026-10-19 09:40:18', rows: genRows('op-003', 1, '2026-10-19 09:40:18', { fileOnly: true }) },
    { no: 'OP20261019-002', typeZh: '单条删除', typeEn: 'Delete', count: 1, operator: 'baksun', time: '2026-10-19 09:20:05', rows: genRows('op-002', 1, '2026-10-19 09:20:05', { fileOnly: true }) },
    { no: 'OP20261019-001', typeZh: '单条新增', typeEn: 'Add one', count: 1, operator: 'baksun', time: '2026-10-19 08:50:12', rows: genRows('op-001', 1, '2026-10-19 08:50:12', { fileOnly: true }) }
  ];

  var el = {};

  // ── 派生状态 ──────────────────────────────────────────
  function effStatus(r) {
    var now = new Date();
    var s = parseTime(r.start);
    var e = parseTime(r.end);
    if (s && now.getTime() < s.getTime()) return 'upcoming';
    if (e && now.getTime() >= e.getTime()) return 'expired';
    return 'active';
  }

  function rowStatus(r) {
    return effStatus(r);
  }

  // ── 渲染：名单 ────────────────────────────────────────
  function visibleRows() {
    var f = state.filters;
    return state.rows.filter(function (r) {
      if (f.tcid && !(r.level === 'user' && r.id.toLowerCase().indexOf(f.tcid.toLowerCase()) >= 0)) return false;
      if (f.odid && !(r.level === 'account' && r.id.indexOf(f.odid) >= 0)) return false;
      if (f.product) {
        var pv = r.product || '';
        if (f.product === '__blank__' ? pv !== '' : pv !== f.product) return false;
      }
      if (f.level && r.level !== f.level) return false;
      if (f.tag && r.tag !== f.tag) return false;
      if (f.group && r.group !== f.group) return false;
      if (f.source && r.source !== f.source) return false;
      if (f.eff && effStatus(r) !== f.eff) return false;
      if (f.enable && (r.stopped ? 'disabled' : 'enabled') !== f.enable) return false;
      if (f.startFrom && r.start < f.startFrom + ' 00:00:00') return false;
      if (f.startTo && r.start > f.startTo + ' 23:59:59') return false;
      if (f.endFrom && r.end < f.endFrom + ' 00:00:00') return false;
      if (f.endTo && r.end > f.endTo + ' 23:59:59') return false;
      return true;
    });
  }

  function updateBatchButtons() {
    var n = state.selected.length;
    var stoppedN = state.selected.filter(function (r) { return r.stopped; }).length;
    var stoppableN = state.selected.filter(function (r) {
      return !r.stopped && effStatus(r) !== 'expired';
    }).length;
    root.querySelectorAll('[data-sl-batch]').forEach(function (b) {
      var kind = b.getAttribute('data-sl-batch');
      if (kind === 'enable') {
        b.disabled = n < 2 || stoppedN === 0;
        b.title = stoppedN === 0
          ? (isZh() ? '所选记录均未停用，无需启用（已失效请修改有效期）' : 'No disabled records selected')
          : '';
        return;
      }
      if (kind === 'stop') {
        b.disabled = n < 2 || stoppableN === 0;
        b.title = stoppableN === 0
          ? (isZh() ? '所选记录均已停用或已失效，无需停用' : 'Selected records are already disabled or expired')
          : '';
        return;
      }
      b.disabled = n < 2;
      b.title = n < 2
        ? (isZh() ? '批量操作需至少选择 2 条；单条请用行内「停用 / 删除」' : 'Select at least 2 records; use row actions for a single record')
        : '';
    });
  }

  function updateSelBar() {
    var bar = root.querySelector('#sl-selbar');
    var txt = root.querySelector('#sl-selbar-text');
    if (!bar || !txt) return;
    var n = state.selected.length;
    if (!n) { bar.hidden = true; return; }
    bar.hidden = false;
    txt.textContent = state.allSelected
      ? (isZh() ? '已选择全部 ' + fmt(n) + ' 条（当前筛选结果）' : 'All ' + fmt(n) + ' records selected (current filter)')
      : (isZh() ? '已选择 ' + fmt(n) + ' 条' : fmt(n) + ' record(s) selected');
  }

  var opSeq = 7;
  function nextOpNo() {
    opSeq += 1;
    var d = new Date();
    return 'OP' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + String(opSeq).padStart(3, '0');
  }

  function logOp(typeZh, typeEn, rows) {
    state.opLogs.unshift({
      no: nextOpNo(), typeZh: typeZh, typeEn: typeEn, count: rows.length,
      operator: 'baksun', time: nowText(),
      rows: rows.map(function (r) {
        return { id: r.id, level: r.level, tag: r.tag, product: r.product || 'OD', group: r.group || '' };
      })
    });
    renderChanges();
  }

  function renderOpLogs() {
    if (!el.oplogTbody) return;
    el.oplogTbody.innerHTML = '';
    if (!state.opLogs.length) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 6;
      td0.className = 'sl-empty';
      attr(td0, 'No data', '暂无数据');
      tr0.appendChild(td0);
      el.oplogTbody.appendChild(tr0);
      return;
    }
    state.opLogs.forEach(function (op) {
      var tr = document.createElement('tr');
      var tdNo = document.createElement('td');
      tdNo.className = 'sl-mono';
      tdNo.textContent = op.no;
      tr.appendChild(tdNo);
      var tdType = document.createElement('td');
      attr(tdType, op.typeEn, op.typeZh);
      tr.appendChild(tdType);
      var tdCount = document.createElement('td');
      tdCount.textContent = fmt(op.count);
      tr.appendChild(tdCount);
      var tdOperator = document.createElement('td');
      tdOperator.textContent = op.operator;
      tr.appendChild(tdOperator);
      var tdTime = document.createElement('td');
      tdTime.className = 'sl-mono';
      tdTime.textContent = op.time;
      tr.appendChild(tdTime);
      var tdAct = document.createElement('td');
      var act = document.createElement('div');
      act.className = 'sl-actions';
      var bDetail = document.createElement('button');
      bDetail.type = 'button';
      bDetail.className = 'sl-link';
      bDetail.style.border = '0';
      bDetail.style.background = 'transparent';
      bDetail.style.cursor = 'pointer';
      bDetail.style.padding = '0';
      bDetail.setAttribute('data-sl-op-detail', op.no);
      attr(bDetail, 'Details', '详情');
      act.appendChild(bDetail);
      var bExport = document.createElement('button');
      bExport.type = 'button';
      bExport.className = 'sl-link';
      bExport.style.border = '0';
      bExport.style.background = 'transparent';
      bExport.style.cursor = 'pointer';
      bExport.style.padding = '0';
      bExport.setAttribute('data-sl-op-export', op.no);
      attr(bExport, 'Export list', '导出清单');
      act.appendChild(bExport);
      tdAct.appendChild(act);
      tr.appendChild(tdAct);
      el.oplogTbody.appendChild(tr);
    });
  }

  function findOp(no) {
    for (var i = 0; i < state.opLogs.length; i += 1) {
      if (state.opLogs[i].no === no) return state.opLogs[i];
    }
    return null;
  }

  function openOplog(no) {
    var op = findOp(no);
    if (!op) return;
    el.opNo.textContent = op.no;
    attr(el.opType, op.typeEn, op.typeZh);
    el.opCount.textContent = fmt(op.count);
    el.opOperator.textContent = op.operator;
    el.opTime.textContent = op.time;
    el.opTbody.innerHTML = '';
    op.rows.forEach(function (r) {
      var tr = document.createElement('tr');
      var td1 = document.createElement('td');
      td1.className = 'sl-mono';
      if (r.level === 'user') { td1.textContent = shortId(r.id); td1.title = r.id; }
      else td1.textContent = '—';
      tr.appendChild(td1);
      var td2 = document.createElement('td');
      td2.className = 'sl-mono';
      td2.textContent = r.level === 'account' ? r.id : '—';
      tr.appendChild(td2);
      var td3 = document.createElement('td');
      attr(td3, LEVELS[r.level].en, LEVELS[r.level].zh);
      tr.appendChild(td3);
      var td4 = document.createElement('td');
      var badge = document.createElement('span');
      badge.className = 'sl-badge ' + TAGS[r.tag].badge;
      attr(badge, TAGS[r.tag].en, TAGS[r.tag].zh);
      td4.appendChild(badge);
      tr.appendChild(td4);
      var td5 = document.createElement('td');
      td5.textContent = r.group || '—';
      tr.appendChild(td5);
      el.opTbody.appendChild(tr);
    });
    el.opNote.textContent = isZh() ? ('共 ' + fmt(op.count) + ' 条（快照）') : (fmt(op.count) + ' record(s) (snapshot)');
    openModal('oplog');
    if (window.__ugApplyLang) window.__ugApplyLang();
  }

  function exportOplog(no) {
    var op = findOp(no);
    if (!op) return;
    var header = 'third_customer_id（用户ID）,overdraft_id（账户ID）,tag_level（标签层级）,pool_type（执行标签）,detail_group（明细组）';
    var lines = op.rows.map(function (r) {
      return [r.level === 'user' ? r.id : '', r.level === 'account' ? r.id : '',
        r.level, r.tag, r.group].map(csvEscape).join(',');
    });
    var csv = '\ufeff' + [header].concat(lines).join('\n') + '\n';
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), op.no + '_records.csv');
    toast('Record list exported', '已导出操作清单', 'ok');
  }

  var COL_KEYS = ['pick', 'tcid', 'odid', 'level', 'tag', 'product', 'group', 'start', 'end', 'eff', 'enable', 'source', 'updated', 'action'];
  var COLS = [
    ['tcid', 'third_customer_id', 'third_customer_id'],
    ['odid', 'overdraft_id', 'overdraft_id'],
    ['level', '标签层级', 'Level'],
    ['tag', '执行标签', 'Execution tag'],
    ['product', '业务产品', 'Product'],
    ['group', '明细组', 'Group'],
    ['start', '生效时间', 'Effective from'],
    ['end', '失效时间', 'Effective to'],
    ['eff', '生效状态', 'Effective status'],
    ['enable', '启停状态', 'Enabled status'],
    ['source', '来源', 'Source'],
    ['updated', '更新时间', 'Updated at']
  ];
  var colPop = null;

  function applyCols() {
    if (!el.listTable) return;
    Array.prototype.forEach.call(el.listTable.querySelectorAll('thead th'), function (th) {
      var key = th.getAttribute('data-col');
      if (!key) return;
      th.hidden = state.cols[key] === false;
    });
  }

  function renderColPop() {
    var zh = isZh();
    var html = '<div class="sl-colpop-head"><span>' + (zh ? '列设置' : 'Columns') + '</span></div><div class="sl-colpop-list">';
    COLS.forEach(function (c) {
      html += '<label><input type="checkbox" data-col-key="' + c[0] + '"' + (state.cols[c[0]] === false ? '' : ' checked') +
        '><span data-en="' + c[2] + '" data-zh="' + c[1] + '">' + (zh ? c[1] : c[2]) + '</span></label>';
    });
    html += '</div><div class="sl-colpop-foot"><button type="button" data-col-all>' + (zh ? '全选' : 'Select all') +
      '</button><button type="button" data-col-reset>' + (zh ? '恢复默认' : 'Reset') + '</button></div>';
    colPop.innerHTML = html;
  }

  function buildColPop() {
    colPop = document.createElement('div');
    colPop.className = 'sl-colpop';
    colPop.hidden = true;
    root.appendChild(colPop);
    colPop.addEventListener('click', function (e) {
      var cb = e.target.closest('input[data-col-key]');
      if (cb) {
        state.cols[cb.getAttribute('data-col-key')] = cb.checked;
        applyCols();
        renderList();
        return;
      }
      if (e.target.closest('[data-col-all]') || e.target.closest('[data-col-reset]')) {
        COLS.forEach(function (c) { state.cols[c[0]] = true; });
        renderColPop();
        applyCols();
        renderList();
      }
    });
    document.addEventListener('mousedown', function (e) {
      if (!colPop || colPop.hidden) return;
      if (colPop.contains(e.target)) return;
      if (e.target.closest && e.target.closest('[data-sl-colbtn]')) return;
      colPop.hidden = true;
    });
    window.addEventListener('resize', function () { if (colPop) colPop.hidden = true; });
  }

  function openColPop(btn) {
    renderColPop();
    colPop.hidden = false;
    var rect = btn.getBoundingClientRect();
    var w = 280;
    var left = Math.min(rect.right - w, window.innerWidth - w - 12);
    colPop.style.left = Math.max(12, left) + 'px';
    colPop.style.top = (rect.bottom + 6) + 'px';
  }

  function openRecordDetail(ix) {
    var row = state.rows[ix];
    if (!row) return;
    el.rdTcid.textContent = row.level === 'user' ? row.id : '—';
    el.rdOdid.textContent = row.level === 'account' ? row.id : '—';
    attr(el.rdLevel, LEVELS[row.level].en, LEVELS[row.level].zh);
    attr(el.rdTag, TAGS[row.tag].en, TAGS[row.tag].zh);
    el.rdProduct.textContent = row.product || 'OD';
    el.rdGroup.textContent = row.group || '—';
    el.rdStart.textContent = row.start;
    el.rdEnd.textContent = row.end;
    var eff = RECORD_STATUS[effStatus(row)];
    el.rdEff.className = 'sl-badge ' + eff.badge;
    attr(el.rdEff, eff.en, eff.zh);
    var en = ENABLE_STATUS[row.stopped ? 'disabled' : 'enabled'];
    el.rdEnable.className = 'sl-badge ' + en.badge;
    attr(el.rdEnable, en.en, en.zh);
    attr(el.rdSource, SOURCES[row.source].en, SOURCES[row.source].zh);
    el.rdUpdated.textContent = row.updatedAt;

    var hist = [];
    state.opLogs.forEach(function (op) {
      var hit = op.rows.some(function (r) { return r.level === row.level && r.id === row.id; });
      if (hit) hist.push({ time: op.time, typeEn: op.typeEn, typeZh: op.typeZh, no: op.no, operator: op.operator });
    });
    hist.sort(function (a, b) { return a.time === b.time ? 0 : (a.time < b.time ? 1 : -1); });
    el.rdHistory.innerHTML = '';
    hist.forEach(function (h) {
      var tr = document.createElement('tr');
      var td1 = document.createElement('td');
      td1.className = 'sl-mono';
      td1.textContent = h.time;
      tr.appendChild(td1);
      var td2 = document.createElement('td');
      attr(td2, h.typeEn, h.typeZh);
      tr.appendChild(td2);
      var td3 = document.createElement('td');
      td3.className = 'sl-mono';
      td3.textContent = h.no;
      tr.appendChild(td3);
      var td4 = document.createElement('td');
      td4.textContent = h.operator;
      tr.appendChild(td4);
      el.rdHistory.appendChild(tr);
    });
    el.rdNote.textContent = hist.length
      ? (isZh() ? '共 ' + hist.length + ' 条页面操作记录（导入明细在真实系统可查）' : hist.length + ' page operation(s); import details are available in production.')
      : (isZh() ? '暂无页面操作记录' : 'No page operation records yet.');
    openModal('record');
    if (window.__ugApplyLang) window.__ugApplyLang();
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
      td.colSpan = 14;
      td.className = 'sl-empty';
      attr(td, 'No data', '暂无数据');
      tr.appendChild(td);
      el.tbody.appendChild(tr);
    }
    pageRows.forEach(function (row) {
      var tr = document.createElement('tr');
      var ix = state.rows.indexOf(row);

      var tdPick = document.createElement('td');
      tdPick.className = 'sl-pick-cell';
      var pick = document.createElement('input');
      pick.type = 'checkbox';
      pick.className = 'sl-pick';
      pick.setAttribute('data-sl-pick', String(ix));
      pick.checked = state.selected.indexOf(row) >= 0;
      tdPick.appendChild(pick);
      tr.appendChild(tdPick);

      var tdCid = document.createElement('td');
      if (row.level === 'user') {
        var spanCid = document.createElement('span');
        spanCid.className = 'sl-mono';
        spanCid.textContent = shortId(row.id);
        spanCid.title = row.id;
        tdCid.appendChild(spanCid);
      } else {
        tdCid.textContent = '—';
      }
      tr.appendChild(tdCid);

      var tdOd = document.createElement('td');
      if (row.level === 'account') {
        tdOd.className = 'sl-mono';
        tdOd.textContent = row.id;
      } else {
        tdOd.textContent = '—';
      }
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

      var tdProduct = document.createElement('td');
      attr(tdProduct, PRODUCTS[row.product || ''].en, PRODUCTS[row.product || ''].zh);
      tr.appendChild(tdProduct);

      var tdGroup = document.createElement('td');
      tdGroup.textContent = row.group || '—';
      tr.appendChild(tdGroup);

      var tdStart = document.createElement('td');
      tdStart.className = 'sl-mono';
      tdStart.textContent = row.start;
      tr.appendChild(tdStart);

      var tdEnd = document.createElement('td');
      tdEnd.className = 'sl-mono';
      tdEnd.textContent = row.end;
      tr.appendChild(tdEnd);

      var tdEff = document.createElement('td');
      var eff = RECORD_STATUS[effStatus(row)];
      var badgeE = document.createElement('span');
      badgeE.className = 'sl-badge ' + eff.badge;
      attr(badgeE, eff.en, eff.zh);
      tdEff.appendChild(badgeE);
      tr.appendChild(tdEff);

      var tdEnable = document.createElement('td');
      var en = ENABLE_STATUS[row.stopped ? 'disabled' : 'enabled'];
      var badgeEn = document.createElement('span');
      badgeEn.className = 'sl-badge ' + en.badge;
      attr(badgeEn, en.en, en.zh);
      tdEnable.appendChild(badgeEn);
      tr.appendChild(tdEnable);

      var tdSource = document.createElement('td');
      attr(tdSource, SOURCES[row.source].en, SOURCES[row.source].zh);
      tr.appendChild(tdSource);

      var tdTime = document.createElement('td');
      tdTime.className = 'sl-mono';
      tdTime.textContent = row.updatedAt;
      tr.appendChild(tdTime);

      var tdAction = document.createElement('td');
      var act = document.createElement('div');
      act.className = 'sl-actions';
      var btnDetail = document.createElement('button');
      btnDetail.type = 'button';
      btnDetail.className = 'sl-link';
      btnDetail.style.border = '0';
      btnDetail.style.background = 'transparent';
      btnDetail.style.cursor = 'pointer';
      btnDetail.style.padding = '0';
      btnDetail.dataset.slRecord = String(ix);
      attr(btnDetail, 'Details', '详情');
      act.appendChild(btnDetail);
      var btnStop = document.createElement('button');
      btnStop.type = 'button';
      btnStop.className = 'sl-link';
      btnStop.style.border = '0';
      btnStop.style.background = 'transparent';
      btnStop.style.cursor = 'pointer';
      btnStop.style.padding = '0';
      btnStop.dataset.slStop = String(ix);
      attr(btnStop, row.stopped ? 'Enable' : 'Disable', row.stopped ? '启用' : '停用');
      act.appendChild(btnStop);
      var btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'sl-link';
      btnDel.style.border = '0';
      btnDel.style.background = 'transparent';
      btnDel.style.cursor = 'pointer';
      btnDel.style.padding = '0';
      btnDel.dataset.slDel = String(ix);
      attr(btnDel, 'Delete', '删除');
      act.appendChild(btnDel);
      tdAction.appendChild(act);
      tr.appendChild(tdAction);

      Array.prototype.forEach.call(tr.children, function (td, ci) {
        var key = COL_KEYS[ci];
        if (!key) return;
        td.setAttribute('data-col', key);
        if (state.cols[key] === false) td.hidden = true;
      });

      el.tbody.appendChild(tr);
    });

    var pickAll = root.querySelector('#sl-pick-all');
    if (pickAll) {
      var picked = pageRows.filter(function (r) { return state.selected.indexOf(r) >= 0; }).length;
      pickAll.checked = pageRows.length > 0 && picked === pageRows.length;
      pickAll.indeterminate = picked > 0 && picked < pageRows.length;
    }
    updateBatchButtons();
    updateSelBar();
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
  function renderChanges() {
    el.changeTbody.innerHTML = '';
    var items = [];
    state.batches.forEach(function (b) {
      items.push({ kind: 'import', ref: b, no: b.no, typeEn: 'File import', typeZh: '文件导入', count: b.count, status: b.status, operator: b.operator, time: b.createdAt });
    });
    state.opLogs.forEach(function (o) {
      items.push({ kind: 'op', ref: o, no: o.no, typeEn: o.typeEn, typeZh: o.typeZh, count: o.count, status: 'done', operator: o.operator, time: o.time });
    });
    var cf = state.changeFilters || {};
    if (cf.q) {
      var q = cf.q.toLowerCase();
      items = items.filter(function (it) {
        return it.kind === 'op' && it.ref.rows.some(function (r) {
          return String(r.id).toLowerCase().indexOf(q) >= 0;
        });
      });
    }
    if (cf.type) items = items.filter(function (it) { return it.typeZh === cf.type; });
    if (cf.status) {
      items = items.filter(function (it) {
        var label = it.kind === 'import' ? BATCH_STATUS[it.status].zh : '已完成';
        return label === cf.status;
      });
    }
    if (cf.operator) {
      var opq = cf.operator.toLowerCase();
      items = items.filter(function (it) { return String(it.operator || '').toLowerCase().indexOf(opq) >= 0; });
    }
    if (cf.from) items = items.filter(function (it) { return it.time.slice(0, 10) >= cf.from; });
    if (cf.to) items = items.filter(function (it) { return it.time.slice(0, 10) <= cf.to; });
    items.sort(function (a, b) { return a.time === b.time ? 0 : (a.time < b.time ? 1 : -1); });

    if (!items.length) {
      var tr0 = document.createElement('tr');
      var td0 = document.createElement('td');
      td0.colSpan = 7;
      td0.className = 'sl-empty';
      attr(td0, 'No data', '暂无数据');
      tr0.appendChild(td0);
      el.changeTbody.appendChild(tr0);
      return;
    }

    items.forEach(function (it) {
      var tr = document.createElement('tr');

      var tdNo = document.createElement('td');
      tdNo.className = 'sl-mono';
      tdNo.textContent = it.no;
      tr.appendChild(tdNo);

      var tdType = document.createElement('td');
      attr(tdType, it.typeEn, it.typeZh);
      tr.appendChild(tdType);

      var tdCount = document.createElement('td');
      tdCount.textContent = fmt(it.count);
      tr.appendChild(tdCount);

      var tdStatus = document.createElement('td');
      var badge = document.createElement('span');
      var st = it.kind === 'import' ? BATCH_STATUS[it.status] : { en: 'Completed', zh: '已完成', badge: 'sl-badge-green' };
      badge.className = 'sl-badge ' + st.badge;
      attr(badge, st.en, st.zh);
      tdStatus.appendChild(badge);
      tr.appendChild(tdStatus);

      var tdOperator = document.createElement('td');
      tdOperator.textContent = it.operator;
      tr.appendChild(tdOperator);

      var tdTime = document.createElement('td');
      tdTime.className = 'sl-mono';
      tdTime.textContent = it.time;
      tr.appendChild(tdTime);

      var tdAction = document.createElement('td');
      var act = document.createElement('div');
      act.className = 'sl-actions';
      if (it.kind === 'import') {
        var btnDl = document.createElement('button');
        btnDl.type = 'button';
        btnDl.className = 'sl-link';
        btnDl.style.border = '0';
        btnDl.style.background = 'transparent';
        btnDl.style.cursor = 'pointer';
        btnDl.style.padding = '0';
        btnDl.setAttribute('data-sl-change-download', it.no);
        attr(btnDl, 'Download', '下载');
        act.appendChild(btnDl);
      }
      var btnDetail = document.createElement('button');
      btnDetail.type = 'button';
      btnDetail.className = 'sl-link';
      btnDetail.style.border = '0';
      btnDetail.style.background = 'transparent';
      btnDetail.style.cursor = 'pointer';
      btnDetail.style.padding = '0';
      btnDetail.setAttribute('data-sl-change-detail', it.kind + ':' + it.no);
      attr(btnDetail, 'Details', '详情');
      act.appendChild(btnDetail);
      if (it.kind === 'op') {
        var btnEx = document.createElement('button');
        btnEx.type = 'button';
        btnEx.className = 'sl-link';
        btnEx.style.border = '0';
        btnEx.style.background = 'transparent';
        btnEx.style.cursor = 'pointer';
        btnEx.style.padding = '0';
        btnEx.setAttribute('data-sl-change-export', it.no);
        attr(btnEx, 'Export list', '导出清单');
        act.appendChild(btnEx);
      }
      tdAction.appendChild(act);
      tr.appendChild(tdAction);

      el.changeTbody.appendChild(tr);
    });
    if (window.__ugApplyLang) window.__ugApplyLang();
  }

  // ── 批次详情 ──────────────────────────────────────────
  function openBatchDetail(no) {
    var batch = null;
    state.batches.forEach(function (b) { if (b.no === no) batch = b; });
    if (!batch) return;

    el.bdNo.textContent = batch.no;
    attr(el.bdSource, SOURCES[batch.source].en, SOURCES[batch.source].zh);
    el.bdCount.textContent = fmt(batch.count);
    el.bdAdded.textContent = fmt(batch.added || 0);
    el.bdOverwritten.textContent = fmt(batch.overwritten || 0);
    var st = BATCH_STATUS[batch.status];
    el.bdStatus.className = 'sl-badge ' + st.badge;
    attr(el.bdStatus, st.en, st.zh);
    el.bdOperator.textContent = batch.operator;
    el.bdTime.textContent = batch.createdAt;
    var failText = batch.validationFail
      ? (isZh()
        ? '行校验失败：' + fmt(batch.failed || 0) + ' 行非法，整批未导入；可下载失败明细修正后重传。'
        : (fmt(batch.failed || 0) + ' invalid rows — nothing imported. Download the failure details, fix and re-upload.'))
      : batch.failReason;
    if (batch.status === 'failed' && failText) {
      el.bdFail.textContent = failText;
      el.bdFailRow.hidden = false;
    } else {
      el.bdFailRow.hidden = true;
    }
    if (el.bdFailDl) {
      el.bdFailDl.hidden = !(batch.details && batch.details.length);
    }

    el.bdTbody.innerHTML = '';
    var note;
    if (batch.status === 'failed') {
      note = batch.validationFail
        ? (isZh() ? '行校验失败，整批未导入（名单零变化）。' : 'Validation failed — nothing imported (no list changes).')
        : (isZh() ? '该批次处理失败，未写入名单。' : 'This import failed — nothing was written to the list.');
    } else if (batch.status === 'processing') {
      note = isZh() ? '批次处理中，将自动生效。' : 'Processing — it will take effect shortly.';
    } else {
      var rows = genRows(batch.no, batch.count, batch.createdAt, { fileOnly: true });
      rows.slice(0, 10).forEach(function (r) {
        var tr = document.createElement('tr');
        var td1 = document.createElement('td');
        td1.className = 'sl-mono';
        if (r.level === 'user') { td1.textContent = shortId(r.id); td1.title = r.id; }
        else td1.textContent = '—';
        tr.appendChild(td1);
        var td2 = document.createElement('td');
        td2.className = 'sl-mono';
        td2.textContent = r.level === 'account' ? r.id : '—';
        tr.appendChild(td2);
        var td3 = document.createElement('td');
        attr(td3, LEVELS[r.level].en, LEVELS[r.level].zh);
        tr.appendChild(td3);
        var td4 = document.createElement('td');
        var bd = document.createElement('span');
        bd.className = 'sl-badge ' + TAGS[r.tag].badge;
        attr(bd, TAGS[r.tag].en, TAGS[r.tag].zh);
        td4.appendChild(bd);
        tr.appendChild(td4);
        var td5p = document.createElement('td');
        attr(td5p, PRODUCTS[r.product || ''].en, PRODUCTS[r.product || ''].zh);
        tr.appendChild(td5p);
        var td5 = document.createElement('td');
        td5.textContent = r.group || '—';
        tr.appendChild(td5);
        el.bdTbody.appendChild(tr);
      });
      note = isZh()
        ? ('共 ' + fmt(batch.count) + ' 条，此处预览前 ' + Math.min(10, batch.count) + ' 条。')
        : ('Total ' + fmt(batch.count) + ' rows — previewing the first ' + Math.min(10, batch.count) + '.');
    }
    el.bdNote.textContent = note;
    el.bdCurrent = batch.no;

    openModal('batch');
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

  // ── 日期选择器（自定义，跨浏览器一致）──────────────────
  var pickerState = { box: null, input: null, mode: 'date', viewY: 0, viewM: 0, sel: null, hh: 0, mm: 0 };

  function pd2(n) { return n < 10 ? '0' + n : String(n); }

  function parsePickerVal(v, mode) {
    var re = mode === 'date' ? /^(\d{4})-(\d{2})-(\d{2})$/ : /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;
    var m = re.exec((v || '').trim());
    if (!m) return null;
    return { y: +m[1], m: +m[2] - 1, d: +m[3], hh: m[4] ? +m[4] : 0, mm: m[5] ? +m[5] : 0 };
  }

  function pickerText(st, mode) {
    var base = st.y + '-' + pd2(st.m + 1) + '-' + pd2(st.d);
    return mode === 'date' ? base : base + ' ' + pd2(st.hh) + ':' + pd2(st.mm);
  }

  function buildPicker() {
    var box = document.createElement('div');
    box.className = 'sl-date-pop';
    box.hidden = true;
    box.innerHTML = '<div class="sl-date-head">' +
      '<button type="button" class="sl-date-nav" data-sl-prev>&lsaquo;</button>' +
      '<span class="sl-date-title"></span>' +
      '<button type="button" class="sl-date-nav" data-sl-next>&rsaquo;</button>' +
      '</div><div class="sl-date-week"></div><div class="sl-date-grid"></div>' +
      '<div class="sl-date-time" hidden><select class="sl-date-sel" data-sl-hh></select><span>:</span><select class="sl-date-sel" data-sl-mm></select></div>' +
      '<div class="sl-date-foot"><button type="button" class="sl-date-btn2" data-sl-clear></button>' +
      '<button type="button" class="sl-date-btn2 sl-date-ok" data-sl-ok></button></div>';
    root.appendChild(box);
    pickerState.box = box;

    box.addEventListener('mousedown', function (e) { e.preventDefault(); });
    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-sl-prev]')) { shiftMonth(-1); return; }
      if (e.target.closest('[data-sl-next]')) { shiftMonth(1); return; }
      if (e.target.closest('[data-sl-clear]')) { commitPicker('', true); return; }
      if (e.target.closest('[data-sl-ok]')) {
        var cur = pickerState.sel;
        if (!cur) return;
        commitPicker(pickerText({ y: cur.y, m: cur.m, d: cur.d, hh: pickerState.hh, mm: pickerState.mm }, pickerState.mode), true);
        return;
      }
      var day = e.target.closest('[data-sl-day]');
      if (day) {
        var y = +day.getAttribute('data-y'), m = +day.getAttribute('data-m'), d = +day.getAttribute('data-d');
        pickerState.sel = { y: y, m: m, d: d };
        if (pickerState.mode === 'date') commitPicker(pickerText({ y: y, m: m, d: d }, 'date'), true);
        else renderPicker();
      }
    });
    box.addEventListener('change', function (e) {
      if (e.target.matches('[data-sl-hh]')) pickerState.hh = +e.target.value;
      if (e.target.matches('[data-sl-mm]')) pickerState.mm = +e.target.value;
    });

    var hh = box.querySelector('[data-sl-hh]');
    var mm = box.querySelector('[data-sl-mm]');
    for (var i = 0; i < 24; i += 1) {
      var o = document.createElement('option'); o.value = pd2(i); o.textContent = pd2(i); hh.appendChild(o);
    }
    for (var j = 0; j < 60; j += 1) {
      var o2 = document.createElement('option'); o2.value = pd2(j); o2.textContent = pd2(j); mm.appendChild(o2);
    }

    document.addEventListener('mousedown', function (e) {
      if (!pickerState.input || box.hidden) return;
      if (box.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.sl-date')) return;
      closePicker();
    });
    window.addEventListener('resize', closePicker);
    window.addEventListener('scroll', closePicker, true);
  }

  function shiftMonth(delta) {
    var m = pickerState.viewM + delta, y = pickerState.viewY;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    pickerState.viewY = y;
    pickerState.viewM = m;
    renderPicker();
  }

  function renderPicker() {
    var box = pickerState.box;
    var zh = isZh();
    box.querySelector('.sl-date-title').textContent = pickerState.viewY + ' / ' + pd2(pickerState.viewM + 1);
    var week = box.querySelector('.sl-date-week');
    var names = zh ? ['一', '二', '三', '四', '五', '六', '日'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    week.innerHTML = names.map(function (w) { return '<span>' + w + '</span>'; }).join('');
    var grid = box.querySelector('.sl-date-grid');
    var first = new Date(pickerState.viewY, pickerState.viewM, 1);
    var startIdx = (first.getDay() + 6) % 7;
    var start = new Date(pickerState.viewY, pickerState.viewM, 1 - startIdx);
    var today = new Date();
    var html = '';
    for (var i = 0; i < 42; i += 1) {
      var d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      var cls = 'sl-date-day';
      if (d.getMonth() !== pickerState.viewM) cls += ' sl-out';
      if (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()) cls += ' sl-today';
      if (pickerState.sel && d.getFullYear() === pickerState.sel.y && d.getMonth() === pickerState.sel.m && d.getDate() === pickerState.sel.d) cls += ' sl-sel';
      html += '<button type="button" class="' + cls + '" data-sl-day data-y="' + d.getFullYear() +
        '" data-m="' + d.getMonth() + '" data-d="' + d.getDate() + '">' + d.getDate() + '</button>';
    }
    grid.innerHTML = html;
    var timeRow = box.querySelector('.sl-date-time');
    timeRow.hidden = pickerState.mode !== 'datetime';
    if (pickerState.mode === 'datetime') {
      box.querySelector('[data-sl-hh]').value = pd2(pickerState.hh);
      box.querySelector('[data-sl-mm]').value = pd2(pickerState.mm);
    }
    box.querySelector('[data-sl-clear]').textContent = zh ? '清除' : 'Clear';
    box.querySelector('[data-sl-ok]').textContent = zh ? '确定' : 'OK';
  }

  function openPicker(input) {
    var mode = input.getAttribute('data-sl-mode') === 'datetime' ? 'datetime' : 'date';
    var v = parsePickerVal(input.value, mode);
    var now = new Date();
    pickerState.input = input;
    pickerState.mode = mode;
    pickerState.sel = v ? { y: v.y, m: v.m, d: v.d } : null;
    pickerState.hh = v ? v.hh : now.getHours();
    pickerState.mm = v ? v.mm : now.getMinutes();
    var view = v || { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
    pickerState.viewY = view.y;
    pickerState.viewM = view.m;
    renderPicker();
    var box = pickerState.box;
    box.hidden = false;
    var rect = input.getBoundingClientRect();
    var w = 252;
    var left = Math.min(rect.left, window.innerWidth - w - 12);
    var top = rect.bottom + 6;
    if (top + 330 > window.innerHeight) top = Math.max(12, rect.top - 336);
    box.style.left = Math.max(12, left) + 'px';
    box.style.top = top + 'px';
  }

  function closePicker() {
    if (!pickerState.box) return;
    pickerState.box.hidden = true;
    pickerState.input = null;
  }

  function commitPicker(text, close) {
    var input = pickerState.input;
    if (input) {
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (close) closePicker();
  }

  // ── 同键校验（同层级同 ID）────────────────────────────
  function findSameLevelDup(product, level, id) {
    for (var i = 0; i < state.rows.length; i += 1) {
      var r = state.rows[i];
      if ((r.product || '') === (product || '') && r.level === level && r.id === id) return r;
    }
    return null;
  }

  // ── 文件解析（模拟）────────────────────────────────────
  function mockParseFile(fileName) {
    var lower = String(fileName || '').toLowerCase();
    var failing = /(非法|invalid|fail|error)/.test(lower);
    var parsed = 1240 + (hashStr(lower) % 420);
    if (!failing) {
      var ow = Math.floor(parsed * 0.15);
      return { fileName: fileName, parsed: parsed, added: parsed - ow, overwritten: ow, failed: 0, details: [] };
    }
    var failed = 6 + (hashStr(lower + 'x') % 36);
    var added = Math.floor((parsed - failed) * 0.15);
    var overwritten = parsed - failed - added;
    var detailRows = [7, 12, 23, 41, 58].slice(0, Math.min(5, failed));
    var cycle = failureCycle();
    var details = detailRows.map(function (rowNo, i) {
      var c = cycle[i % cycle.length];
      return { row: rowNo, en: c.en, zh: c.zh, fields: mockBadRow(i % cycle.length, rowNo) };
    });
    return { fileName: fileName, parsed: parsed, added: added, overwritten: overwritten, failed: failed, details: details };
  }

  function resetUploadModal() {
    el.fileName.textContent = '';
    attr(el.fileName, 'No file selected', '未选择文件');
    el.uploadPreview.hidden = true;
    el.uploadError.hidden = true;
    el.uploadDetail.hidden = true;
    el.uploadDetailList.innerHTML = '';
    el.uploadParsed.textContent = '0';
    el.uploadAdded.textContent = '0';
    el.uploadOverwritten.textContent = '0';
    el.uploadFailed.textContent = '0';
    el.uploadConfirm.disabled = true;
    el.parseResult = null;
    if (el.fileInput) el.fileInput.value = '';
  }

  // ── 文件下载 ──────────────────────────────────────────
  function csvEscape(v) {
    var s = String(v === null || v === undefined ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function triggerDownload(blob, fileName) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    root.appendChild(a);
    a.click();
    root.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var CSV_HEADER = 'third_customer_id（用户ID）,overdraft_id（账户ID）,tag_level（标签层级）,pool_type（执行标签）,product_code（业务产品）,detail_group（明细组）,effective_start（生效时间）,effective_end（失效时间）,remark（备注）';

  function downloadBatchFile(no) {
    var batch = null;
    state.batches.forEach(function (b) { if (b.no === no) batch = b; });
    if (!batch) return;
    if (batch.file) {
      triggerDownload(batch.file, batch.file.name || (batch.no + '.csv'));
      toast('Source file downloaded', '已下载原文件：' + (batch.file.name || batch.no), 'ok');
      return;
    }
    var rows = genRows(batch.no, batch.count, batch.createdAt, { fileOnly: true });
    var lines = rows.map(function (r) {
      return [r.level === 'user' ? r.id : '', r.level === 'account' ? r.id : '',
        r.level, r.tag, r.product || '', r.group, r.start, r.end, ''].map(csvEscape).join(',');
    });
    var csv = [CSV_HEADER].concat(lines).join('\n') + '\n';
    triggerDownload(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), batch.no + '_source.csv');
    toast('Source file downloaded', '已下载原文件：' + batch.no, 'ok');
  }

  function failureCycle() {
    return [
      { en: 'user-level row must not contain overdraft_id', zh: '用户级记录不允许填写 overdraft_id' },
      { en: 'account-level row must not contain third_customer_id', zh: '账户级记录不允许填写 third_customer_id' },
      { en: 'user-level row is missing third_customer_id', zh: '用户级记录缺少 third_customer_id' },
      { en: 'account-level row is missing overdraft_id', zh: '账户级记录缺少 overdraft_id' },
      { en: 'invalid time format (expected YYYY-MM-DD HH:mm:ss)', zh: '时间格式非法（应为 YYYY-MM-DD HH:mm:ss）' },
      { en: 'start time must not be earlier than now', zh: '开始时间不得早于当前时间' },
      { en: 'end time must be later than start time', zh: '失效时间必须晚于生效时间' },
      { en: 'detail_group is not in the preset list', zh: 'detail_group 不在预设八个组清单内' },
      { en: 'detail_group conflicts with tag_level / pool_type', zh: '明细组与标签层级 / 执行标签不匹配（组目录交叉校验失败）' },
      { en: 'product_code is invalid (OD only in this release)', zh: 'product_code 非法（本期仅允许 OD）' },
      { en: 'overdraft_id is only allowed when product_code is OD', zh: 'overdraft_id 仅允许用于业务产品 OD（非 OD 产品该列必须为空）' }
    ];
  }

  function mockBadRow(i, rowNo) {
    var rnd = mulberry32(hashStr('bad' + rowNo));
    var cid = hexId(rnd);
    var od = String(10000000 + Math.floor(rnd() * 89999999));
    var t1 = '2026-12-01 09:00:00';
    var t2 = '2027-12-01 09:00:00';
    var cases = [
      [cid, od, 'user', 'increase_only', 'OD', 'Staff组', t1, t2, ''],
      [cid, od, 'account', 'no_adjust', 'OD', '回捞组', t1, t2, ''],
      ['', '', 'user', 'decrease_only', 'OD', '风险触发组', t1, t2, ''],
      ['', '', 'account', 'no_adjust', 'OD', '模型切换实验组', t1, t2, ''],
      [cid, '', 'user', 'increase_only', 'OD', 'Staff组', '2026/12/01 9:00', t2, ''],
      [cid, '', 'user', 'decrease_only', 'OD', '人工降额名单组', '2026-01-01 10:00:00', t2, ''],
      [cid, '', 'user', 'increase_only', 'OD', 'Staff组', '2027-05-01 09:00:00', '2026-12-01 09:00:00', ''],
      [cid, '', 'user', 'decrease_only', 'OD', '测试新组', t1, t2, ''],
      [cid, '', 'user', 'no_adjust', 'OD', 'Staff组', t1, t2, ''],
      [cid, '', 'account', 'no_adjust', 'BL', '降额实验组', t1, t2, '']
    ];
    return cases[i % cases.length];
  }

  function buildFailureRows(details, total) {
    var cycle = failureCycle();
    var rows = [];
    details.forEach(function (d, i) {
      rows.push({ row: d.row, fields: mockBadRow(i % cycle.length, d.row), reason: d.zh || d.reason || '' });
    });
    for (var j = details.length; j < (total || details.length); j += 1) {
      var rowNo = 60 + ((j * 7) % 40);
      rows.push({ row: rowNo, fields: mockBadRow(j % cycle.length, rowNo), reason: cycle[j % cycle.length].zh });
    }
    return rows;
  }

  function downloadFailureCsv(details, total, baseName) {
    var rows = buildFailureRows(details || [], total || (details || []).length);
    var header = '行号,' + CSV_HEADER + ',失败原因';
    var lines = rows.map(function (r) {
      return [String(r.row)].concat(r.fields).concat([r.reason]).map(csvEscape).join(',');
    });
    var base = String(baseName || 'import').replace(/\.[^.]+$/, '');
    triggerDownload(new Blob(['\ufeff' + [header].concat(lines).join('\n') + '\n'],
      { type: 'text/csv;charset=utf-8' }), base + '_failures.csv');
    toast('Failure details downloaded', '已下载失败明细', 'ok');
  }

  function downloadFailureDetails() {
    var result = el.parseResult;
    if (!result || !result.failed) return;
    downloadFailureCsv(result.details, result.failed, result.fileName);
  }

  // ── 筛选 ──────────────────────────────────────────────
  function readFilters() {
    return {
      tcid: el.fTcid.value.trim(),
      odid: el.fOdid.value.trim(),
      startFrom: el.fStartFrom.value,
      startTo: el.fStartTo.value,
      endFrom: el.fEndFrom.value,
      endTo: el.fEndTo.value,
      group: el.fGroup.value,
      level: el.fLevel.value,
      tag: el.fTag.value,
      product: el.fProduct.value,
      source: el.fSource.value,
      eff: el.fEff.value,
      enable: el.fEnable.value
    };
  }

  function applySearch() {
    state.selected = [];
    state.allSelected = false;
    state.filters = readFilters();
    state.page = 1;
    renderList();
  }

  function resetFilters() {
    state.selected = [];
    state.allSelected = false;
    [el.fTcid, el.fOdid, el.fStartFrom, el.fStartTo, el.fEndFrom, el.fEndTo].forEach(function (n) { n.value = ''; });
    [el.fGroup, el.fLevel, el.fTag, el.fProduct, el.fSource, el.fEff, el.fEnable].forEach(function (n) { n.value = ''; });
    state.filters = {};
    state.page = 1;
    renderList();
  }

  // ── 单条新增 ──────────────────────────────────────────
  function resetSingle() {
    el.singleError.hidden = true;
    el.singleTcid.value = '';
    el.singleOdid.value = '';
    el.singleLevel.value = 'user';
    el.singleLevel.disabled = false;
    el.singleTcidField.hidden = false;
    el.singleOdidField.hidden = true;
    el.singleTag.value = 'no_adjust';
    el.singleTag.disabled = false;
    el.singleProduct.value = 'OD';
    el.singleProduct.disabled = false;
    el.singleCascadeHint.hidden = true;
    el.singleGroup.value = '';
    el.singleRemark.value = '';
    var now = new Date();
    el.singleStart.value = fmtD(now).slice(0, 16);
    el.singleEnd.value = fmtD(new Date(now.getTime() + 180 * 86400000)).slice(0, 16);
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
          resetSingle();
          openModal('single');
        } else if (action === 'search') {
          applySearch();
        } else if (action === 'reset') {
          resetFilters();
        }
      });
    });

    // 筛选：回车触发查询
    [el.fTcid, el.fOdid].forEach(function (n) {
      n.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') applySearch();
      });
    });

    // 列设置：表头列标识 + 弹出勾选面板（勾选列 / 操作列固定）
    Array.prototype.forEach.call(el.listTable.querySelectorAll('thead th'), function (th, i) {
      if (COL_KEYS[i]) th.setAttribute('data-col', COL_KEYS[i]);
    });
    applyCols();
    var colBtn = root.querySelector('[data-sl-colbtn]');
    if (colBtn) {
      colBtn.addEventListener('click', function (e) {
        e.preventDefault();
        if (!colPop) buildColPop();
        if (colPop.hidden) openColPop(colBtn);
        else colPop.hidden = true;
      });
    }

    // 日期选择器：点击输入框或日历图标打开（自定义实现，跨浏览器一致）
    buildPicker();
    root.querySelectorAll('[data-sl-date-input]').forEach(function (n) {
      n.addEventListener('click', function () { openPicker(n); });
      n.addEventListener('focus', function () { openPicker(n); });
      n.addEventListener('blur', function () {
        var mode = n.getAttribute('data-sl-mode') === 'datetime' ? 'datetime' : 'date';
        if (n.value.trim() && !parsePickerVal(n.value, mode)) n.value = '';
      });
    });
    root.querySelectorAll('[data-sl-date-btn]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var wrap = b.closest('.sl-date');
        var input = wrap && wrap.querySelector('[data-sl-date-input]');
        if (input) openPicker(input);
      });
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
    el.confirmOk.addEventListener('click', function () {
      var fn = confirmHandler;
      confirmHandler = null;
      closeModal();
      if (fn) fn();
    });

    // 名单：详情
    el.tbody.addEventListener('click', function (e) {
      var rbtn = e.target.closest('[data-sl-record]');
      if (rbtn) openRecordDetail(parseInt(rbtn.getAttribute('data-sl-record'), 10));
    });

    // 变更记录：按对象 ID 过滤
    function readChangeFilters() {
      return {
        q: (el.changeQ && el.changeQ.value || '').trim(),
        type: (el.changeType && el.changeType.value) || '',
        status: (el.changeStatus && el.changeStatus.value) || '',
        operator: (el.changeOperator && el.changeOperator.value || '').trim(),
        from: (el.changeFrom && el.changeFrom.value || '').trim(),
        to: (el.changeTo && el.changeTo.value || '').trim()
      };
    }
    function applyChangeFilters() {
      state.changeFilters = readChangeFilters();
      renderChanges();
    }
    if (el.changeSearch) el.changeSearch.addEventListener('click', applyChangeFilters);
    [el.changeQ, el.changeOperator, el.changeFrom, el.changeTo].forEach(function (n) {
      if (n) n.addEventListener('keydown', function (e) { if (e.key === 'Enter') applyChangeFilters(); });
    });
    if (el.changeClear) {
      el.changeClear.addEventListener('click', function () {
        state.changeFilters = { q: '', type: '', status: '', operator: '', from: '', to: '' };
        [el.changeQ, el.changeType, el.changeStatus, el.changeOperator, el.changeFrom, el.changeTo].forEach(function (n) {
          if (n) n.value = '';
        });
        renderChanges();
      });
    }

    // 名单：停用 / 启用、删除
    el.tbody.addEventListener('click', function (e) {
      var stopBtn = e.target.closest('[data-sl-stop]');
      if (stopBtn) {
        var ixs = parseInt(stopBtn.getAttribute('data-sl-stop'), 10);
        var r = state.rows[ixs];
        if (!r) return;
        var willStop = !r.stopped;
        openConfirm({
          titleEn: willStop ? 'Disable record' : 'Enable record',
          titleZh: willStop ? '停用记录' : '启用记录',
          textEn: willStop
            ? 'Disable ' + shortId(r.id) + '? It will stop participating in limit adjustment immediately; you can enable it again at any time.'
            : 'Enable ' + shortId(r.id) + '? It will resume participating in limit adjustment according to its validity window.',
          textZh: willStop
            ? '确认停用 ' + shortId(r.id) + '？停用后该记录立即不再参与调额匹配，可随时启用。'
            : '确认启用 ' + shortId(r.id) + '？启用后将按有效期窗口恢复参与调额匹配。',
          danger: false,
          onOk: function () {
            r.stopped = willStop;
            r.updatedAt = nowText();
            logOp(willStop ? '停用' : '启用', willStop ? 'Disable' : 'Enable', [r]);
            renderList();
            toast(willStop ? 'Record disabled' : 'Record enabled',
              willStop ? '已停用该记录' : '已启用该记录', 'ok');
          }
        });
        return;
      }
      var delBtn = e.target.closest('[data-sl-del]');
      if (!delBtn) return;
      var ix = parseInt(delBtn.getAttribute('data-sl-del'), 10);
      var rr = state.rows[ix];
      if (!rr) return;
      openConfirm({
        titleEn: 'Delete record',
        titleZh: '删除记录',
        textEn: 'Delete ' + shortId(rr.id) + '? It will stop participating in limit adjustment immediately and cannot be restored (use Disable if you may need it back).',
        textZh: '确认删除 ' + shortId(rr.id) + '？删除后立即不再参与调额匹配，且不可恢复（如需保留请用「停用」）。',
        danger: true,
        onOk: function () {
          logOp('单条删除', 'Delete', [rr]);
          state.rows.splice(ix, 1);
          renderList();
          toast('Record deleted', '已删除该条记录', 'ok');
        }
      });
    });

    // 名单：勾选 / 全选 / 批量停用·删除
    el.tbody.addEventListener('change', function (e) {
      var pick = e.target.closest('[data-sl-pick]');
      if (!pick) return;
      var ix = parseInt(pick.getAttribute('data-sl-pick'), 10);
      var row = state.rows[ix];
      if (!row) return;
      var at = state.selected.indexOf(row);
      if (pick.checked && at < 0) state.selected.push(row);
      if (!pick.checked && at >= 0) state.selected.splice(at, 1);
      renderList();
    });

    var pickAllEl = root.querySelector('#sl-pick-all');
    if (pickAllEl) {
      pickAllEl.addEventListener('click', function () {
        var rows = visibleRows();
        var pageCount = Math.max(1, Math.ceil(rows.length / state.pageSize));
        if (state.page > pageCount) state.page = pageCount;
        var from = (state.page - 1) * state.pageSize;
        var pageRows = rows.slice(from, from + state.pageSize);
        var pageAll = pageRows.length > 0 && pageRows.every(function (r) { return state.selected.indexOf(r) >= 0; });
        if (state.allSelected) {
          state.selected = [];
          state.allSelected = false;
        } else if (pageAll) {
          state.selected = rows.slice();
          state.allSelected = true;
        } else {
          state.selected = pageRows.slice();
          state.allSelected = false;
        }
        renderList();
      });
    }

    var selClear = root.querySelector('#sl-selbar-clear');
    if (selClear) {
      selClear.addEventListener('click', function () {
        state.selected = [];
        state.allSelected = false;
        renderList();
      });
    }

    root.querySelectorAll('[data-sl-batch]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-sl-batch');
        var list = state.selected.slice();
        if (!list.length) return;
        if (action === 'stop') {
          var stoppable = list.filter(function (r) { return !r.stopped && effStatus(r) !== 'expired'; });
          if (!stoppable.length) {
            toast('No records to disable', '所选记录均已停用或已失效，无需停用', '');
            return;
          }
          var skipped = list.length - stoppable.length;
          openConfirm({
            titleEn: 'Disable selected records',
            titleZh: '批量停用',
            textEn: 'Disable ' + stoppable.length + ' selected record(s)?' +
              (skipped ? ' ' + skipped + ' already disabled / expired record(s) will be skipped.' : ' They will stop participating in limit adjustment immediately; you can enable them again later.'),
            textZh: '确认停用所选记录中的 ' + stoppable.length + ' 条？' +
              (skipped ? '已有 ' + skipped + ' 条为已停用或已失效，将跳过。' : '停用后立即不再参与调额匹配，可随时启用。'),
            danger: false,
            onOk: function () {
              stoppable.forEach(function (r) {
                r.stopped = true;
                r.updatedAt = nowText();
              });
              state.selected = [];
              state.allSelected = false;
              logOp('批量停用', 'Bulk disable', stoppable);
              renderList();
              toast('Records disabled', '已停用 ' + stoppable.length + ' 条记录', 'ok');
            }
          });
        } else if (action === 'enable') {
          var stoppedList = list.filter(function (r) { return r.stopped; });
          if (!stoppedList.length) {
            toast('No disabled records selected', '所选记录均未停用，无需启用', '');
            return;
          }
          var expiredN = stoppedList.filter(function (r) { return effStatus(r) === 'expired'; }).length;
          openConfirm({
            titleEn: 'Enable selected records',
            titleZh: '批量启用',
            textEn: 'Enable ' + stoppedList.length + ' selected record(s)?' +
              (expiredN ? ' ' + expiredN + ' of them are already expired and will remain Expired — update their validity to make them effective.' : ' They will resume participating according to their validity windows.'),
            textZh: '确认启用所选记录中的 ' + stoppedList.length + ' 条停用记录？' +
              (expiredN ? '其中 ' + expiredN + ' 条已过失效时间，启用后仍为「已失效」，需修改有效期才能恢复生效。' : '启用后按各自有效期窗口恢复参与调额匹配。'),
            danger: false,
            onOk: function () {
              stoppedList.forEach(function (r) {
                r.stopped = false;
                r.updatedAt = nowText();
              });
              state.selected = [];
              state.allSelected = false;
              logOp('批量启用', 'Bulk enable', stoppedList);
              renderList();
              toast('Records enabled', '已启用 ' + stoppedList.length + ' 条记录', 'ok');
            }
          });
        } else {
          openConfirm({
            titleEn: 'Delete selected records',
            titleZh: '批量删除',
            textEn: 'Delete ' + list.length + ' selected record(s)? They will stop participating immediately and cannot be restored (use Disable if you may need them back).',
            textZh: '确认删除所选 ' + list.length + ' 条记录？删除后立即不再参与调额匹配，且不可恢复（如需保留请用「停用」）。',
            danger: true,
            onOk: function () {
              logOp('批量删除', 'Bulk delete', list);
              state.rows = state.rows.filter(function (r) { return list.indexOf(r) < 0; });
              state.selected = [];
              state.allSelected = false;
              renderList();
              toast('Records deleted', '已删除 ' + list.length + ' 条记录', 'ok');
            }
          });
        }
      });
    });

    // 操作详情：导出清单
    if (el.opExport) {
      el.opExport.addEventListener('click', function () { exportOplog(el.opNo.textContent); });
    }

    // 变更记录：下载 / 导出 / 详情
    el.changeTbody.addEventListener('click', function (e) {
      var dlBtn = e.target.closest('[data-sl-change-download]');
      if (dlBtn) {
        downloadBatchFile(dlBtn.getAttribute('data-sl-change-download'));
        return;
      }
      var exBtn = e.target.closest('[data-sl-change-export]');
      if (exBtn) {
        exportOplog(exBtn.getAttribute('data-sl-change-export'));
        return;
      }
      var btn = e.target.closest('[data-sl-change-detail]');
      if (!btn) return;
      var v = btn.getAttribute('data-sl-change-detail');
      var i = v.indexOf(':');
      var kind = v.slice(0, i), no = v.slice(i + 1);
      if (kind === 'import') openBatchDetail(no);
      else openOplog(no);
    });

    // 批次详情：下载原文件
    el.bdDownload.addEventListener('click', function () {
      if (el.bdCurrent) downloadBatchFile(el.bdCurrent);
    });

    if (el.bdFailDl) {
      el.bdFailDl.addEventListener('click', function () {
        var b = null;
        state.batches.forEach(function (x) { if (x.no === el.bdCurrent) b = x; });
        if (b && b.details && b.details.length) {
          downloadFailureCsv(b.details, b.failed || b.details.length, b.no);
        }
      });
    }

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
      el.uploadAdded.textContent = fmt(result.added);
      el.uploadOverwritten.textContent = fmt(result.overwritten);
      el.uploadFailed.textContent = fmt(result.failed);

      if (result.failed > 0) {
        attr(el.uploadError,
          result.failed + ' invalid rows — the whole import is abandoned. Fix the file and try again.',
          '存在 ' + result.failed + ' 条非法记录，本次整批放弃导入；请修正后重试。');
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

        // 行校验失败也留痕：生成一条「处理失败」的导入记录（名单零变化）
        var failedBatch = {
          no: nextBatchNo(), source: 'file', count: result.parsed,
          added: 0, overwritten: 0, status: 'failed',
          operator: 'baksun', createdAt: nowText(),
          validationFail: true, failed: result.failed, details: result.details
        };
        if (file) failedBatch.file = file;
        state.batches.unshift(failedBatch);
        renderChanges();
      } else {
        el.uploadError.hidden = true;
        el.uploadDetail.hidden = true;
        el.uploadDetailList.innerHTML = '';
        el.uploadConfirm.disabled = false;
      }
      if (window.__ugApplyLang) window.__ugApplyLang();
    });

    // 上传弹窗：下载失败明细
    if (el.uploadDl) {
      el.uploadDl.addEventListener('click', downloadFailureDetails);
    }

    // 上传弹窗：确认导入（增量合并：处理中 → 已处理）
    el.uploadConfirm.addEventListener('click', function () {
      var result = el.parseResult;
      if (!result || result.failed > 0 || state.processing) return;
      var no = nextBatchNo();
      var createdAt = nowText();
      var srcFile = el.fileInput && el.fileInput.files && el.fileInput.files[0];
      var batch = {
        no: no, source: 'file', count: result.parsed,
        added: result.added, overwritten: result.overwritten,
        status: 'processing', operator: 'baksun', createdAt: createdAt
      };
      if (srcFile) batch.file = srcFile;
      state.batches.unshift(batch);
      state.lastBatch = no;
      state.processing = true;
      closeModal();
      renderChanges();
      toast('Import processing…', '导入处理中…', '');
      setTimeout(function () {
        batch.status = 'processed';
        state.processing = false;
        var newRows = genRows(no, result.added, createdAt, { fileOnly: true, noExpired: true });
        state.rows = newRows.concat(state.rows);
        state.selected = [];
        renderChanges();
        renderList();
        toast('Imported ' + fmt(result.parsed) + ' rows (added ' + fmt(result.added) + ' / overwritten ' + fmt(result.overwritten) + ')',
          '已导入 ' + fmt(result.parsed) + ' 条（新增 ' + fmt(result.added) + ' / 覆盖 ' + fmt(result.overwritten) + '）', 'ok');
      }, 900);
    });

    // 单条新增：层级切换 → 只显示对应 ID 输入框
    function syncSingleIdFields() {
      var isUser = el.singleLevel.value === 'user';
      el.singleTcidField.hidden = !isUser;
      el.singleOdidField.hidden = isUser;
      // 业务产品：两级均可选（原型不绑定实现；各产品的账户键由开发映射）
      el.singleProduct.disabled = false;
    }
    el.singleLevel.addEventListener('change', syncSingleIdFields);

    // 单条新增：明细组 → 层级/执行标签级联（选组自动带出并锁定；不指定则解锁）
    el.singleGroup.addEventListener('change', function () {
      var cat = GROUP_CATALOG[el.singleGroup.value];
      if (cat) {
        el.singleLevel.value = cat.level;
        el.singleTag.value = cat.tag;
        el.singleLevel.disabled = true;
        el.singleTag.disabled = true;
        el.singleCascadeHint.hidden = false;
      } else {
        el.singleLevel.disabled = false;
        el.singleTag.disabled = false;
        el.singleCascadeHint.hidden = true;
      }
      syncSingleIdFields();
    });

    // 单条新增：保存
    el.singleConfirm.addEventListener('click', function () {
      var level = el.singleLevel.value;
      var tcid = el.singleTcid.value.trim();
      var odid = el.singleOdid.value.trim();
      function fail(en, zh) {
        el.singleError.hidden = false;
        attr(el.singleError, en, zh);
        if (window.__ugApplyLang) window.__ugApplyLang();
      }
      if (level === 'user' && !tcid) {
        fail('third_customer_id is required', '用户级必须填写 third_customer_id');
        return;
      }
      if (level === 'account' && !odid) {
        fail('overdraft_id is required', '账户级必须填写 overdraft_id');
        return;
      }
      if (level === 'account' && !/^\d{1,18}$/.test(odid)) {
        fail('overdraft_id must be numeric', 'overdraft_id 必须为数字');
        return;
      }
      var idVal = level === 'user' ? tcid : odid;
      var product = 'OD';
      if (level === 'account' && product !== 'OD') {
        fail('overdraft_id is only allowed when product is OD', 'overdraft_id 仅允许在业务产品为 OD 时使用');
        return;
      }
      var dup = findSameLevelDup(product, level, idVal);
      if (dup) {
        fail('This ' + (level === 'user' ? 'third_customer_id' : 'overdraft_id') +
          ' already exists — add does not overwrite; update via file upload, or delete then re-add.',
          '该 ' + (level === 'user' ? 'third_customer_id' : 'overdraft_id') +
          ' 已存在一条记录——新增不会覆盖；如需更新请用上传覆盖，或删除后重新新增。');
        return;
      }
      var sRaw = el.singleStart.value;
      var eRaw = el.singleEnd.value;
      if (!sRaw) { fail('Effective from is required', '请选择生效时间'); return; }
      if (!eRaw) { fail('Effective to is required', '请选择失效时间'); return; }
      var s = parseInputVal(sRaw);
      var e2 = parseInputVal(eRaw);
      if (!s || !e2) { fail('Invalid time format', '时间格式非法'); return; }
      if (s.getTime() < Date.now() - 5 * 60000) {
        fail('Start time must not be earlier than now (opco local time)', '开始时间不得早于当前时间（opco 本地时间）');
        return;
      }
      if (e2.getTime() <= s.getTime()) {
        fail('Effective to must be later than effective from', '失效时间必须晚于生效时间');
        return;
      }
      state.rows.unshift({
        id: idVal, level: level, tag: el.singleTag.value, product: product,
        group: el.singleGroup.value || '',
        start: fmtD(s), end: fmtD(e2),
        stopped: false, source: 'manual', updatedAt: nowText()
      });
      state.page = 1;
      logOp('单条新增', 'Add one', [state.rows[0]]);
      closeModal();
      renderList();
      toast('Record added', '已新增 1 条记录', 'ok');
    });

    // 下载导入模板（CSV）
    if (el.templateLink) {
      el.templateLink.addEventListener('click', function (e) {
        e.preventDefault();
        var header = 'third_customer_id（用户ID）,overdraft_id（账户ID）,tag_level（标签层级）,pool_type（执行标签）,product_code（业务产品）,detail_group（明细组）,effective_start（生效时间）,effective_end（失效时间）,remark（备注）';
        var sample1 = 'F3B2F35A27F065672D506E99E76DF57F6988818498F860B80DDA84B13A985C14,,user,increase_only,OD,Staff组,2026-11-01 09:00:00,2027-11-01 09:00:00,员工入职';
        var sample2 = ',80111462,account,no_adjust,OD,回捞组,2026-11-01 09:00:00,2026-12-31 23:59:59,回捞实验期内锁定';
        var csv = '\ufeff' + [header, sample1, sample2].join('\n') + '\n';
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

  // ── 缓存常用节点 ──────────────────────────────────────
  el.tabs = root.querySelectorAll('[data-sl-tab]');
  el.panels = root.querySelectorAll('[data-sl-panel]');
  el.tbody = root.querySelector('#sl-tbody');
  el.changeTbody = root.querySelector('#sl-change-tbody');
  el.pagerTotal = root.querySelector('#sl-pager-total');
  el.pagerList = root.querySelector('#sl-pager-list');
  el.pagerSize = root.querySelector('#sl-pager-size');
  el.pagerJump = root.querySelector('#sl-pager-jump');
  el.toast = root.querySelector('#sl-toast');
  el.confirmTitle = root.querySelector('#sl-confirm-title');
  el.confirmText = root.querySelector('#sl-confirm-text');
  el.confirmOk = root.querySelector('#sl-confirm-ok');
  el.uploadError = root.querySelector('#sl-upload-error');
  el.uploadDetail = root.querySelector('#sl-upload-detail');
  el.uploadDetailList = root.querySelector('#sl-upload-detail-list');
  el.templateLink = root.querySelector('#sl-template-link');
  el.filePick = root.querySelector('#sl-file-pick');
  el.fileName = root.querySelector('#sl-file-name');
  el.uploadPreview = root.querySelector('#sl-upload-preview');
  el.uploadParsed = root.querySelector('#sl-upload-parsed');
  el.uploadAdded = root.querySelector('#sl-upload-added');
  el.uploadOverwritten = root.querySelector('#sl-upload-overwritten');
  el.uploadFailed = root.querySelector('#sl-upload-failed');
  el.uploadConfirm = root.querySelector('#sl-upload-confirm');
  el.singleLevel = root.querySelector('#sl-single-level');
  el.singleTcidField = root.querySelector('#sl-single-tcid-field');
  el.singleOdidField = root.querySelector('#sl-single-odid-field');
  el.singleTcid = root.querySelector('#sl-single-tcid');
  el.singleOdid = root.querySelector('#sl-single-odid');
  el.singleTag = root.querySelector('#sl-single-tag');
  el.singleGroup = root.querySelector('#sl-single-group');
  el.singleCascadeHint = root.querySelector('#sl-single-cascade-hint');
  el.singleProduct = root.querySelector('#sl-single-product');
  el.singleStart = root.querySelector('#sl-single-start');
  el.singleEnd = root.querySelector('#sl-single-end');
  el.singleRemark = root.querySelector('#sl-single-remark');
  el.singleError = root.querySelector('#sl-single-error');
  el.singleConfirm = root.querySelector('#sl-single-confirm');
  el.fTcid = root.querySelector('#sl-f-tcid');
  el.fOdid = root.querySelector('#sl-f-odid');
  el.fStartFrom = root.querySelector('#sl-f-start-from');
  el.fStartTo = root.querySelector('#sl-f-start-to');
  el.fEndFrom = root.querySelector('#sl-f-end-from');
  el.fEndTo = root.querySelector('#sl-f-end-to');
  el.fGroup = root.querySelector('#sl-f-group');
  el.fLevel = root.querySelector('#sl-f-level');
  el.fTag = root.querySelector('#sl-f-tag');
  el.fProduct = root.querySelector('#sl-f-product');
  el.listTable = root.querySelector('#sl-list-table');
  el.rdTcid = root.querySelector('#sl-rd-tcid');
  el.rdOdid = root.querySelector('#sl-rd-odid');
  el.rdLevel = root.querySelector('#sl-rd-level');
  el.rdTag = root.querySelector('#sl-rd-tag');
  el.rdProduct = root.querySelector('#sl-rd-product');
  el.rdGroup = root.querySelector('#sl-rd-group');
  el.rdStart = root.querySelector('#sl-rd-start');
  el.rdEnd = root.querySelector('#sl-rd-end');
  el.rdEff = root.querySelector('#sl-rd-eff');
  el.rdEnable = root.querySelector('#sl-rd-enable');
  el.rdSource = root.querySelector('#sl-rd-source');
  el.rdUpdated = root.querySelector('#sl-rd-updated');
  el.rdHistory = root.querySelector('#sl-rd-history');
  el.rdNote = root.querySelector('#sl-rd-note');
  el.changeQ = root.querySelector('#sl-change-q');
  el.changeType = root.querySelector('#sl-change-type');
  el.changeStatus = root.querySelector('#sl-change-status');
  el.changeOperator = root.querySelector('#sl-change-operator');
  el.changeFrom = root.querySelector('#sl-change-from');
  el.changeTo = root.querySelector('#sl-change-to');
  el.changeSearch = root.querySelector('#sl-change-search');
  el.changeClear = root.querySelector('#sl-change-clear');
  el.oplogTbody = root.querySelector('#sl-oplog-tbody');
  el.opNo = root.querySelector('#sl-op-no');
  el.opType = root.querySelector('#sl-op-type');
  el.opCount = root.querySelector('#sl-op-count');
  el.opOperator = root.querySelector('#sl-op-operator');
  el.opTime = root.querySelector('#sl-op-time');
  el.opTbody = root.querySelector('#sl-op-tbody');
  el.opNote = root.querySelector('#sl-op-note');
  el.opExport = root.querySelector('#sl-op-export');
  el.fSource = root.querySelector('#sl-f-source');
  el.fEff = root.querySelector('#sl-f-eff');
  el.fEnable = root.querySelector('#sl-f-enable');
  el.bdNo = root.querySelector('#sl-bd-no');
  el.bdSource = root.querySelector('#sl-bd-source');
  el.bdCount = root.querySelector('#sl-bd-count');
  el.bdAdded = root.querySelector('#sl-bd-added');
  el.bdOverwritten = root.querySelector('#sl-bd-overwritten');
  el.bdStatus = root.querySelector('#sl-bd-status');
  el.bdOperator = root.querySelector('#sl-bd-operator');
  el.bdTime = root.querySelector('#sl-bd-time');
  el.bdFailRow = root.querySelector('#sl-bd-fail-row');
  el.bdFail = root.querySelector('#sl-bd-fail');
  el.bdTbody = root.querySelector('#sl-bd-tbody');
  el.bdNote = root.querySelector('#sl-bd-note');
  el.bdDownload = root.querySelector('#sl-bd-download');
  el.bdFailDl = root.querySelector('#sl-bd-faildl');
  el.uploadDl = root.querySelector('#sl-upload-dl');
  el.fileInput = (function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xls,.csv';
    input.style.display = 'none';
    root.appendChild(input);
    return input;
  })();

  bind();
  renderList();
  renderChanges();
  if (window.__ugApplyLang) window.__ugApplyLang();
})();
