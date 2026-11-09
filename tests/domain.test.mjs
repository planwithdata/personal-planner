import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyPlanner, localDate, makeBackup, seedPlanner, shiftDate, taskDraft, toggleTask, validateBackup } from '../src/domain.ts';

test('date-only planning crosses month and year boundaries without UTC shifts',()=>{
  assert.equal(shiftDate('2026-12-31',1),'2027-01-01');
  assert.equal(shiftDate('2024-03-01',-1),'2024-02-29');
  assert.equal(localDate(new Date(2026,10,8,0,5)),'2026-11-08');
});
test('completion preserves planning and reopening clears the completion timestamp',()=>{
  const task={...taskDraft('2026-11-08'),title:'Next action',dueDate:'2026-11-10'};
  const done=toggleTask(task);
  assert.equal(done.status,'done');assert.ok(done.completedAt);assert.equal(done.plannedDate,task.plannedDate);assert.equal(done.dueDate,task.dueDate);
  const reopened=toggleTask(done);assert.equal(reopened.status,'open');assert.equal(reopened.completedAt,null);
});
test('JSON backup round trip preserves relationships and history',()=>{
  const data=seedPlanner();data.activity.push({id:crypto.randomUUID(),entityId:data.tasks[0].id,action:'task.created',at:new Date().toISOString()});
  const restored=validateBackup(JSON.parse(JSON.stringify(makeBackup(data))));
  assert.deepEqual(restored,data);assert.ok(restored.projects.some(p=>p.id===restored.tasks[0].projectId));
});
test('backup restore accepts an empty real workspace',()=>assert.deepEqual(validateBackup(makeBackup(emptyPlanner())),emptyPlanner()));
test('backup restore rejects wrong schema, duplicate IDs, and missing references',()=>{
  const data=seedPlanner();
  assert.throws(()=>validateBackup({...data,schemaVersion:3}),/supported/);
  assert.throws(()=>validateBackup({...data,tasks:[...data.tasks,data.tasks[0]]}),/duplicate/);
  assert.throws(()=>validateBackup({...data,projects:[]}),/reference/);
});
test('backup restore rejects impossible dates and inconsistent completion data',()=>{
  const data=seedPlanner();
  for(const patch of [{plannedDate:'2026-02-30'},{plannedDate:undefined},{dueDate:'bad'},{status:'done',completedAt:null},{estimate:-1},{estimate:Infinity},{estimate:1.5},{focus:'yes'}]) {
    assert.throws(()=>validateBackup({...data,tasks:[{...data.tasks[0],...patch}]}),/Invalid task/);
  }
});
test('backup restore rejects malformed records and dangling idea links',()=>{
  const data=seedPlanner();
  assert.throws(()=>validateBackup({...data,tasks:[null]}),/missing or duplicate/);
  assert.throws(()=>validateBackup({...data,ideas:[],tasks:[{...data.tasks[0],ideaId:'missing'}]}),/reference/);
  assert.throws(()=>validateBackup({...data,activity:[{id:'x',at:'bad',entityId:'a',action:'done'}]}),/history/);
});
