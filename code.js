(function () {
  function createDot() {
    const dot = document.createElement("div");

    Object.assign(dot.style, {
      position: "fixed",
      top: "15px",
      right: "15px",
      width: "30px",
      height: "30px",
      backgroundColor: "blue",
      borderRadius: "50%",
      zIndex: "2147483647",
      boxShadow: "0 0 12px rgba(0, 0, 255, 0.8)",
      pointerEvents: "none"
    });

    document.documentElement.appendChild(dot);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createDot);
  } else {
    createDot();
  }
})();
