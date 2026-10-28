// FAA airspace lookup (server-side proxy + verdict logic). Data: FAA ArcGIS open data + tfr.faa.gov.
const B='https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services';
const UA='DroneFootSite/1.0 (airspace check; cije.live)';
const LAYERS={
 uasfm:'FAA_UAS_FacilityMap_Data', cls:'Class_Airspace', sua:'Special_Use_Airspace', prohib:'Prohibited_Areas',
 nsufr:'DoD_Mar_13', nsufrPT:'Part_Time_National_Security_UAS_Flight_Restrictions', nda:'National_Defense_Airspace_TFR_Areas', bnd:'Boundary_Airspace'};
const cache=new Map();const cget=(k,ms)=>{const c=cache.get(k);return c&&Date.now()-c.t<ms?c.v:null};const cset=(k,v)=>{cache.set(k,{t:Date.now(),v});if(cache.size>2000)cache.delete(cache.keys().next().value)};
async function j(url,opt={},tries=3){for(let i=0;;i++){try{return await j1(url,opt)}catch(e){if(i>=tries-1||!/429|Too many|50\d|timeout|aborted/i.test(e.message))throw e;await new Promise(r=>setTimeout(r,1500*(i+1)))}}}
async function j1(url,opt={}){const r=await fetch(url,{headers:{'User-Agent':UA,...(opt.headers||{})},signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error(r.status+' '+url.split('?')[0]);const d=await r.json();if(d&&d.error)throw new Error((d.error.code||'')+' '+(d.error.message||'ArcGIS error'));return d}
const q=(layer,params)=>j(`${B}/${LAYERS[layer]}/FeatureServer/0/query?`+new URLSearchParams({f:'geojson',outFields:'*',inSR:'4326',outSR:'4326',...params}));
const pointQ=(layer,lat,lon)=>q(layer,{geometry:`${lon},${lat}`,geometryType:'esriGeometryPoint',spatialRel:'esriSpatialRelIntersects',returnGeometry:'true',maxAllowableOffset:'0.0005'});
// point in polygon for TFR feed
function inRing(pt,ring){let c=false;for(let i=0,k=ring.length-1;i<ring.length;k=i++){const[xi,yi]=ring[i],[xk,yk]=ring[k];if(((yi>pt[1])!=(yk>pt[1]))&&(pt[0]<(xk-xi)*(pt[1]-yi)/(yk-yi)+xi))c=!c}return c}
function inGeom(pt,g){if(!g)return false;const polys=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];return polys.some(p=>inRing(pt,p[0])&&!p.slice(1).some(h=>inRing(pt,h)))}
async function tfrs(){let v=cget('tfr',10*60e3);if(v)return v;
 v=await j('https://tfr.faa.gov/geoserver/TFR/ows?service=WFS&version=1.1.0&request=GetFeature&typeName=TFR:V_TFR_LOC&maxFeatures=2000&outputFormat=application/json&srsname=EPSG:4326');cset('tfr',v);return v}
const ft=(v,u,c)=>v==null||v===''||+v===-9998?'':(+v===0&&c==='SFC'?'Surface':`${v}${u==='FL'?' FL':' ft'} ${c||''}`.trim());
async function check(lat,lon){
 const key=lat.toFixed(4)+','+lon.toFixed(4);const hit=cget(key,10*60e3);if(hit)return hit;
 const names=Object.keys(LAYERS);const res=await Promise.allSettled(names.map(n=>pointQ(n,lat,lon)));
 let tfr;try{tfr=await tfrs()}catch(e){tfr={error:e.message}}
 const errors=[],zones=[];const F={};names.forEach((n,i)=>{if(res[i].status==='fulfilled')F[n]=res[i].value.features||[];else{F[n]=[];errors.push(LAYERS[n]+': '+res[i].reason.message)}});
 const add=(level,type,name,detail,geom,source)=>zones.push({level,type,name,detail,geometry:geom,source});
 // UAS Facility Map (LAANC grid)
 let laanc=null;for(const f of F.uasfm){const a=f.properties;const c=+a.CEILING;if(laanc==null||c<laanc)laanc=c;
  add('controlled','UAS Facility Map (LAANC grid)',`${a.APT1_NAME||a.APT1_FAAID||'Airport'} (${a.APT1_FAAID||''}) — Class ${a.AIRSPACE_1||'?'}`,`Max ${c} ft AGL with LAANC/authorization${a.APT1_LAANC?' · LAANC available':' · LAANC NOT available (use FAADroneZone)'}`,f.geometry,'FAA UAS Facility Maps')}
 // Class airspace
 for(const f of F.cls){const a=f.properties,cl=a.CLASS,lt=a.LOCAL_TYPE||'';if(!cl||cl==='A')continue;
  const surface=a.LOWER_CODE==='SFC'&&(!a.LOWER_VAL||+a.LOWER_VAL===0);
  if(['B','C','D'].includes(cl)||(cl==='E'&&surface&&lt==='CLASS_E2')){
   if(!surface&&['B','C'].includes(cl)){add('info','Class '+cl+' (shelf above)',a.NAME,`Floor ${ft(a.LOWER_VAL,a.LOWER_UOM,a.LOWER_CODE)} — above 400 ft AGL here in most cases`,f.geometry,'FAA Class Airspace');continue}
   add('controlled','Class '+cl+' airspace'+(surface?' (surface)':''),a.NAME,`Floor ${ft(a.LOWER_VAL,a.LOWER_UOM,a.LOWER_CODE)||'Surface'} · Ceiling ${ft(a.UPPER_VAL,a.UPPER_UOM,a.UPPER_CODE)||'—'}`,f.geometry,'FAA Class Airspace')}
  else add('info',lt.replace('_',' ')||('Class '+cl),a.NAME,`Floor ${ft(a.LOWER_VAL,a.LOWER_UOM,a.LOWER_CODE)}`,null,'FAA Class Airspace')}
 // Prohibited / special use
 const seen=new Set();for(const f of [...F.prohib,...F.sua]){const a=f.properties,t=a.TYPE_CODE;const k=a.NAME+t;if(seen.has(k))continue;seen.add(k);
  const T={P:'Prohibited Area',R:'Restricted Area',W:'Warning Area',A:'Alert Area',MOA:'Military Operations Area',D:'Danger Area'}[t]||('Special Use '+t);
  add(t==='P'||t==='R'?'restricted':'caution',T,a.NAME,`${ft(a.LOWER_VAL,a.LOWER_UOM,a.LOWER_CODE)||'Surface'} – ${ft(a.UPPER_VAL,a.UPPER_UOM,a.UPPER_CODE)} · ${a.TIMESOFUSE||''}`,f.geometry,'FAA Special Use Airspace')}
 for(const f of F.nsufr){const a=f.properties;add('restricted','National Security UAS Flight Restriction',a.Facility||a.Base,`${a.Floor||''} – ${a.Ceiling||''} · ${a.Reason||''}${a.POC?' · POC '+a.POC:''}`,f.geometry,'FAA NSUFR (full-time, 14 CFR 99.7)')}
 for(const f of F.nsufrPT){const a=f.properties;add('caution','Part-time National Security UAS Restriction',a.Facility||a.Base,`${a.Floor||''} – ${a.Ceiling||''} · ${a.ALERTYPE||'Intermittent'} — check NOTAMs for active times`,f.geometry,'FAA Part-time NSUFR')}
 for(const f of F.nda){const a=f.properties;add('restricted','National Defense Airspace TFR',a.NAME,a.WKHR_RMK||'',f.geometry,'FAA National Defense Airspace')}
 for(const f of F.bnd){const a=f.properties;if(a.LOCAL_TYPE!=='SFRA'&&a.TYPE_CODE!=='SATA')continue;const frz=/FRZ/i.test(a.SECTOR||'');
  add(frz?'restricted':'controlled',frz?'Flight Restricted Zone (FRZ)':'Special Flight Rules Area (SFRA)',`${a.NAME}${a.SECTOR?' — '+a.SECTOR:''}`,frz?'No drone flights without FAA/TSA waiver (DC FRZ: 15 nm around DCA)':'Special rules apply; authorization required',f.geometry,'FAA Boundary Airspace')}
 // TFRs
 if(tfr.features){const pt=[lon,lat];const tf=new Set();for(const f of tfr.features){if(!inGeom(pt,f.geometry))continue;const p=f.properties;const id=(p.NOTAM_KEY||'').split('-')[0];if(tf.has(id))continue;tf.add(id);
  add('restricted','Temporary Flight Restriction (TFR) — '+(p.LEGAL||''),`NOTAM ${id}`,p.TITLE||'',f.geometry,'tfr.faa.gov')}}
 else errors.push('TFR feed: '+tfr.error);
 const lv=zones.map(z=>z.level);
 const verdict=lv.includes('restricted')?'restricted':errors.length?'unknown':lv.includes('controlled')?'controlled':'clear';
 const maxAlt=verdict==='clear'?400:verdict==='controlled'?(laanc!=null?laanc:0):0;
 const out={lat,lon,verdict,maxAlt,laanc,zones,errors,checkedAt:new Date().toISOString()};if(!errors.length)cset(key,out);return out}
// LAANC grid around a point for map overlay
async function grid(lat,lon){const key='g'+lat.toFixed(2)+','+lon.toFixed(2);const c=cget(key,30*60e3);if(c)return c;const d=0.12;
 const r=await q('uasfm',{geometry:`${lon-d},${lat-d},${lon+d},${lat+d}`,geometryType:'esriGeometryEnvelope',spatialRel:'esriSpatialRelIntersects',outFields:'CEILING,APT1_FAAID',returnGeometry:'true',resultRecordCount:'2000'});cset(key,r);return r}
async function tfrList(){const t=await tfrs();return t}
async function geocode(qs){const k='q'+qs;const c=cget(k,24*3600e3);if(c)return c;
 const r=await j('https://nominatim.openstreetmap.org/search?'+new URLSearchParams({q:qs,format:'jsonv2',limit:'5',countrycodes:'us'}));const v=r.map(x=>({name:x.display_name,lat:+x.lat,lon:+x.lon}));cset(k,v);return v}
module.exports={check,grid,tfrList,geocode};
