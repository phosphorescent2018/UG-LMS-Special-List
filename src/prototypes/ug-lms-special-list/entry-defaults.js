/* 入口默认态（仅 Axhub Make 原型使用；dist 独立还原页不加这一段）
 *
 * 让每次打开原型时默认落在：中文 + 特殊执行名单页。
 * 进入后仍可自由切换语言与页面，只是刷新会回到这个默认入口态。
 */
(function () {
  function applyEntryDefaults() {
    if (window.__ugSetLang) window.__ugSetLang('zh');
    if (window.__ugShowPage) window.__ugShowPage('special-list');
    // 展开「额度管理」，让默认选中的「特殊执行名单」一眼可见
    var item = document.getElementById('menu-special-list');
    var submenu = item && item.closest('.ant-menu-submenu');
    if (submenu) submenu.classList.add('ant-menu-submenu-open');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyEntryDefaults);
  } else {
    applyEntryDefaults();
  }
})();
