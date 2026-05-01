/// execute_script.js
const dot = `void(()=>{const b=document.createElement("div");b.style.cssText="position:fixed;top:6px;right:6px;width:8px;height:8px;background:rgba(0,200,100,0.6);z-index:999999;pointer-events:none;border-radius:50%;";const show=()=>document.body.appendChild(b);document.body?show():document.addEventListener("DOMContentLoaded",show);})()`;

const a = document.createElement("a");
a.href = "javascript:" + dot;
a.click();
