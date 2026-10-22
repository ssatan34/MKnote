import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Called by the isolated Quick directory runner; all paths belong to its temp sandbox.
export async function verifyQuickWork({ browser, ipc, sharedDir, work, reportDir }) {
  const checks = [];
  const workPath = path.join(sharedDir, 'Quick Todo', `${work.id}.md`);
  const metadata = (projectId, context = false) => ({ v:1, projectId, projectName:'同名项目',
    projectUri:'obsidian://open?vault=Allnote&file=20%20%E5%B7%A5%E4%BD%9C/Fixture/项目主页.md',
    sourceUri:'obsidian://open?vault=Allnote&file=20%20%E5%B7%A5%E4%BD%9C/Fixture/任务.md',
    dates:['截止 2026-10-20'], context });
  const line = (id, text, parentId, projectId, completed = false) =>
    `- [${completed ? 'x' : ' '}] ${text} <!-- quick-todo:id=${id} createdAt=2026-10-13T12:00:00Z${completed ? ' completedAt=2026-10-13T13:00:00Z' : ''}${parentId ? ` parentId=${parentId}` : ''} allnoteWork=${Buffer.from(JSON.stringify(metadata(projectId, completed))).toString('base64url')} -->\n`;
  const imported = [line('allnote_work_parent','已完成父任务',null,'A',true),
    line('allnote_work_child','子任务','allnote_work_parent','A'),
    line('allnote_work_grandchild','孙任务','allnote_work_child','A'),
    line('allnote_work_other','另一个同名项目任务',null,'B')].join('');
  fs.appendFileSync(workPath, '\n' + imported);
  const original = fs.readFileSync(workPath,'utf8');
  for (const [command, args] of [
    ['quick_todo_toggle',{}], ['quick_todo_edit',{text:'forbidden'}], ['quick_todo_delete',{}],
    ['quick_todo_set_tag',{tag:'important'}], ['quick_todo_set_reminder',{remindAt:null}],
    ['quick_todo_set_link',{link:null}],
  ]) await assert.rejects(() => ipc(command,{todoId:work.id,id:'allnote_work_child',...args}), /只读/);
  await assert.rejects(() => ipc('quick_todo_add',{todoId:work.id,text:'forbidden child',parentId:'allnote_work_child',tag:null}),/只读/);
  assert.equal(fs.readFileSync(workPath,'utf8'), original);
  checks.push('imported items reject all mutation commands without changing bytes');
  const manual = (await ipc('quick_todo_add',{todoId:work.id,text:'new manual',parentId:null,tag:null})).find(item=>item.text==='new manual');
  const manualIds = (await ipc('quick_todo_list',{todoId:work.id})).filter(item=>!item.id.startsWith('allnote_work_')).map(item=>item.id).reverse();
  await ipc('quick_todo_reorder',{todoId:work.id,ids:manualIds});
  await ipc('quick_todo_edit',{todoId:work.id,id:manual.id,text:'edited manual'});
  await ipc('quick_todo_toggle',{todoId:work.id,id:manual.id});
  await ipc('quick_todo_clear_completed',{todoId:work.id});
  assert.equal(fs.readFileSync(workPath,'utf8').split('\n').filter(text=>text.includes('allnoteWork=')).join('\n'),imported.trimEnd());
  assert.ok((await ipc('quick_todo_list',{todoId:work.id})).some(item=>item.id==='allnote_work_parent'));
  checks.push('manual edit, reorder and completed cleanup preserve imported task bytes and parent context');
  await ipc('quick_todo_add',{todoId:work.id,text:'UI drag fixture',parentId:null,tag:null});
  await ipc('set_quick_todo_locked',{todoId:work.id,enabled:true});
  await ipc('open_quick_todo_window',{todoId:work.id});
  let workPage;
  const deadline=Date.now()+20000;
  while(Date.now()<deadline&&!workPage) {
    for(const context of browser.contexts()) for(const page of context.pages()) {
      const label=await page.evaluate(()=>window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(()=>null);
      if(label===`quick-todo-${work.id}`) workPage=page;
    }
    if(!workPage) await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(workPage,'Quick Todo native window is available');
  await workPage.locator('.quick-work-task').first().waitFor();
  assert.equal(await workPage.locator('.quick-work-groups details').count(),2);
  assert.equal(await workPage.locator('[data-todo-id="allnote_work_grandchild"]').getAttribute('data-work-depth'),'2');
  assert.equal(await workPage.locator('.quick-work-count').first().textContent(),'2 项');
  for(const box of await workPage.locator('.quick-work-task').getByRole('checkbox').all()) assert.equal(await box.isDisabled(),true);
  assert.equal(await workPage.locator('.quick-todo-row[data-todo-id^="allnote_work_"]').count(),0);
  assert.equal(await workPage.locator('.quick-work-manual-title').textContent(),'手工待办');
  checks.push('native Work UI groups same-name projects separately, shows three levels and disables imported controls');
  await workPage.locator('.quick-todo-list').evaluate(element=>{element.scrollTop=element.scrollHeight;});
  const rows=workPage.locator('.quick-todo-row[data-todo-id]');
  const orderBefore=await rows.evaluateAll(elements=>elements.map(element=>element.dataset.todoId));
  const handles=workPage.locator('.quick-todo-drag-handle');
  const firstHandle=await handles.first().boundingBox();
  const lastHandle=await handles.last().boundingBox();
  assert.ok(firstHandle&&lastHandle);
  await workPage.mouse.move(firstHandle.x+firstHandle.width/2,firstHandle.y+firstHandle.height/2);
  await workPage.mouse.down();
  await workPage.mouse.move(lastHandle.x+lastHandle.width/2,lastHandle.y+lastHandle.height-1,{steps:5});
  assert.deepEqual(await rows.evaluateAll(elements=>elements.map(element=>element.dataset.todoId)),orderBefore);
  await workPage.mouse.up();
  checks.push('manual rows retain their render order while dragging with imported groups present');
  const group=workPage.locator('.quick-work-groups details').first();
  await group.locator('summary > span').first().click();
  await workPage.waitForFunction(()=>!document.querySelector('.quick-work-groups details').open);
  fs.writeFileSync(workPath,fs.readFileSync(workPath,'utf8').replace('子任务 <!--','外部更新任务 <!--'));
  await workPage.waitForFunction(()=>document.querySelector('[data-todo-id="allnote_work_child"] .quick-work-text')?.textContent==='外部更新任务',null,{timeout:10000});
  assert.equal(await group.evaluate(element=>element.open),false);
  await group.locator('summary > span').first().click();
  checks.push('external file edits refresh without IPC events and retain collapsed project state');
  await workPage.evaluate(()=>{
    window.workSourceCalls=[];
    const originalFetch=window.fetch.bind(window);
    // Tauri's invoke property is immutable; intercept only this IPC transport request.
    window.fetch=(input,options)=>{
      if(String(input).includes('ipc.localhost/quick_todo_open_work_source')) {
        window.workSourceCalls.push(JSON.parse(options.body));
        return Promise.resolve(new Response('null',{headers:{'Tauri-Response':'ok','Content-Type':'application/json'}}));
      }
      return originalFetch(input,options);
    };
  });
  await group.locator('summary button').click();
  await workPage.locator('[data-todo-id="allnote_work_child"] .quick-work-source').click();
  await workPage.waitForFunction(()=>window.workSourceCalls.length===2);
  const calls=await workPage.evaluate(()=>window.workSourceCalls);
  assert.deepEqual(calls.map(call=>({todoId:call.todoId,project:call.project})),[{todoId:work.id,project:true},{todoId:work.id,project:false}]);
  assert.deepEqual(calls.map(call=>call.id),['allnote_work_parent','allnote_work_child']);
  const beforeInvalid=fs.readFileSync(workPath,'utf8');
  const unsafe=metadata('unsafe');unsafe.sourceUri='https://example.com';
  fs.appendFileSync(workPath,`- [ ] unsafe <!-- quick-todo:id=allnote_work_unsafe createdAt=2026-10-13T12:00:00Z allnoteWork=${Buffer.from(JSON.stringify(unsafe)).toString('base64url')} -->\n`);
  await assert.rejects(()=>ipc('quick_todo_open_work_source',{todoId:work.id,id:'allnote_work_unsafe',project:false}),/不是 Allnote/);
  fs.writeFileSync(workPath,beforeInvalid);
  checks.push('source/project buttons route correct IDs; backend rejects unsafe URI before launching a handler');
  await workPage.screenshot({path:path.join(reportDir,'quick-work-524.png')});
  return checks;
}
