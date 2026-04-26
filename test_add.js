const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const dom = new JSDOM(html, { runScripts: "dangerously", resources: "usable" });
const window = dom.window;

setTimeout(() => {
    try {
        console.log("Tasks length:", window.tasks ? window.tasks.length : "tasks missing");
        window.document.getElementById('quick-add-input').value = 'My new task';
        window.handleQuickAdd({ key: 'Enter' });
        console.log("After add:", window.tasks.length);
    } catch(e) {
        console.error("Error:", e.message);
    }
}, 1000);
