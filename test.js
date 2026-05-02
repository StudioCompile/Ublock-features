(function () {
  function createDot() {
    const dot = document.createElement("div");

    Object.assign(dot.style, {
      position: "fixed",
      top: "10px",
      right: "10px",
      width: "12px",
      height: "12px",
      backgroundColor: "red",
      borderRadius: "50%",
      zIndex: "2147483647", // super high to stay on top
      pointerEvents: "none" // prevents blocking clicks
    });

    document.body.appendChild(dot);
  }

  // Make sure DOM is ready
  if (document.body) {
    createDot();
  } else {
    window.addEventListener("DOMContentLoaded", createDot);
  }
})();
