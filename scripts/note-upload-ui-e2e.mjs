import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
// Build first with .codex-smoke/note-upload-config.json (isolated identifier and productName).
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.MKN_PLAYWRIGHT_MODULE ?? "playwright");
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mknote-upload-ui-'));
const app = path.join(root, 'App');
for (const dir of [app, path.join(app,'File/default'), path.join(root,'Notes'), path.join(root,'Attachments')]) fs.mkdirSync(dir,{recursive:true});
fs.copyFileSync(process.env.MKN_UPLOAD_UI_BASELINE_EXE ?? 'src-tauri/target/debug/md-sticky-note.exe',path.join(app,'md-sticky-note.exe'));
fs.writeFileSync(path.join(app,'File/default/Test.md'),'# Test\n');
let requested;
const requestStarted = new Promise(resolve => requested = resolve);
let responded;
const firstResponse = new Promise(resolve => responded = resolve);
let requests = 0;
const server = http.createServer((req,res) => { requests++; requested(); setTimeout(() => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({code:0,msg:'',data:{notebooks:[]}})); responded(); },1500); });
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
fs.writeFileSync(path.join(app,'config.json'),JSON.stringify({last_note:'Test.md',last_note_zone:'default',autostart:false,sync_enabled:false,clip_server_enabled:false,always_on_top:false,note_upload_target:'none',siyuan_api_url:`http://127.0.0.1:${server.address().port}`,siyuan_api_token:'fixture',siyuan_notebook_id:'fixture',obsidian_note_dir:path.join(root,'Notes'),obsidian_attachment_dir:path.join(root,'Attachments'),open_tabs:[{zone:'default',name:'Test.md'}],global_hotkeys:{toggle_window:'',focus_window:'',quick_capture:'',clipboard_inbox:'',quick_search:''}}));
const port=9317;
const child=spawn(path.join(app,'md-sticky-note.exe'),[],{cwd:app,windowsHide:true,stdio:'ignore',env:{...process.env,NO_PROXY:'127.0.0.1,localhost',WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port}`}});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/json/list`)).ok) break;}catch{} await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page=browser.contexts()[0].pages()[0];
  await page.locator('[data-testid="mknote-editor-pane"]').waitFor();
  console.log('Editor ready');
  await page.getByRole('button',{name:'设置',exact:true}).click();
  console.log('Settings ready');
  const opening = page.getByRole('button',{name:'笔记上传',exact:true}).click();
  await opening;
  console.log('Upload settings ready');
  await Promise.race([requestStarted,new Promise((_,reject)=>setTimeout(()=>reject(new Error('No request from SiYuan panel')),10000))]).catch(async error=>{console.log(await page.locator('.siyuan-settings-msg').allTextContents()); throw error;});
  await firstResponse;
  const pendingRequest = new Promise(resolve => requested = resolve);
  const testing = page.locator('.siyuan-settings-test-btn').click();
  await pendingRequest;
  const start=performance.now();
  await Promise.all([
    page.getByRole('tab',{name:'Obsidian',exact:true}).click(),
    page.evaluate(() => window.__TAURI_INTERNALS__.invoke('get_config').then(() => true)),
  ]);
  await page.getByLabel('笔记目标文件夹',{exact:true}).waitFor({state:'visible'});
  const elapsed=performance.now()-start;
  await opening;
  await testing;
  console.log(JSON.stringify({switchDuringSlowConnectionMs:Math.round(elapsed),requests,root}));
  if(!process.env.MKN_UPLOAD_UI_BASELINE_EXE) {
    assert.ok(elapsed<700,`Switch stalled ${elapsed}ms`);
    await page.getByLabel('笔记目标文件夹',{exact:true}).fill(path.join(root,'Notes')+'-draft');
    await page.getByRole('tab',{name:'思源笔记',exact:true}).click();
    await page.getByRole('tab',{name:'Obsidian',exact:true}).click();
    assert.equal(await page.getByLabel('笔记目标文件夹',{exact:true}).inputValue(),path.join(root,'Notes')+'-draft');
    await page.getByLabel('笔记目标文件夹',{exact:true}).fill(path.join(root,'Notes'));
    await page.getByRole('switch',{name:'启用Obsidian上传',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('[role=switch][aria-label="启用Obsidian上传"]')?.getAttribute('aria-checked')==='true');
    await page.screenshot({path:'.codex-smoke/note-upload-ui-obsidian.png'});
    await page.getByRole('tab',{name:'思源笔记',exact:true}).click();
    await page.screenshot({path:'.codex-smoke/note-upload-ui-siyuan.png'});
    await page.keyboard.press('Escape');
    const upload=page.locator('.statusbar-btn--siyuan');
    await upload.click();
    await page.waitForFunction(()=>document.querySelector('.statusbar-btn--siyuan')?.classList.contains('upload-success'));
    assert.ok(fs.existsSync(path.join(root,'Notes/Test.md')));
    assert.equal(await page.locator('.note-upload-result').count(),0);
    const successStart=performance.now();
    await page.waitForFunction(()=>!document.querySelector('.statusbar-btn--siyuan')?.classList.contains('upload-success'));
    const highlightMs=performance.now()-successStart;
    assert.ok(highlightMs>1700&&highlightMs<2500,`Highlight duration ${highlightMs}`);
    console.log(JSON.stringify({pass:true,highlightMs:Math.round(highlightMs),requests}));
  }
} finally {await browser?.close();child.kill(); server.close();}
