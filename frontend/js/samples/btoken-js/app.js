// Sample with intentional issues for Auto Debugger demo

function init() {
  const el = document.getElementById("missing-element")
  el.innerHTML = userInput;   // XSS risk + missing null check

  console.log(undefinedValue);

  if (true) {
    let x = 1
    // missing closing brace intentionally for L1
  // }

  eval("alert(1)");  // security

  api_key = "sk-live-1234567890abcdef";  // hardcoded secret
}

init( ;
