import React, { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  changeTaskCompletion, emptyPlanner, hasFocusRoom, localDate, makeBackup, moveTask, noteActivity, now,
  taskDraft, uid, validateBackup, workStateLabels, type Activity, type Idea, type Planner, type Project,
  type Review, type Task, type TimeBlock, type View, type WorkState
} from './domain';
import { loadPlanner, savePlanner } from './storage';
import { Calendar, newTimeBlock, TimeBlockDialog } from './Calendar';
import { Reviews } from './Reviews';
import { Settings } from './Settings';
import { TaskDialog } from './TaskDialog';
import { dailyLoad, occursOn } from './schedule';
import { downloadText, duration, Modal, prettyDate } from './ui';
import { useGoogleCalendar } from './useGoogleCalendar';
import { useReleaseStatus } from './useReleaseStatus';
import './styles.css';
import './planning.css';

const nav: { id: View; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: 'sun' }, { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'projects', label: 'Projects', icon: 'grid' }, { id: 'ideas', label: 'Ideas & notes', icon: 'bulb' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' }, { id: 'reviews', label: 'Reviews', icon: 'book' }
];
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
    inbox: <><path d="M4 4h16l2 10v6H2v-6L4 4Z"/><path d="M2 14h6l2 3h4l2-3h6"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
    bulb: <><path d="M9 18h6m-5 3h4M8 14a6 6 0 1 1 8 0c-1 .8-1 2-1 2H9s0-1.2-1-2Z"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h1m6 0h1m-8 3h1"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>, chevron: <path d="m9 5 7 7-7 7"/>, check: <path d="m5 12 4 4L19 6"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>, more: <><circle cx="5" cy="12" r=".8"/><circle cx="12" cy="12" r=".8"/><circle cx="19" cy="12" r=".8"/></>,
    settings: <><path d="m9 3-1 3-3 1-2 3 2 2-1 3 2 3 3-1 3 2 3-2 3 1 2-3-1-3 2-2-2-3-3-1-1-3Z"/><circle cx="12" cy="11" r="3"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>, download: <><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/></>,
    leaf: <><path d="M20 3C7 2 2 8 5 15s15 5 15-12Z"/><path d="M4 21 15 9"/></>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>,
    book: <><path d="M12 5v16M3 3c4-1 7 0 9 2 2-2 5-3 9-2v16c-4-1-7 0-9 2-2-2-5-3-9-2V3Z"/></>,
    trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>,
    cloud: <><path d="M7 18H6a4 4 0 0 1-1-7 7 7 0 0 1 14-1 4 4 0 0 1-1 8h-1"/><path d="m9 17 3-3 3 3m-3-3v7"/></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.book}</svg>;
}
function App() {
  const [data,setData] = useState<Planner | null>(null), [loadError,setLoadError] = useState('');
  const [storage, setStorage] = useState('Loading your workspace…');
  const [saveError, setSaveError] = useState('');
  const [view,setView] = useState<View>('today'), [query,setQuery] = useState(''), [today,setToday] = useState(localDate());
  const [taskEdit, setTaskEditState] = useState<Task | null>(null);
  const [taskError, setTaskError] = useState('');
  const [projectEdit, setProjectEdit] = useState<Project | null>(null);
  const [blockEdit, setBlockEdit] = useState<TimeBlock | null>(null);
  const google = useGoogleCalendar();
  const release = useReleaseStatus();
  const [projectId,setProjectId] = useState<string | null>(null), [ideaId,setIdeaId] = useState<string | null>(null);
  const [toast,setToast] = useState(''), [confirmClear,setConfirmClear] = useState(false), [restore,setRestore] = useState<Planner | null>(null);
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');
  const [calendarDate, setCalendarDate] = useState(localDate());
  const [inboxView, setInboxView] = useState<'inbox' | 'someday' | 'stalled'>('inbox');
  useEffect(()=>{ let active = true; loadPlanner().then(value=>{if(active) setData(value);}).catch(error=>{if(active) setLoadError(String(error));}); const timer = setInterval(()=>setToday(localDate()),30000); return ()=>{active=false;clearInterval(timer);}; },[]);
  useEffect(() => {
    if (!data) return;
    let active = true;
    setStorage('Saving…');
    savePlanner(data).then(() => {
      if (active) { setStorage('Saved on this device'); setSaveError(''); }
    }).catch((error: unknown) => {
      if (!active) return;
      setStorage('Unsaved changes');
      setSaveError(error instanceof Error ? error.message : 'The browser could not save your changes. Export a backup before closing.');
    });
    return () => { active = false; };
  }, [data]);
  useEffect(()=>{ if(!toast) return; const timer=setTimeout(()=>setToast(''),4500);return ()=>clearTimeout(timer); },[toast]);
  function change(recipe: (current: Planner) => Planner, entityId?: string, action?: string,
    metadata?: Partial<Omit<Activity, 'id' | 'entityId' | 'action' | 'at'>>) {
    setData(current => {
      if (!current) return current;
      const next = recipe(current);
      return action ? noteActivity(next, entityId ?? 'workspace', action, metadata) : next;
    });
  }
  function go(next: View) {
    setView(next);
    setQuery('');
    setProjectId(null);
    setFilter('open');
    window.scrollTo(0, 0);
  }
  function setTaskEdit(task: Task | null) {
    setTaskError('');
    setTaskEditState(task);
  }
  function newTask(date = view === 'today' ? today : '', linkedProject: string | null = projectId) {
    setTaskEdit({ ...taskDraft(date), projectId: linkedProject, workState: view === 'inbox' && inboxView === 'someday' ? 'someday' : 'ready' });
  }
  function saveTask(task: Task) {
    if (!data) return;
    if (task.focus && task.status === 'open' && !hasFocusRoom(data.tasks, task)) {
      setTaskError('You already have three priorities for that day. Unpin one first.');
      return;
    }
    const existing = data.tasks.find(item => item.id === task.id);
    const updated = { ...task, title: task.title.trim(), updatedAt: now() };
    const moved = existing && existing.plannedDate !== updated.plannedDate;
    change(current => ({ ...current, tasks: existing
      ? current.tasks.map(item => item.id === task.id ? updated : item)
      : [...current.tasks, updated] }), task.id,
      !existing ? 'task.created' : moved ? 'task.rescheduled' : 'task.updated',
      { projectId: task.projectId, plannedDateBefore: existing?.plannedDate, plannedDateAfter: task.plannedDate });
    setTaskEdit(null);
    setToast(existing ? 'Task updated' : 'Task added');
  }
  function complete(task: Task) {
    change(current => changeTaskCompletion(current, task.id));
  }
  function pin(task: Task) {
    if (!data || task.workState !== 'ready') return;
    const next = { ...task, focus: !task.focus, plannedDate: task.plannedDate || today, updatedAt: now() };
    if (next.focus && !hasFocusRoom(data.tasks, next)) {
      setToast('Keep your focus to three priorities. Unpin one first.');
      return;
    }
    change(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? next : item) }),
      task.id, 'task.focus_changed', { projectId: task.projectId, plannedDateBefore: task.plannedDate, plannedDateAfter: next.plannedDate });
  }
  function trashTask(task: Task) {
    const at = now();
    change(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id
      ? { ...item, trashedAt: at, updatedAt: at } : item) }), task.id, 'task.trashed', { projectId: task.projectId });
    setTaskEdit(null);
    setToast('Moved to trash. Restore it from Settings.');
  }
  function restoreTask(task: Task) {
    change(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id
      ? { ...item, trashedAt: null, updatedAt: now(), focus: item.focus && hasFocusRoom(current.tasks, item) }
      : item) }), task.id, 'task.restored', { projectId: task.projectId });
    setToast('Task restored.');
  }
  function planTask(task: Task, date: string, state?: WorkState) {
    change(current => moveTask(current, task.id, date, state));
  }
  function startBlock(date: string, task?: Task) {
    setTaskEdit(null);
    setCalendarDate(date);
    go('calendar');
    setBlockEdit(newTimeBlock(date, task));
  }
  function saveBlock(block: TimeBlock) {
    const existing = data?.blocks.find(item => item.id === block.id);
    change(current => ({ ...current, blocks: existing
      ? current.blocks.map(item => item.id === block.id ? { ...block, google: item.google } : item)
      : [...current.blocks, block] }), block.id, existing ? 'block.updated' : 'block.created',
      { projectId: data?.tasks.find(task => task.id === block.taskId)?.projectId ?? null });
    setCalendarDate(localDate(new Date(block.start)));
    setBlockEdit(null);
    setToast(existing ? 'Time block updated.' : 'Time block saved.');
  }
  function setBlockTrash(block: TimeBlock, trashed: boolean) {
    const at = now();
    change(current => ({ ...current, blocks: current.blocks.map(item => item.id === block.id
      ? { ...item, trashedAt: trashed ? at : null } : item) }), block.id, trashed ? 'block.trashed' : 'block.restored',
      { projectId: data?.tasks.find(task => task.id === block.taskId)?.projectId ?? null });
    setBlockEdit(null);
    setToast(trashed ? 'Moved to trash. Restore it from Calendar.' : 'Time block restored.');
  }
  async function syncBlock(block: TimeBlock, remove: boolean) {
    const link = await google.sync(block, remove);
    if (link === undefined) return;
    change(current => ({ ...current, blocks: current.blocks.map(item => item.id === block.id
      ? { ...item, google: link } : item) }), block.id, remove ? 'block.unpublished' : 'block.published',
      { projectId: data?.tasks.find(task => task.id === block.taskId)?.projectId ?? null });
    setToast(remove ? 'Google copy removed.' : 'Time block published to Google Calendar.');
  }
  function saveReview(review: Review) {
    change(current => ({
      ...current, reviews: [...current.reviews.filter(item => item.kind !== review.kind || item.periodStart !== review.periodStart), review]
    }), review.id, 'review.saved');
    setToast('Review saved.');
  }
  function addProject() {const at=now();setProjectEdit({id:uid(),name:'',outcome:'',color:'sage',status:'active',createdAt:at,updatedAt:at});}
  function saveProject(project: Project) { const exists=data?.projects.some(p=>p.id===project.id);change(d=>({...d,projects:exists?d.projects.map(p=>p.id===project.id?{...project,updatedAt:now()}:p):[...d.projects,project]}),project.id,exists?'project.updated':'project.created');setProjectEdit(null);setProjectId(project.id);setView('projects'); }
  function addIdea() {const at=now(),id=uid();change(d=>({...d,ideas:[{id,title:'Untitled idea',context:'',options:'',decision:'',nextSteps:'',projectId:null,createdAt:at,updatedAt:at},...d.ideas]}),id,'idea.created');setIdeaId(id);setView('ideas');setQuery('');}
  function updateIdea(id: string, field: keyof Idea, value: string | null) { change(d=>({...d,ideas:d.ideas.map(i=>i.id===id?{...i,[field]:value,updatedAt:now()}:i)})); }
  function exportBackup() {
    if (!data) return;
    const backupAt = now();
    const snapshot = { ...data, lastBackupAt: backupAt };
    downloadText(`daylight-backup-${today}.json`, JSON.stringify(makeBackup(snapshot), null, 2), 'application/json');
    change(current => ({ ...current, lastBackupAt: backupAt }));
    setToast('Backup download requested.');
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('Choose a backup smaller than 25 MB.');
      setRestore(validateBackup(JSON.parse(await file.text())));
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not read this backup.'); }
  }
  if(loadError)return <div className="loading"><Icon name="leaf" size={36}/><h1>Your saved workspace could not be opened.</h1><p>We haven’t replaced any data. Try closing other Daylight tabs, then reload.</p><pre>{loadError}</pre><button className="primary" onClick={()=>location.reload()}>Try again</button></div>;
  if(!data)return <div className="loading"><Icon name="sun" size={40}/><h1>A little clarity is on its way.</h1><p>Opening your planner…</p></div>;
  const project = data.projects.find(p=>p.id===projectId);
  const selectedIdea = data.ideas.find(i=>i.id===ideaId) ?? data.ideas[0];
  const activeTasks = data.tasks.filter(task => !task.trashedAt);
  const openToday = activeTasks.filter(task => task.status === 'open' && task.workState === 'ready' && task.plannedDate === today);
  const completedToday = activeTasks.filter(task => task.completedAt && localDate(new Date(task.completedAt)) === today);
  const inbox = activeTasks.filter(task => task.status === 'open' && task.workState === 'ready' && !task.plannedDate && !task.projectId);
  const someday = activeTasks.filter(task => task.status === 'open' && task.workState === 'someday');
  const stalled = activeTasks.filter(task => task.status === 'open' && (task.workState === 'waiting' || task.workState === 'blocked'));
  const overdue = activeTasks.filter(task => task.status === 'open' && task.workState !== 'someday' &&
    ((task.dueDate && task.dueDate < today) || (task.plannedDate && task.plannedDate < today)));
  const loadToday = dailyLoad(data, today);
  const todayBlocks = data.blocks.filter(block => !block.trashedAt && occursOn(block, today));
  const focusTasks = openToday.filter(task => task.focus);
  const backupDue = !data.isDemo && activeTasks.length > 0 &&
    (!data.lastBackupAt || Date.now() - Date.parse(data.lastBackupAt) >= 7 * 86_400_000);
  const matching=(value:string)=>value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const searchTasks=activeTasks.filter(t=>matching(`${t.title} ${t.notes} ${data.projects.find(p=>p.id===t.projectId)?.name ?? ''}`));
  const searchedProjects=data.projects.filter(p=>matching(`${p.name} ${p.outcome}`)), searchedIdeas=data.ideas.filter(i=>matching(`${i.title} ${i.context} ${i.options} ${i.decision} ${i.nextSteps}`));
  function TaskRow({task}: {task:Task}) {
    const p=data!.projects.find(p=>p.id===task.projectId);
    return <div className={`task-row ${task.status==='done'?'completed':''}`}>
      <button className={`checkbox ${task.status==='done'?'checked':''}`} aria-label={`${task.status==='done'?'Reopen':'Complete'} ${task.title}`} onClick={()=>complete(task)}>{task.status==='done'&&<Icon name="check" size={14}/>}</button>
      <button className="task-main" onClick={()=>setTaskEdit(task)}><span className="task-title">{task.title}</span><span className="task-meta">{p&&<span><i className={`dot ${p.color}`}/>{p.name}</span>}{task.estimate>0&&<span><Icon name="clock" size={12}/>{duration(task.estimate)}</span>}{task.dueDate&&<span className={task.dueDate<today&&task.status==='open'?'overdue-text':''}>Due {prettyDate(task.dueDate)}</span>}{task.plannedDate&&view!=='today'&&<span>Planned {prettyDate(task.plannedDate)}</span>}{task.workState!=='ready'&&<span>{workStateLabels[task.workState]}</span>}{task.repeat&&<span className="capitalize">{task.repeat.cadence}</span>}{task.subtasks.length>0&&<span>{task.subtasks.filter(item=>item.done).length}/{task.subtasks.length} subtasks</span>}</span></button>
      <span className={`priority-dot ${task.priority}`} title={`${task.priority} priority`}/>
      {task.status!=='done'&&task.workState==='ready'&&<button className={`icon-button pin ${task.focus?'pinned':''}`} aria-label={`${task.focus?'Unpin':'Pin'} priority: ${task.title}`} onClick={()=>pin(task)}><Icon name="star" size={17}/></button>}
    </div>;
  }
  function TaskList({tasks,empty='A little breathing room. Add a task when you’re ready.'}: {tasks:Task[];empty?:string}) { return tasks.length?<div className="task-list">{tasks.map(t=><TaskRow task={t} key={t.id}/>)}</div>:<div className="empty"><Icon name="leaf" size={26}/><p>{empty}</p></div>; }
  function ProjectCard({p}: {p:Project}) {const all=activeTasks.filter(t=>t.projectId===p.id),done=all.filter(t=>t.status==='done').length;return <button className="project-card" onClick={()=>{setQuery('');setProjectId(p.id);setView('projects');}}><span className={`project-symbol ${p.color}`}><Icon name="grid" size={20}/></span><span className="project-card-title">{p.name}</span><span className="project-description">{p.outcome || 'Give this project a meaningful outcome.'}</span><span className="progress-track"><span style={{width:all.length?`${done/all.length*100}%`:'0%'}}/></span><span className="project-card-footer"><span>{done} of {all.length} tasks</span><span className="capitalize">{p.status}<Icon name="arrow" size={14}/></span></span></button>;}
  const heading = view==='today'?'Make room for what matters.':view==='inbox'?'A place for everything.':view==='projects'?(project?.name??'Small steps. Meaningful progress.'):view==='ideas'?'Let your thoughts take shape.':view==='calendar'?'See the space in your day.':view==='reviews'?'Review and plan what’s next.':'Make yourself at home.';
  return <div className="app-shell">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar"><a className="brand" href="#" onClick={e=>{e.preventDefault();go('today');}}><span className="brand-icon"><Icon name="sun" size={26}/></span>daylight<span className="brand-period">.</span></a><div className="sidebar-caption">A LITTLE SPACE TO THINK</div>
      <button className="capture-button" onClick={()=>newTask()}><Icon name="plus" size={17}/>Capture a task<span className="keyboard-hint">＋</span></button>
      <nav aria-label="Main navigation">{nav.map(item=><button key={item.id} aria-current={view===item.id&&!query?'page':undefined} onClick={()=>go(item.id)} className={`nav-item ${view===item.id&&!query?'active':''}`}><Icon name={item.icon}/><span>{item.label}</span>{item.id==='inbox'&&inbox.length>0&&<span className="nav-count">{inbox.length}</span>}</button>)}</nav>
      <div className="sidebar-projects"><div className="section-label">YOUR PROJECTS<button className="icon-button" onClick={addProject} aria-label="Add project"><Icon name="plus" size={15}/></button></div>{data.projects.filter(p=>p.status==='active').slice(0,5).map(p=><button key={p.id} className="sidebar-project" onClick={()=>{go('projects');setProjectId(p.id);}}><i className={`dot ${p.color}`}/><span>{p.name}</span></button>)}{!data.projects.length&&<p className="muted small">Your next chapter starts here.</p>}</div>
      <div className="sidebar-bottom"><div className="quiet-note"><Icon name="leaf" size={19}/><p>A little intention.<br/>A little more possibility.</p></div><button className={`nav-item ${view==='settings'?'active':''}`} onClick={()=>go('settings')}><Icon name="settings"/><span>Settings & backup</span></button><div className="profile"><span className="avatar">R</span><div><strong>Your personal space</strong><span>One day at a time</span></div><span className="local-dot" title="Stored locally"/></div></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">My workspace<span>/</span><strong>{query?'Search':nav.find(n=>n.id===view)?.label ?? 'Settings'}</strong></div><label className="search"><Icon name="search" size={17}/><input aria-label="Search your workspace" placeholder="Find something…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="Clear search" className="icon-button" onClick={()=>setQuery('')}><Icon name="close" size={14}/></button>}</label><button className="top-add icon-button" aria-label="Add task" onClick={()=>newTask()}><Icon name="plus"/></button></header>
      <main id="main-content"><div className="page-heading"><div><div className="eyebrow">{view==='today'?prettyDate(today,{weekday:'long',day:'numeric',month:'long'}):query?'YOUR WORKSPACE':view==='settings'?'YOUR SPACE, YOUR WAY':`YOUR ${view==='ideas'?'THINKING SPACE':view.toUpperCase()}`}</div><h1>{query?'Find a little clarity.':heading}</h1><p>{query?`Results for “${query}”`:view==='today'?'A fresh page. A few clear priorities. You’ve got this.':view==='inbox'?'Get it out of your head. Decide where it belongs when you’re ready.':view==='projects'?(project?.outcome??'Keep the bigger picture close, and the next step clear.'):view==='ideas'?'Capture the messy beginning. Find a direction when you’re ready.':view==='calendar'?'Give your plans a day, and your day some breathing room.':view==='reviews'?'Decide what to carry forward and export a record of your progress.':'Manage backups, daily capacity, and device storage.'}</p></div>{!query&&view!=='reviews'&&view!=='settings'&&<button className="primary heading-action" onClick={()=>view==='projects'&&!project?addProject():view==='ideas'?addIdea():view==='calendar'?startBlock(calendarDate):newTask()}><Icon name="plus" size={17}/>{view==='projects'&&!project?'New project':view==='ideas'?'New idea':view==='calendar'?'Add time block':'Add task'}</button>}</div>
      {data.isDemo&&<div className="demo-notice"><span><span className="tiny-tag">A STARTING POINT</span> You’re exploring a sample workspace. Make it yours whenever you’re ready.</span><button onClick={()=>setConfirmClear(true)}>Start fresh <Icon name="arrow" size={14}/></button></div>}
      {saveError && <div className="error-banner" role="alert">{saveError}<button onClick={exportBackup}>Export now</button></div>}
      {release.offline && <div className="notice" role="status">Offline · Local planning and backups are available.</div>}
      {release.updateReady && <div className="notice" role="status">
        <span>A Daylight update is ready. Save open edits before applying it.</span>
        <button className="text-button" onClick={release.applyUpdate} disabled={storage !== 'Saved on this device' || Boolean(taskEdit || projectEdit || blockEdit || google.busy)}>Apply update</button>
      </div>}
      {query?<div className="search-results"><section className="card"><div className="card-heading"><h2>Tasks <span className="count">{searchTasks.length}</span></h2></div><TaskList tasks={searchTasks} empty="No matching tasks."/></section><section><h2>Projects <span className="count">{searchedProjects.length}</span></h2><div className="project-grid">{searchedProjects.map(p=><ProjectCard p={p} key={p.id}/>)}</div></section><section className="card"><div className="card-heading"><h2>Ideas & notes <span className="count">{searchedIdeas.length}</span></h2></div>{searchedIdeas.map(i=><button className="result-row" key={i.id} onClick={()=>{go('ideas');setIdeaId(i.id);}}><Icon name="bulb"/>{i.title}<Icon name="arrow" size={16}/></button>)}</section></div>:
      view==='today'?<>
        <div className="overview-grid"><div className="overview-card"><span className="overview-icon sage"><Icon name="check"/></span><div><span className="stat-label">On your list</span><strong>{openToday.length}<small> tasks today</small></strong></div></div><div className="overview-card"><span className="overview-icon sand"><Icon name="clock"/></span><div><span className="stat-label">Time you’ve planned</span><strong>{loadToday.total?duration(loadToday.total):'—'}<small className={loadToday.total>data.capacityMinutes?'overdue-text':''}> / {duration(data.capacityMinutes)} capacity</small></strong></div></div><div className="overview-card"><span className="overview-icon lavender"><Icon name="leaf"/></span><div><span className="stat-label">A little progress</span><strong>{completedToday.length}<small> completed today</small></strong></div></div></div>
        <div className="dashboard-columns"><div className="dashboard-main"><section className="focus-card"><div className="card-heading"><div><span className="eyebrow">LESS, BUT BETTER</span><h2>Today’s focus <span className="count">{focusTasks.length}/3</span></h2></div><span className="focus-icon"><Icon name="sun" size={28}/></span></div><p className="section-description">If only a few things get done, let it be these.</p>{focusTasks.length?<div className="focus-list">{focusTasks.map((t,index)=><div className="focus-row" key={t.id}><span className="focus-number">0{index+1}</span><button className="focus-title" onClick={()=>setTaskEdit(t)}>{t.title}</button><button className="checkbox" onClick={()=>complete(t)} aria-label={`Complete ${t.title}`}/></div>)}</div>:<div className="focus-empty">Pin up to three tasks using the star beside a task.</div>}</section>
        <section className="card"><div className="card-heading"><h2>The rest of your day <span className="count">{openToday.filter(t=>!t.focus).length}</span></h2><button className="text-button" onClick={()=>newTask(today)}><Icon name="plus" size={16}/>Add task</button></div><TaskList tasks={openToday.filter(t=>!t.focus)} empty="You have space to breathe. Add a task or enjoy a lighter day."/>{completedToday.length>0&&<details className="completed-section"><summary>Completed today · {completedToday.length}</summary><TaskList tasks={completedToday}/></details>}</section>
        {overdue.length>0&&<section className="card"><div className="card-heading"><h2>Needs a new plan <span className="count">{overdue.length}</span></h2><span className="muted small">Missed plan or deadline</span></div><TaskList tasks={overdue}/></section>}
        {todayBlocks.length > 0 && <section className="card">
          <div className="card-heading"><h2>Time blocks today</h2><button className="text-button" onClick={() => startBlock(today)}>Add block</button></div>
          {todayBlocks.map(block => <button className="result-row" key={block.id} onClick={() => { go('calendar'); setCalendarDate(today); setBlockEdit(block); }}>
            <Icon name="clock" size={16} />{block.title}<span className="muted small">{new Date(block.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </button>)}
        </section>}
        <section className="projects-section"><div className="section-heading"><h2>A little closer to the bigger picture</h2><button className="text-button" onClick={()=>go('projects')}>All projects <Icon name="arrow" size={15}/></button></div><div className="project-grid compact">{data.projects.filter(p=>p.status==='active').slice(0,2).map(p=><ProjectCard p={p} key={p.id}/>)}</div>{!data.projects.length&&<button className="empty add-empty" onClick={addProject}><Icon name="plus"/>Start your first project</button>}</section></div>
        <aside className="dashboard-side"><section className="thought-card"><span className="illustration" aria-hidden="true"><svg viewBox="0 0 200 125"><path d="M22 103h156" stroke="#b0b59c"/><path d="M72 102c-2-28 3-52 20-73M80 65c-27 3-34-13-31-25 24-2 33 10 31 25ZM85 52c-1-25 13-38 30-33 0 22-12 33-30 33ZM76 87c-22 2-36-9-35-25 24-2 35 9 35 25ZM84 79c1-20 15-30 34-24-1 17-15 27-34 24Z" fill="#abb496" stroke="#718364" strokeWidth="1.4"/><path d="m115 103 13-34h35l13 34Z" fill="#e5c4a4"/><path d="M145 67c-7-18-7-32 3-45m-1 33c13-1 19-8 18-17-11-2-18 6-18 17Zm-4-8c-11-2-17-8-16-17 10 0 16 6 16 17Z" fill="#879d7f"/></svg></span><span className="eyebrow">A GENTLE REMINDER</span><h3>You don’t have to do<br/>it all today.</h3><p>Make a little progress on the things that matter to you.</p></section><section className="card idea-prompt"><span className="mini-icon"><Icon name="bulb" size={21}/></span><h3>A thought worth keeping?</h3><p>Give your ideas somewhere to land.</p><button className="text-button" onClick={addIdea}>Capture an idea <Icon name="arrow" size={16}/></button></section><section className="calendar-teaser"><div className="section-heading"><h3>Your calendar</h3><Icon name="calendar" size={18}/></div><p>Your local plans, all in one place.</p><button className="text-button" onClick={()=>go('calendar')}>See your plans <Icon name="arrow" size={15}/></button><span className="integration-label">{google.connected ? 'Google Calendar connected' : 'Connect Google Calendar'}</span></section><section className="card idea-prompt"><h3>Review your day</h3><p>Choose what to carry forward.</p><button className="text-button" onClick={() => go('reviews')}>Open reviews <Icon name="arrow" size={15} /></button></section>
        {backupDue && <section className="card idea-prompt"><h3>Keep a current backup</h3><p>Save a copy of your workspace to a file you can find later.</p><button className="text-button" onClick={exportBackup}>Export JSON backup</button></section>}</aside></div>
      </>:
      view === 'inbox' ? <section className="card">
        <div className="card-heading"><h2>{inboxView === 'someday' ? 'Someday' : inboxView === 'stalled' ? 'Waiting and blocked' : 'Unsorted tasks'}</h2>
          <button className="text-button" onClick={() => newTask('')}><Icon name="plus" size={16} />Quick capture</button>
        </div>
        <div className="inbox-tabs segmented">{([['inbox', 'Inbox', inbox.length], ['stalled', 'Waiting', stalled.length], ['someday', 'Someday', someday.length]] as const).map(([id, label, count]) =>
          <button className={inboxView === id ? 'selected' : ''} aria-pressed={inboxView === id} key={id} onClick={() => setInboxView(id)}>{label} · {count}</button>)}
        </div>
        <p className="section-description padded">{inboxView === 'someday' ? 'Possibilities you can return to when you have room.' : inboxView === 'stalled' ? 'Open a task to record what it’s waiting for or mark it ready.' : 'Tasks without a planned day or project land here.'}</p>
        <TaskList tasks={inboxView === 'someday' ? someday : inboxView === 'stalled' ? stalled : inbox} empty="Nothing in this list yet." />
      </section> :
      view==='projects'?<>{project?<><button className="text-button back-button" onClick={()=>setProjectId(null)}>← All projects</button><div className="project-detail-bar"><span className={`project-symbol ${project.color}`}><Icon name="grid"/></span><span className="capitalize">{project.status} project</span><button className="secondary" onClick={()=>setProjectEdit(project)}>Edit project</button></div><section className="card"><div className="card-heading"><h2>Project tasks</h2><div className="segmented">{(['open','done','all'] as const).map(f=><button className={filter===f?'selected':''} key={f} onClick={()=>setFilter(f)}>{f==='open'?'To do':f==='done'?'Done':'All'}</button>)}</div></div><TaskList tasks={activeTasks.filter(t=>t.projectId===project.id&&(filter==='all'||t.status===(filter==='done'?'done':'open')))} empty="No tasks here yet. Add the next small step."/><button className="inline-add" onClick={()=>newTask('',project.id)}><Icon name="plus" size={17}/>Add a task to this project</button></section><section className="card related-ideas"><div className="card-heading"><h2>Linked ideas</h2></div>{data.ideas.filter(i=>i.projectId===project.id).map(i=><button className="result-row" key={i.id} onClick={()=>{go('ideas');setIdeaId(i.id);}}><Icon name="bulb"/>{i.title}<Icon name="arrow" size={16}/></button>)}{!data.ideas.some(i=>i.projectId===project.id)&&<p className="section-description padded">Link an idea to this project from Ideas & notes.</p>}</section></>:<><div className="section-heading"><span className="muted">{data.projects.filter(p=>p.status==='active').length} active projects · one step at a time</span></div><div className="project-grid full">{data.projects.map(p=><ProjectCard p={p} key={p.id}/>)}<button className="project-card new-project-card" onClick={addProject}><Icon name="plus" size={28}/><strong>Room for something new</strong><span>Start a project</span></button></div><section className="card all-tasks"><div className="card-heading"><h2>All tasks <span className="count">{activeTasks.length}</span></h2><div className="segmented">{(['open','done','all'] as const).map(f=><button className={filter===f?'selected':''} key={f} onClick={()=>setFilter(f)}>{f==='open'?'To do':f==='done'?'Done':'All'}</button>)}</div></div><TaskList tasks={activeTasks.filter(t=>filter==='all'||t.status===(filter==='done'?'done':'open'))}/></section></>}</>:
      view==='ideas'?<div className="ideas-layout"><section className="ideas-list">{data.ideas.map(i=><button className={`idea-preview ${selectedIdea?.id===i.id?'selected':''}`} key={i.id} onClick={()=>setIdeaId(i.id)}><span className="eyebrow">{i.decision?'DIRECTION CHOSEN':'EXPLORING'}</span><h3>{i.title}</h3><p>{i.context || 'A little room to think…'}</p><span className="muted small">{new Date(i.updatedAt).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span></button>)}<button className="inline-add" onClick={addIdea}><Icon name="plus" size={17}/>New idea</button></section>{selectedIdea?<section className="card idea-editor" key={selectedIdea.id}><div className="editor-topline"><span className="eyebrow"><Icon name="bulb" size={15}/>FROM A THOUGHT TO A NEXT STEP</span><button className="icon-button" aria-label="Delete idea" onClick={()=>{if(confirm('Delete this idea? Linked tasks will be kept.')){change(d=>({...d,ideas:d.ideas.filter(i=>i.id!==selectedIdea.id),tasks:d.tasks.map(t=>t.ideaId===selectedIdea.id?{...t,ideaId:null}:t)}),selectedIdea.id,'idea.deleted');setIdeaId(null);}}}><Icon name="trash" size={17}/></button></div><label className="sr-only" htmlFor="idea-title">Idea title</label><input id="idea-title" className="idea-title" value={selectedIdea.title} maxLength={200} onChange={e=>updateIdea(selectedIdea.id,'title',e.target.value)} onBlur={()=>{if(!selectedIdea.title.trim())updateIdea(selectedIdea.id,'title','Untitled idea');}}/><label className="field">Linked project<select value={selectedIdea.projectId??''} onChange={e=>updateIdea(selectedIdea.id,'projectId',e.target.value||null)}><option value="">Just an idea for now</option>{data.projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{([{key:'context',label:'01 / THE THOUGHT',hint:'What’s on your mind? Why does it matter?'},{key:'options',label:'02 / POSSIBILITIES',hint:'Explore a few options. There’s no wrong first draft.'},{key:'decision',label:'03 / A DIRECTION',hint:'What have you decided? What made this the right choice?'},{key:'nextSteps',label:'04 / THE NEXT SMALL STEP',hint:'What can you actually do next?'}] as const).map(field=><label className="idea-field" key={field.key}><span>{field.label}</span><textarea value={selectedIdea[field.key]} placeholder={field.hint} maxLength={200000} rows={field.key==='context'?4:3} onChange={e=>updateIdea(selectedIdea.id,field.key,e.target.value)}/></label>)}<div className="editor-footer"><span className="muted small">Notes save as you write.</span><button className="primary" disabled={!selectedIdea.nextSteps.trim()} onClick={()=>setTaskEdit({...taskDraft(),title:selectedIdea.nextSteps.split('\n').find(line=>line.trim())?.trim().slice(0,200)??'',notes:`From idea: ${selectedIdea.title}\n\n${selectedIdea.nextSteps}`,ideaId:selectedIdea.id,projectId:selectedIdea.projectId})}>Turn next step into a task <Icon name="arrow" size={16}/></button></div>{activeTasks.some(t=>t.ideaId===selectedIdea.id)&&<div className="linked-tasks"><h3>Tasks from this idea</h3><TaskList tasks={activeTasks.filter(t=>t.ideaId===selectedIdea.id)}/></div>}</section>:<div className="card empty"><Icon name="bulb" size={32}/><h2>Every plan starts somewhere.</h2><p>Create an idea and let the first draft be messy.</p><button className="primary" onClick={addIdea}>Capture your first idea</button></div>}</div>:
      view === 'calendar' ? <Calendar planner={data} today={today} date={calendarDate} setDate={setCalendarDate}
        google={google} editTask={setTaskEdit} addTask={date => newTask(date, null)}
        addBlock={startBlock} editBlock={setBlockEdit} restoreBlock={block => setBlockTrash(block, false)} syncBlock={syncBlock} /> :
      view === 'reviews' ? <Reviews planner={data} today={today} onSave={saveReview} onComplete={complete}
        onMove={planTask} onTrash={trashTask} onEdit={setTaskEdit} /> :
      <Settings planner={data} exportBackup={exportBackup} importBackup={file => void importBackup(file)}
        clearWorkspace={() => setConfirmClear(true)} restoreTask={restoreTask}
        setCapacity={minutes => { change(current => ({ ...current, capacityMinutes: minutes })); setToast('Daily capacity saved.'); }} />}
      <footer className="page-footer"><span><i className={`status-dot ${saveError?'error':''}`}/>{storage}</span><span>Less noise. More daylight.</span></footer>
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Mobile navigation">{nav.map(n=><button key={n.id} aria-current={view===n.id?'page':undefined} className={view===n.id?'active':''} onClick={()=>go(n.id)}><Icon name={n.icon} size={21}/><span>{n.id==='ideas'?'Ideas':n.label}</span></button>)}<button className={view==='settings'?'active':''} onClick={()=>go('settings')}><Icon name="settings" size={21}/><span>More</span></button></nav>
    {taskEdit && <TaskDialog key={taskEdit.id} task={taskEdit} projects={data.projects} today={today}
      onClose={() => setTaskEdit(null)} onSave={saveTask} onTrash={() => trashTask(taskEdit)}
      onSchedule={task => startBlock(task.plannedDate && task.plannedDate >= today ? task.plannedDate : today, task)}
      exists={activeTasks.some(task => task.id === taskEdit.id)} error={taskError} />}
    {blockEdit && <TimeBlockDialog key={blockEdit.id} block={blockEdit} stored={data.blocks.find(block => block.id === blockEdit.id)}
      planner={data} google={google} onClose={() => setBlockEdit(null)} onSave={saveBlock}
      onTrash={block => setBlockTrash(block, true)} onSync={syncBlock} />}
    {projectEdit&&<ProjectDialog project={projectEdit} onClose={()=>setProjectEdit(null)} onSave={saveProject}/>}
    {confirmClear&&<Modal title="A fresh start?" onClose={()=>setConfirmClear(false)}><div className="modal-body"><p>This removes {data.tasks.length} tasks, {data.projects.length} projects, {data.ideas.length} ideas, time blocks, reviews, and all activity history from this device.</p><p>Export a backup first if you want to keep this workspace.</p><div className="modal-actions"><button className="secondary" onClick={exportBackup}>Export first</button><button className="danger" disabled={google.busy} onClick={()=>{setData(emptyPlanner());setConfirmClear(false);setIdeaId(null);setProjectId(null);setView('today');setToast('A fresh page. Make it yours.');}}>Clear and start fresh</button></div></div></Modal>}
    {restore&&<Modal title="Restore this backup?" onClose={()=>setRestore(null)}><div className="modal-body"><div className="restore-counts"><strong>{restore.tasks.length}<small> tasks</small></strong><strong>{restore.projects.length}<small> projects</small></strong><strong>{restore.ideas.length}<small> ideas</small></strong><strong>{restore.blocks.length}<small> blocks</small></strong><strong>{restore.reviews.length}<small> reviews</small></strong></div><p>This replaces your current workspace, including its activity history. Export your current data before continuing if you need to keep it.</p><div className="modal-actions"><button className="secondary" onClick={exportBackup}>Back up current data</button><button className="primary" disabled={google.busy} onClick={()=>{setData(restore);setRestore(null);setIdeaId(null);setProjectId(null);setView('today');setToast('Workspace restored.');}}>Replace workspace</button></div></div></Modal>}
    {toast&&<div className="toast" role="status">{toast}<button className="icon-button" aria-label="Dismiss message" onClick={()=>setToast('')}><Icon name="close" size={15}/></button></div>}
  </div>;
}
function ProjectDialog({project,onSave,onClose}: {project:Project;onSave:(p:Project)=>void;onClose:()=>void}) {
  const [draft,setDraft]=useState(project);
  return <Modal title={project.name?'Give your project direction':'Make room for a new project'} onClose={onClose}><form className="modal-body" onSubmit={e=>{e.preventDefault();if(draft.name.trim())onSave({...draft,name:draft.name.trim()});}}><label className="field">Project name<input required autoFocus value={draft.name} maxLength={100} placeholder="What are you working toward?" onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label className="field">What does done look like?<textarea rows={4} value={draft.outcome} placeholder="A clear outcome makes the next step easier." onChange={e=>setDraft({...draft,outcome:e.target.value})}/></label><div className="form-columns"><label className="field">Color<select value={draft.color} onChange={e=>setDraft({...draft,color:e.target.value})}><option value="sage">Sage</option><option value="clay">Clay</option><option value="lavender">Lavender</option><option value="blue">Blue</option></select></label><label className="field">Status<select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as Project['status']})}><option value="active">Active</option><option value="paused">Paused</option><option value="done">Complete</option></select></label></div><div className="modal-actions"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">Save project<Icon name="arrow" size={16}/></button></div></form></Modal>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
