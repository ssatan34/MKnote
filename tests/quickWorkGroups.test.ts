import test from 'node:test';
import assert from 'node:assert/strict';
import { quickWorkGroups } from '../src/utils/quickWorkGroups.ts';
import { pendingCount, type QuickTodoItem } from '../src/utils/quickTodoModel.ts';
const item = (id: string, parentId: string | null = null, extra: Partial<QuickTodoItem> = {}): QuickTodoItem => ({ id, parentId, text: id, completed: false, createdAt: '2026-10-13T12:00:00Z', completedAt: null, tag: null, remindAt: null,
  allnoteWork: { v: 1, projectId: 'A', projectName: '项目', projectUri: '', sourceUri: '', dates: [], context: false }, ...extra });
test('project rows retain three real levels and context does not inflate pending count', () => {
  const groups = quickWorkGroups([item('allnote_work_p', null, { completed: true, allnoteWork: { ...item('unused').allnoteWork!, context: true } }), item('allnote_work_c', 'allnote_work_p'), item('allnote_work_g', 'allnote_work_c'), item('manual')]);
  assert.equal(groups.length, 1); assert.equal(groups[0]!.pending, 2);
  assert.deepEqual(groups[0]!.rows.map(row => row.depth), [0, 1, 2]);
});
test('same display name remains separate projects; malformed parent cycles terminate', () => {
  const a = item('allnote_work_a', 'allnote_work_b'); const b = item('allnote_work_b', 'allnote_work_a');
  const other = item('allnote_work_other', null, { allnoteWork: { ...a.allnoteWork!, projectId: 'B' } });
  const groups = quickWorkGroups([a, b, other]);
  assert.equal(groups.length, 2); assert.equal(groups[0]!.rows.length, 2);
});

test('legacy imported tasks remain grouped and manual tasks retain their pending count', () => {
  const items = [item('allnote_work_legacy', null, { allnoteWork: null }),
    item('manual', null, { allnoteWork: null }),
    item('allnote_work_context', null, { completed: true, allnoteWork: { ...item('unused').allnoteWork!, context: true } })];
  const groups = quickWorkGroups(items);
  assert.equal(groups[0]!.name, 'Allnote 同步任务');
  assert.equal(groups[0]!.pending, 1);
  assert.equal(pendingCount(items), 2);
  assert.ok(groups.every(group => group.items.every(task => task.id !== 'manual')));
});
