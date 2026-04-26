const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const scripts = html.match(/<script>([\s\S]*?)<\/script>/gi);
let jsCode = scripts ? scripts[0].replace(/<script>/i, '').replace(/<\/script>/i, '') : "";

console.log("Extracted JS size:", jsCode.length);
