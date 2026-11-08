const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('calendar_all/app.js', 'utf8').replace(/^loadCalendar\(\);$/m, '');
async function scenario({ taskFails = false, pendingLocks = false, calendarFails = false, recoverAutomatically = false, cachedCalendar = false }) {
 const elements = new Map();
 const retries = [];
 let taskServiceRecovered = false;
 function element(id) { if (!elements.has(id)) elements.set(id, {innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},addEventListener(){},setAttribute(){},replaceChildren(){},append(){},before(){},scrollTo(){}}); return elements.get(id); }
 const context = vm.createContext({console, AbortController, Date, Map, Set, sessionStorage:{getItem(){return null;},setItem(){}}, document:{addEventListener(){},getElementById:element,createElement:()=>element(Symbol()),querySelector:element},window:{addEventListener(){}},requestAnimationFrame:()=>{},setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms); if(ms===5000)retries.push({fn,timer});return timer;},clearTimeout, fetch:async url=>{
  if(url.includes('/warmup')) return {ok:true,json:async()=>({ok:true})};
  if(url.includes('/locks-status') && pendingLocks) return new Promise(()=>{});
  if(url.includes('/calendar-all') && cachedCalendar) return new Promise(()=>{});
  if(url.includes('/calendar-all')) return {ok:!calendarFails,json:async()=>calendarFails?{ok:false,message:'Unavailable'}:{ok:true,properties:[{listingId:'example'}]}};
  if(taskFails && !taskServiceRecovered && url.includes('/calendar-task')) return {ok:false,json:async()=>({ok:false,message:'fetch failed'})};
  return {ok:true,json:async()=>({ok:true,tasks:[{id:'task'}],vendors:[],creators:[],locks:[]})};
 }});
 vm.runInContext(source,context);
 assert.equal(vm.runInContext('getLockStatusForProperty({nickname:"test"})',context),null);
 vm.runInContext('render = () => { calendarEl.innerHTML = "reservations rendered"; }; fillTaskPropertySelect = fillTaskVendorSelect = fillTaskCreatorSelect = updatePhoneTaskBadge = maybeOpenTaskAlerts = scrollToToday = () => {};',context);
 if(cachedCalendar) vm.runInContext('sessionStorage.getItem = () => JSON.stringify({start:addDays(todayString(),-DAYS_BEFORE_TODAY),end:addDays(todayString(),DAYS_TO_SHOW+1),savedAt:Date.now(),properties:[{listingId:"cached"}]});',context);
 const promise = vm.runInContext('loadCalendar()',context);
 await new Promise(resolve=>setTimeout(resolve,20));
 if(pendingLocks || cachedCalendar) { assert.equal(element('calendar').innerHTML,'reservations rendered'); if(cachedCalendar)assert.equal(vm.runInContext('serviceWarnings.has("Calendar")',context),true);return; }
 await promise;
 if(calendarFails) assert.match(element('calendar').innerHTML,/retryCalendarBtn/);
 else assert.equal(element('calendar').innerHTML,'reservations rendered');
 assert.equal(element('taskMenuBtn').disabled,taskFails);
 if(taskFails) assert.equal(vm.runInContext('serviceWarnings.has("Tasks")',context),true);
 if(recoverAutomatically) {
  taskServiceRecovered=true;
  await Promise.all(retries.map(({fn,timer})=>{clearTimeout(timer);return fn();}));
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(element('taskMenuBtn').disabled,false);
  assert.equal(vm.runInContext('serviceWarnings.size',context),0);
 }
}
(async()=>{
 await scenario({taskFails:true});
 await scenario({});
 await scenario({calendarFails:true});
 await scenario({pendingLocks:true});
 await scenario({taskFails:true,recoverAutomatically:true});
 await scenario({cachedCalendar:true});
 console.log('PASS: task failures do not block reservations; services reconnect automatically; stalled services do not delay rendering; cached calendar appears while live service wakes');
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
