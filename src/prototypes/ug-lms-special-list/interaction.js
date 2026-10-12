(function () {
  // ── 侧边菜单：展开 / 收起 ──
  function bindSubmenus() {
    document.querySelectorAll('.ant-menu-submenu-title').forEach(function (title) {
      if (title.dataset.ugBound === '1') return;
      title.dataset.ugBound = '1';
      title.addEventListener('click', function () {
        var item = title.closest('.ant-menu-submenu');
        if (!item) return;
        var open = item.classList.toggle('ant-menu-submenu-open');
        title.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  }

  // ── 菜单切换页面：授信申请 / 特殊执行名单 ──
  function showPage(page) {
    document.querySelectorAll('[data-ug-page]').forEach(function (el) {
      if (el.getAttribute('data-ug-page') === page) {
        el.removeAttribute('hidden');
      } else {
        el.setAttribute('hidden', 'hidden');
      }
    });
    document.querySelectorAll('[data-ug-nav]').forEach(function (el) {
      el.classList.toggle(
        'ant-menu-item-selected',
        el.getAttribute('data-ug-nav') === page
      );
    });
  }

  function bindNav() {
    document.querySelectorAll('[data-ug-nav]').forEach(function (el) {
      if (el.dataset.ugNavBound === '1') return;
      el.dataset.ugNavBound = '1';
      el.addEventListener('click', function () {
        showPage(el.getAttribute('data-ug-nav'));
      });
    });
    // 默认停在「授信申请」，保证初始状态一致
    if (document.querySelector('[data-ug-nav="credit-application"]')) {
      showPage('credit-application');
    }
  }

  function init() {
    bindSubmenus();
    bindNav();
  }

  window.__ugShowPage = showPage;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
