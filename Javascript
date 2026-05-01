(function () {
    const dot = document.createElement("div");
    
    Object.assign(dot.style, {
        position: "fixed",
        top: "10px",
        right: "10px",
        width: "10px",
        height: "10px",
        backgroundColor: "red",
        opacity: "0.5",
        borderRadius: "50%",
        zIndex: "9999",
        pointerEvents: "none"
    });

    document.body.appendChild(dot);
})();
