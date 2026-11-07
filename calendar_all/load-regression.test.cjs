const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('calendar_all/app.js', 'utf8').replace(/^loadCalendar\(\);$/m, '');
async function scenario({ taskFails = false, pendingLocks = false, calendarFails = false }) {
 const elements = new Map();
 function element(id) { if (!elements.has(id)) elements.set(id, {innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},replaceChildren(){},append(){},before(){},scrollTo(){}}); return elements.get(id); }
 const context = vm.createContext({console, AbortController, Date, Map, Set, document:{addEventListener(){},getElementById:element,createElement:()=>element(Symbol()),querySelector:element},window:{addEventListener(){}},requestAnimationFrame:()=>{},setTimeout,clearTimeout, fetch:async url=>{
  if(url.includes('/warmup')) return {ok:true,json:async()=>({ok:true})};
  if(url.includes('/locks-status') && pendingLocks) return new Promise(()=>{});
  if(url.includes('/calendar-all')) return {ok:!calendarFails,json:async()=>calendarFails?{ok:false,message:'Unavailable'}:{ok:true,properties:[{listingId:'example'}]}};
  if(taskFails && url.includes('/calendar-task')) return {ok:false,json:async()=>({ok:false,message:'fetch failed'})};
  return {ok:true,json:async()=>({ok:true,tasks:[{id:'task'}],vendors:[],creators:[],locks:[]})};
 }});
 vm.runInContext(source,context);
 assert.equal(vm.runInContext('getLockStatusForProperty({nickname:"test"})',context),null);
 vm.runInContext('render = () => { calendarEl.innerHTML = "reservations rendered"; }; fillTaskPropertySelect = fillTaskVendorSelect = fillTaskCreatorSelect = updatePhoneTaskBadge = maybeOpenTaskAlerts = scrollToToday = () => {};',context);
 const promise = vm.runInContext('loadCalendar()',context);
 await new Promise(resolve=>setTimeout(resolve,20));
 if(pendingLocks) { assert.equal(element('calendar').innerHTML,'reservations rendered'); return; }
 await promise;
 if(calendarFails) assert.match(element('calendar').innerHTML,/retryCalendarBtn/);
 else assert.equal(element('calendar').innerHTML,'reservations rendered');
 assert.equal(element('taskMenuBtn').disabled,taskFails);
 if(taskFails) assert.equal(vm.runInContext('serviceWarnings.has("Tasks")',context),true);
}
(async()=>{
 await scenario({taskFails:true});
 await scenario({});
 await scenario({calendarFails:true});
 await scenario({pendingLocks:true});
 console.log('PASS: task failures do not block reservations; healthy tasks enabled; calendar failure offers retry; stalled locks do not delay rendering');
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
