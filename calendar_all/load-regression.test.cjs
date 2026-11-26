const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('calendar_all/app.js', 'utf8').replace(/^(?:initializeLocks|loadCalendar)\(\);$/gm, '');
async function scenario({ taskFails = false, pendingLocks = false, calendarFails = false, recoverAutomatically = false, cachedCalendar = false, testLockButton = false }) {
 const elements = new Map();
 const retries = [];
 const handlers = new Map();
 const storage = new Map();
 const requests = [];
 const revision = "a".repeat(40);
 let refAvailable = true;
 let lockData = {ok:true,capturedAt:null,locks:[]};
 let taskServiceRecovered = false;
 function element(id) { if (!elements.has(id)) elements.set(id, {innerHTML:'',textContent:'',classList:{add(){},remove(){},toggle(){}},addEventListener(event, callback){handlers.set(`${String(id)}:${event}`,callback);},setAttribute(){},replaceChildren(){},append(){},before(){},scrollTo(){}}); return elements.get(id); }
 const context = vm.createContext({console, AbortController, AbortSignal, Date, Map, Set, localStorage:{getItem:key=>storage.get(key) ?? null,setItem:(key,value)=>storage.set(key,value)}, sessionStorage:{getItem(){return null;},setItem(){}}, document:{addEventListener(){},getElementById:element,createElement:()=>element(Symbol()),querySelector:element},window:{addEventListener(){}},requestAnimationFrame:()=>{},setTimeout:(fn,ms)=>{const timer=setTimeout(fn,ms); if(ms===5000)retries.push({fn,timer});return timer;},clearTimeout, fetch:async url=>{
  requests.push(url);
  if(url.includes('/warmup')) return {ok:true,json:async()=>({ok:true})};
  if(url.includes('/git/ref/heads/lock-data')) return {ok:refAvailable,json:async()=>({object:{sha:revision}})};
  if(url.includes('/lock-snapshot.json')) return pendingLocks ? new Promise(()=>{}) : {ok:lockData.ok,json:async()=>lockData};
  if(url.includes('/calendar-all') && cachedCalendar) return new Promise(()=>{});
  if(url.includes('/calendar-all')) return {ok:!calendarFails,json:async()=>calendarFails?{ok:false,message:'Unavailable'}:{ok:true,properties:[{listingId:'example'}]}};
  if(taskFails && !taskServiceRecovered && url.includes('/calendar-task')) return {ok:false,json:async()=>({ok:false,message:'fetch failed'})};
  return {ok:true,json:async()=>({ok:true,tasks:[{id:'task'}],vendors:[],creators:[],locks:[]})};
 }});
 vm.runInContext(source,context);
 assert.equal(vm.runInContext('getLockStatusForProperty({nickname:"test"})',context),null);
 vm.runInContext('render = () => { calendarEl.innerHTML = "reservations rendered"; }; fillTaskPropertySelect = fillTaskVendorSelect = fillTaskCreatorSelect = updatePhoneTaskBadge = maybeOpenTaskAlerts = scrollToToday = () => {};',context);
 if(cachedCalendar) vm.runInContext('sessionStorage.getItem = () => JSON.stringify({start:addDays(todayString(),-DAYS_BEFORE_TODAY),end:addDays(todayString(),DAYS_TO_SHOW+1),savedAt:Date.now(),properties:[{listingId:"cached"}]});',context);
 const promise = vm.runInContext('initializeLocks(); loadCalendar()',context);
 await new Promise(resolve=>setTimeout(resolve,20));
 if(pendingLocks || cachedCalendar) { assert.equal(element('calendar').innerHTML,'reservations rendered'); if(cachedCalendar)assert.equal(vm.runInContext('serviceWarnings.has("Calendar")',context),true);return; }
 await promise;
 if(calendarFails) assert.match(element('calendar').innerHTML,/retryCalendarBtn/);
 else assert.equal(element('calendar').innerHTML,'reservations rendered');
 assert.equal(element('taskMenuBtn').disabled,taskFails);
 if(taskFails) assert.equal(vm.runInContext('serviceWarnings.has("Tasks")',context),true);
 if(testLockButton) {
  requests.length = 0;
  lockData = {ok:true,capturedAt:"2026-11-25T12:00:00-05:00",locks:[{listingId:"example",batteryPercent:87,online:true}]};
  await handlers.get("refreshLocksBtn:click")();
  assert.equal(requests.length,2);
  assert.match(requests[0], /git\/ref\/heads\/lock-data$/);
  assert.ok(requests[1].includes(`/${revision}/calendar-data/lock-snapshot.json?v=`));
  assert.equal(vm.runInContext('getLockStatusForProperty({listingId:"example"}).batteryPercent',context),87);
  assert.match(element('lockRefreshStatus').textContent,/Lock readings as of/);
  refAvailable = false;
  lockData = {ok:true,capturedAt:null,locks:[]};
  await handlers.get("refreshLocksBtn:click")();
  assert.ok(requests.at(-1).includes("/lock-data/calendar-data/lock-snapshot.json?v="));
  await handlers.get("refreshLocksBtn:click")();
  assert.equal(vm.runInContext('getLockStatusForProperty({listingId:"example"}).batteryPercent',context),87);
  assert.match(element('lockRefreshStatus').textContent,/Showing readings/);
  requests.length = 0;
  vm.runInContext('lockStatuses = []; lockCapturedAt = 0; initializeLocks();',context);
  assert.equal(requests.length,0);
  assert.equal(vm.runInContext('getLockStatusForProperty({listingId:"example"}).batteryPercent',context),87);

  lockData = {ok:false,message:"Rate limited"};
  vm.runInContext('lockCalendarDay = () => "2099-01-01";',context);
  await vm.runInContext('initializeLocks()',context);
  assert.equal(requests.length,2);
  assert.equal(vm.runInContext('getLockStatusForProperty({listingId:"example"}).batteryPercent',context),87);
  await vm.runInContext('initializeLocks()',context);
  assert.equal(requests.length,2);
  await handlers.get("refreshLocksBtn:click")();
  assert.equal(requests.length,4);
 }
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
 await scenario({testLockButton:true});
 await scenario({calendarFails:true});
 await scenario({pendingLocks:true});
 await scenario({taskFails:true,recoverAutomatically:true});
 await scenario({cachedCalendar:true});
 console.log('PASS: task failures do not block reservations; services reconnect automatically; stalled services do not delay rendering; cached calendar appears while live service wakes');
 process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
