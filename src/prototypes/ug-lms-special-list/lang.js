(function () {
  var STORAGE_KEY = 'ug-lms-lang';

  function apply(lang) {
    var isZh = lang === 'zh';
    document.querySelectorAll('[data-zh]').forEach(function (el) {
      var next = isZh ? el.getAttribute('data-zh') : el.getAttribute('data-en');
      if (next !== null) el.textContent = next;
    });
    document.querySelectorAll('[data-zh-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', isZh
        ? el.getAttribute('data-zh-placeholder')
        : el.getAttribute('data-en-placeholder'));
    });
    document.documentElement.setAttribute('data-lang', lang);
    var label = document.querySelector('.ug-lang-label');
    if (label) label.textContent = isZh ? '中文' : 'English';
    document.querySelectorAll('.ug-lang-menu li').forEach(function (li) {
      li.setAttribute('aria-selected', String(li.getAttribute('data-lang') === lang));
    });
  }

  function currentLang() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'zh' ? 'zh' : 'en';
    } catch (e) {
      return 'en';
    }
  }

  function setLang(lang) {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) { /* ignore */ }
    apply(lang);
  }

  function init() {
    var root = document.querySelector('.ug-lang');
    if (root && root.dataset.ugLangBound !== '1') {
      root.dataset.ugLangBound = '1';
      var button = root.querySelector('.ug-lang-btn');
      var menu = root.querySelector('.ug-lang-menu');
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        menu.hidden = !menu.hidden;
        root.classList.toggle('ug-lang-open', !menu.hidden);
      });
      menu.addEventListener('click', function (event) {
        var li = event.target.closest('li[data-lang]');
        if (!li) return;
        setLang(li.getAttribute('data-lang'));
        menu.hidden = true;
        root.classList.remove('ug-lang-open');
      });
      document.addEventListener('click', function () {
        menu.hidden = true;
        root.classList.remove('ug-lang-open');
      });
    }
    apply(currentLang());
  }

  window.__ugSetLang = setLang;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
