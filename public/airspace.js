(()=>{const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let map,me,accC,pin,zoneL,gridL,started=false,watchId=null,lastChk=null,busy=false;
const COL={restricted:'#ff4d6d',controlled:'#ffb020',caution:'#a78bfa',info:'#64748b'};
function show(t){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.t===t));$('tab-videos').style.display=t==='videos'?'':'none';$('tab-airspace').style.display=t==='airspace'?'':'none';history.replaceState(null,'',t==='airspace'?'#airspace':location.pathname);if(t==='airspace')start()}
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>show(b.dataset.t));
function initMap(){map=L.map('asmap',{zoomControl:true}).setView([39.5,-98.35],4);
 L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,className:'darktiles',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
 zoneL=L.layerGroup().addTo(map);gridL=L.layerGroup().addTo(map);
 map.on('click',e=>{if(!$('asform').hidden||confirm('Check airspace at this map point instead of your location?')){stopTrack();runCheck(e.latlng.lat,e.latlng.lng,'map point')}})}
function start(){if(!map)initMap();setTimeout(()=>map.invalidateSize(),50);if(!started){started=true;locate()}}
function locMsg(html){const m=$('aslocmsg');m.innerHTML=html;m.hidden=!html}
function locate(){if(!('geolocation' in navigator)){fallback('Your browser does not support location.');return}
 if(!window.isSecureContext){fallback('Location needs HTTPS. Open this page via https://.');return}
 banner('wait','📡 Checking your location…','Allow location access when asked');$('asverdict').innerHTML='<div class="vt">📡 Getting your location…</div><p class="msg">Allow location access when your browser asks.</p>';
 navigator.geolocation.getCurrentPosition(p=>gotPos(p,true),geoErr,{enableHighAccuracy:true,timeout:20000,maximumAge:0})}
function geoErr(e){const why={1:'Location permission was denied.',2:'Your position is unavailable (no GPS/Wi-Fi fix).',3:'Getting your location timed out.'}[e.code]||e.message;fallback(why)}
function fallback(why){stopTrack();$('astrack').checked=false;
 locMsg(`<b>📍 ${esc(why)}</b> To use your device location: tap the lock/ⓘ icon in the address bar → <i>Site settings → Location → Allow</i> (iPhone: Settings → Privacy → Location Services → Safari Websites → While Using), then press “Re-check my location”. Meanwhile you can search an address or tap the map below.`);
 $('asform').hidden=false;$('asverdict').innerHTML='<div class="vt">Search an address or click the map</div>';banner('unknown','📍 Location off — search or tap the map','Turn on location to check where you are')}
function dist(a,b){const R=6371e3,r=x=>x*Math.PI/180,dl=r(b[0]-a[0]),dn=r(b[1]-a[1]);const h=Math.sin(dl/2)**2+Math.cos(r(a[0]))*Math.cos(r(b[0]))*Math.sin(dn/2)**2;return 2*R*Math.asin(Math.sqrt(h))}
function gotPos(p,force){const{latitude:lat,longitude:lon,accuracy:acc}=p.coords;locMsg('');$('asform').hidden=true;
 const ll=[lat,lon];if(!me){me=L.circleMarker(ll,{radius:8,color:'#fff',weight:3,fillColor:'#4fd1ff',fillOpacity:1}).addTo(map);accC=L.circle(ll,{radius:acc,color:'#4fd1ff',weight:1,fillOpacity:.12}).addTo(map)}else{me.setLatLng(ll);accC.setLatLng(ll).setRadius(acc)}
 $('asacc').textContent=`± ${Math.round(acc)} m accuracy · ${new Date().toLocaleTimeString()}`;
 if(force||!lastChk||dist(lastChk,ll)>200)runCheck(lat,lon,'your location',acc)}
function stopTrack(){if(watchId!=null){navigator.geolocation.clearWatch(watchId);watchId=null}}
$('asme').onclick=()=>{stopTrack();if($('astrack').checked)track();else locate()};
function track(){stopTrack();watchId=navigator.geolocation.watchPosition(p=>gotPos(p,false),geoErr,{enableHighAccuracy:true,maximumAge:5000,timeout:30000})}
$('astrack').onchange=e=>{if(e.target.checked){lastChk=null;track()}else stopTrack()};
$('asform').onsubmit=async e=>{e.preventDefault();const r=await fetch('api/airspace/geocode?q='+encodeURIComponent($('asq').value));const v=await r.json();
 $('asres').innerHTML=Array.isArray(v)&&v.length?v.map((x,i)=>`<div data-i="${i}">${esc(x.name)}</div>`).join(''):'<div class="msg">No results</div>';
 $('asres').onclick=ev=>{const d=ev.target.closest('[data-i]');if(!d)return;const x=v[d.dataset.i];$('asres').innerHTML='';runCheck(x.lat,x.lon,x.name.split(',').slice(0,2).join(','))}};
