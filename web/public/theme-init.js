// Runs before the first paint (see index.html), so a reload does not flash the
// wrong theme or tab title while the app loads. It cannot be inline: the
// Content-Security-Policy allows scripts from this origin only.
(function () {
  try {
    var root = document.documentElement;
    // The same key and values as src/lib/theme.ts.
    var theme = localStorage.getItem("hatch-theme") === "light" ? "light" : "dark";
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;

    // The title the app last set for this exact page (see RootLayout), so it is
    // already right on reload instead of changing once the page's code loads.
    var last = JSON.parse(localStorage.getItem("hatch-last-title") || "null");
    if (last && last.path === location.pathname && typeof last.title === "string") {
      document.title = last.title;
    }
  } catch (e) {
    // Storage can be unavailable (private windows); the dark defaults apply.
  }
})();
