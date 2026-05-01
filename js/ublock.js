/// execute_script.js
const code = `void(()=>{const b=document.createElement("div");b.style.cssText="position:fixed;top:6px;right:6px;width:8px;height:8px;background:rgba(0,200,100,0.6);z-index:999999;pointer-events:none;border-radius:50%;";(document.body?Promise.resolve():new Promise(r=>document.addEventListener("DOMContentLoaded",r))).then(()=>document.body.appendChild(b));})()`;

location.href = "javascript:" + code;
