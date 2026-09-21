(function () {
  function bindSidebar() {
    var side = document.getElementById("appSidebar");
    var open = document.getElementById("sidebarOpen");
    var close = document.getElementById("sidebarClose");
    var overlay = document.getElementById("sidebarOverlay");
    function show(on) {
      if (!side) return;
      side.classList.toggle("open", on);
      if (overlay) {
        overlay.hidden = !on;
        overlay.classList.toggle("show", on);
        overlay.classList.toggle("open", on);
      }
      document.body.classList.toggle("sidebar-open", on);
    }
    if (open) open.addEventListener("click", function () { show(true); });
    if (close) close.addEventListener("click", function () { show(false); });
    if (overlay) overlay.addEventListener("click", function () { show(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") show(false);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindSidebar);
  else bindSidebar();
})();