function banner(cls,t,sub){const b=$('asbanner');b.className='banner '+cls;b.innerHTML=`<div class="bt">${t}</div><div class="bs">${esc(sub||'')}</div>`}
const VT={unknown:['⚠️','Unable to confirm — treat as NOT cleared','One or more FAA data sources did not respond (rate-limited or down), so this point cannot be shown as clear. Try again in a minute and check B4UFLY/Aloft.'],clear:['✅','Clear — uncontrolled airspace','Class G: fly up to 400 ft AGL following Part 107 / recreational rules.'],controlled:['🟠','Controlled airspace — LAANC authorization needed',''],restricted:['⛔','Restricted / No-fly — do not fly','One or more restrictions cover this point. Do not fly without specific FAA/agency authorization.']};
async function runCheck(lat,lon,label,acc){if(busy)return;busy=true;lastChk=[lat,lon];
 if(!acc){pin?pin.setLatLng([lat,lon]):pin=L.marker([lat,lon]).addTo(map)}else if(pin){pin.remove();pin=null}
 map.setView([lat,lon],Math.max(map.getZoom(),12));banner('wait','📡 Checking…',label);$('asverdict').className='verdict';$('asverdict').innerHTML=`<div class="vt">⏳ Checking FAA data…</div><p class="msg">${esc(label)} · ${lat.toFixed(5)}, ${lon.toFixed(5)}</p>`;
 try{const r=await fetch(`api/airspace/check?lat=${lat}&lon=${lon}`);const d=await r.json();if(!r.ok)throw new Error(d.error||r.status);render(d,label,acc);drawGrid(lat,lon)}
 catch(e){banner('unknown','❓ Can’t confirm — don’t fly yet','Data check failed, try again');$('asverdict').innerHTML=`<div class="vt">⚠️ Could not check airspace</div><p class="msg">${esc(e.message)} — try again in a minute, and use B4UFLY/Aloft.</p>`}finally{busy=false}}
function render(d,label,acc){const bsub=label+(acc?` · ±${Math.round(acc)} m`:'');const caution=d.zones.some(z=>z.level==='caution');
 if(d.verdict==='restricted')banner('red','⛔ Do not fly here',bsub);
 else if(d.verdict==='unknown')banner('unknown','❓ Can’t confirm — don’t fly yet',bsub);
 else if(d.verdict==='controlled'){const m=d.laanc;if(m==null||m===0)banner('redamber','⛔ Not without special FAA approval',bsub);else banner('amber',`⚠️ Fly only with FAA (LAANC) approval — up to ${m} ft`,bsub)}
 else if(caution)banner('amber','⚠️ Check before flying — up to 400 ft',bsub);
 else banner('green','✅ Safe to fly — up to 400 ft',bsub);const[ic,t,sub]=VT[d.verdict];const v=$('asverdict');v.className='verdict '+d.verdict;
 const alt=d.verdict==='unknown'?'Unknown':d.verdict==='clear'?'400 ft AGL':d.verdict==='controlled'?(d.laanc!=null?`${d.laanc} ft AGL`+(d.laanc===0?' (no automatic LAANC approval — needs further coordination/waiver)':' with LAANC approval'):'Authorization required — check FAADroneZone'):'Do not fly';
 const main=d.zones.filter(z=>z.level!=='info'),info=d.zones.filter(z=>z.level==='info');
 v.innerHTML=`<div class="vi">${ic}</div><div class="vt">${t}</div><div class="valt">Max altitude: <b>${alt}</b></div>${sub?`<p class="msg">${sub}</p>`:''}
 <p class="msg">${esc(label)} · ${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}${acc?` · ±${Math.round(acc)} m`:''}</p>
 <div class="zl">${main.length?main.map(z=>`<div class="z ${z.level}"><span class="zt">${esc(z.type)}</span><b>${esc(z.name)}</b><small>${esc(z.detail)}</small><em>${esc(z.source)}</em></div>`).join(''):'<p class="msg">No controlled, restricted or TFR zones at this point.</p>'}
 ${info.length?`<details><summary>${info.length} other airspace layer(s) above 400 ft</summary>${info.map(z=>`<div class="z info"><b>${esc(z.name)}</b><small>${esc(z.detail)}</small></div>`).join('')}</details>`:''}</div>
 ${d.errors&&d.errors.length?`<p class="warn">⚠️ Some sources failed: ${esc(d.errors.join('; '))}. Result may be incomplete.</p>`:''}<p class="msg" style="font-size:11px">Checked ${new Date(d.checkedAt).toLocaleString()} · confirm in B4UFLY/Aloft.</p>`;
 zoneL.clearLayers();main.forEach(z=>{if(z.geometry&&z.source!=='FAA UAS Facility Maps')L.geoJSON(z.geometry,{style:{color:COL[z.level],weight:2,fillOpacity:.07,dashArray:z.level==='caution'?'6 4':null}}).bindTooltip(z.type+': '+z.name).addTo(zoneL)})}
async function drawGrid(lat,lon){try{const r=await fetch(`api/airspace/grid?lat=${lat}&lon=${lon}`);const g=await r.json();gridL.clearLayers();if(!g.features)return;
 L.geoJSON(g,{style:f=>{const c=f.properties.CEILING;return{color:'#4fd1ff',weight:.6,fillColor:c===0?'#ff4d6d':c<=100?'#ffb020':c<=200?'#facc15':'#4fd1ff',fillOpacity:.13}},onEachFeature:(f,l)=>l.bindTooltip(`LAANC max ${f.properties.CEILING} ft AGL (${f.properties.APT1_FAAID||''})`)}).addTo(gridL)}catch(e){}}
window.addEventListener('load',()=>{const go=()=>{if(document.getElementById('app').style.display!=='none'){if(location.hash==='#airspace')show('airspace')}else setTimeout(go,300)};go()});
})();
