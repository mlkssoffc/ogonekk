const CACHE="ogonok-v3";
const ASSETS=["./","./index.html","./manifest.webmanifest","./icon.png"];

self.addEventListener("install",e=>
  e.waitUntil(
    caches.open(CACHE)
      .then(c=>Promise.allSettled(ASSETS.map(a=>c.add(a))))
      .then(()=>self.skipWaiting())
  )
);

self.addEventListener("activate",e=>
  e.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  )
);

self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  if(e.request.mode==="navigate"||new URL(e.request.url).pathname.endsWith("/index.html")){
    e.respondWith(
      fetch(e.request)
        .then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r})
        .catch(()=>caches.match(e.request))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});

/* ===== Напоминания в фоне =====
   Страница пишет настройки в IndexedDB «ogonok-rem» (ключи cfg и sent).
   Периодическая синхронизация работает в установленном PWA на Android (Chrome),
   точное время браузер не гарантирует. На iOS напоминание придёт, только пока приложение открыто. */
function idb(){return new Promise((res,rej)=>{const r=indexedDB.open("ogonok-rem",1);r.onupgradeneeded=()=>r.result.createObjectStore("kv");r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function kvGet(k){return idb().then(db=>new Promise(res=>{const q=db.transaction("kv").objectStore("kv").get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>res()})).catch(()=>{})}
function kvSet(k,v){return idb().then(db=>new Promise(res=>{const t=db.transaction("kv","readwrite");t.objectStore("kv").put(v,k);t.oncomplete=()=>res();t.onerror=()=>res()})).catch(()=>{})}
function dayKey(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}

async function remind(){
  const cfg=await kvGet("cfg");
  if(!cfg||!cfg.enabled)return;
  const now=new Date(),wd=now.getDay(),key=dayKey(now);
  if(wd===0||wd===6)return;                       // выходные
  if(cfg.lastMarked===key)return;                 // уже отметился
  const [h,m]=String(cfg.time||"17:00").split(":").map(Number);
  if(now.getHours()*60+now.getMinutes()<h*60+m)return;  // ещё рано
  if(await kvGet("sent")===key)return;            // сегодня уже напоминали
  await kvSet("sent",key);
  await self.registration.showNotification("Учебный огонёк 🔥",{
    body:"Ты ещё не отметился сегодня — серия ждёт тебя!",
    icon:"./icon.png",badge:"./icon.png",tag:"ogonok-daily",data:{url:"./"}
  });
}

self.addEventListener("periodicsync",e=>{if(e.tag==="ogonok-reminder")e.waitUntil(remind())});

self.addEventListener("notificationclick",e=>{
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{
      for(const c of list){if("focus" in c)return c.focus()}
      return self.clients.openWindow((e.notification.data&&e.notification.data.url)||"./");
    })
  );
});
