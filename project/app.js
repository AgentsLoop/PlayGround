const LS_KEY = 'todos-v1';
const $ = s => document.querySelector(s);
const todoInput = $('#todoInput');
const addBtn = $('#addBtn');
const todoList = $('#todoList');
const counter = $('#counter');
const totalLabel = $('#totalLabel');
const clearBtn = $('#clearCompleted');
const emptyState = $('#emptyState');
const emptyTitle = $('#emptyTitle');
const emptyDesc = $('#emptyDesc');
const dateLabel = $('#dateLabel');

let todos = load();
function getFilterFromHash(){
  const h = location.hash || '#/';
  if(h === '#/active') return 'active';
  if(h === '#/completed') return 'completed';
  return 'all';
}
let filter = getFilterFromHash();
let editingId = null;

function load(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    if(Array.isArray(parsed)) return parsed;
    return [];
  }catch{ return []; }
}
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(todos)); }

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

function addTodo(text){
  const t = text.trim();
  if(!t) return;
  todos.unshift({ id: uid(), text: t, completed:false, created: Date.now() });
  save(); render();
}

function toggle(id){
  const td = todos.find(t=>t.id===id);
  if(td){ td.completed=!td.completed; save(); render(); }
}
function remove(id){
  todos = todos.filter(t=>t.id!==id);
  save(); render();
}
function updateText(id, newText){
  const t = newText.trim();
  const td = todos.find(x=>x.id===id);
  if(!td) return;
  if(!t){ remove(id); return; }
  td.text = t;
  save(); render();
}
function clearCompleted(){
  todos = todos.filter(t=>!t.completed);
  save(); render();
}
function toggleAll(){
  const allCompleted = todos.length>0 && todos.every(t=>t.completed);
  todos.forEach(t=> t.completed = !allCompleted);
  save(); render();
}

function filtered(){
  if(filter==='active') return todos.filter(t=>!t.completed);
  if(filter==='completed') return todos.filter(t=>t.completed);
  return todos;
}

function render(){
  const list = filtered();
  todoList.innerHTML='';
  // sync toggle-all checkbox and row visibility
  const toggleAllEl = document.getElementById('toggleAll');
  const toggleRow = document.getElementById('toggleAllRow');
  if(toggleAllEl && toggleRow){
    toggleRow.style.display = todos.length ? 'flex' : 'none';
    const allDone = todos.length>0 && todos.every(t=>t.completed);
    toggleAllEl.checked = allDone;
  }

  // counter
  const remaining = todos.filter(t=>!t.completed).length;
  counter.textContent = `${remaining} ${remaining===1?'left':'left'}`;
  const total = todos.length;
  const completedCount = total - remaining;
  totalLabel.textContent = total===0 ? 'No tasks' : `${total} task${total!==1?'s':''} · ${completedCount} completed`;
  clearBtn.disabled = completedCount===0;

  // filters active state
  document.querySelectorAll('.filter-btn').forEach(b=>{
    const isActive = b.dataset.filter===filter;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive?'true':'false');
  });

  // empty state
  if(list.length===0){
    emptyState.classList.add('show');
    if(todos.length===0){
      emptyTitle.textContent='No todos yet';
      emptyDesc.textContent='Add your first task above and start your day.';
    } else if(filter==='active'){
      emptyTitle.textContent='No active tasks';
      emptyDesc.textContent='All caught up! Enjoy the calm.';
    } else if(filter==='completed'){
      emptyTitle.textContent='No completed tasks';
      emptyDesc.textContent='Complete a todo to see it here.';
    }
  } else {
    emptyState.classList.remove('show');
  }

  for(const td of list){
    const li = document.createElement('li');
    li.className = 'todo-item'+(td.completed?' completed':'')+(editingId===td.id?' editing':'');
    li.dataset.id = td.id;

    const check = document.createElement('button');
    check.className='check';
    check.setAttribute('aria-label', td.completed?'Mark as incomplete':'Mark as complete');
    check.textContent='✓';
    check.addEventListener('click', ()=>toggle(td.id));

    let textWrap;
    if(editingId===td.id){
      const inp = document.createElement('input');
      inp.className='edit-input';
      inp.value=td.text;
      inp.autofocus=true;
      inp.setAttribute('aria-label','Edit todo');
      // focus and select end
      setTimeout(()=>{ inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); },0);
      const saveEdit = ()=>{
        const v = inp.value;
        editingId=null;
        updateText(td.id, v);
      };
      const cancelEdit = ()=>{ editingId=null; render(); };
      inp.addEventListener('keydown', e=>{
        if(e.key==='Enter') saveEdit();
        else if(e.key==='Escape') cancelEdit();
      });
      inp.addEventListener('blur', saveEdit);
      textWrap = inp;
    } else {
      const span = document.createElement('span');
      span.className='todo-text';
      span.textContent=td.text;
      span.title='Double-click to edit';
      span.addEventListener('dblclick', ()=>{ editingId=td.id; render();
        // focus is handled via editing branch re-render
      });
      textWrap = span;
    }

    const actions = document.createElement('div');
    actions.className='actions';
    if(editingId!==td.id){
      const editBtn = document.createElement('button');
      editBtn.className='icon-btn';
      editBtn.innerHTML='✎';
      editBtn.title='Edit';
      editBtn.setAttribute('aria-label','Edit todo');
      editBtn.addEventListener('click', ()=>{ editingId=td.id; render(); });
      const delBtn = document.createElement('button');
      delBtn.className='icon-btn danger';
      delBtn.innerHTML='×';
      delBtn.title='Delete';
      delBtn.style.fontSize='18px';
      delBtn.setAttribute('aria-label','Delete todo');
      delBtn.addEventListener('click', ()=>remove(td.id));
      actions.append(editBtn, delBtn);
    }

    li.append(check, textWrap, actions);
    todoList.appendChild(li);
  }
}

// events
addBtn.addEventListener('click', ()=>{
  addTodo(todoInput.value);
  todoInput.value='';
  todoInput.focus();
});
todoInput.addEventListener('keydown', e=>{
  if(e.key==='Enter'){
    addTodo(todoInput.value);
    todoInput.value='';
  }
});
todoInput.addEventListener('input', ()=>{
  // optional: enable/disable button
  // keep always enabled for a11y but visually could disable
});

document.querySelectorAll('.filter-btn').forEach(b=>{
  b.addEventListener('click', (e)=>{
    // let hashchange drive rendering; fallback if hash unchanged
    const targetHash = b.getAttribute('href');
    if(targetHash && location.hash !== targetHash){
      // hashchange event will trigger render
    } else {
      filter = b.dataset.filter;
      render();
    }
  });
});
window.addEventListener('hashchange', ()=>{
  filter = getFilterFromHash();
  render();
});
const toggleAllEl = document.getElementById('toggleAll');
if(toggleAllEl) toggleAllEl.addEventListener('change', toggleAll);
clearBtn.addEventListener('click', clearCompleted);

// date
try{
  dateLabel.textContent = new Date().toLocaleDateString(undefined, { weekday:'long', month:'long', day:'numeric' });
}catch{ dateLabel.textContent=''; }

// initial render
render();

// expose for manual testing in console
window._todos = ()=>todos;
