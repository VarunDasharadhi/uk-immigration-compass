(function () {
  var stored = localStorage.getItem('theme');
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = stored === 'light' || stored === 'dark' ? stored === 'dark' : prefersDark;
  if (dark) document.documentElement.classList.add('dark');
})();
