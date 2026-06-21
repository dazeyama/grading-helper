// ---------------------------------------------------------------------------
// grading-helper — client-side app logic
// ---------------------------------------------------------------------------

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    const status = document.getElementById("status");
    if (status) {
      status.textContent = "Ready.";
    }
  });
})();
