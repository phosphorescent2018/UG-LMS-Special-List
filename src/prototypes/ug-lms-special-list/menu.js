(function () {
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindSubmenus);
  } else {
    bindSubmenus();
  }
})();
