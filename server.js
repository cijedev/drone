const express=require('express'),multer=require('multer'),cookieParser=require('cookie-parser');
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFile}=require('child_process');
const PORT=process.env.PORT||3000, ROOT=__dirname;
const DATA=path.join(ROOT,'data'),UP=path.join(ROOT,'uploads'),TH=path.join(ROOT,'thumbs');
[DATA,UP,TH].forEach(d=>fs.mkdirSync(d,{recursive:true}));
let PASS=process.env.ADMIN_PASSWORD;
const pf=path.join(DATA,'admin-password.txt');
if(!PASS){ if(fs.existsSync(pf)) PASS=fs.readFileSync(pf,'utf8').trim(); else {PASS=crypto.randomBytes(9).toString('base64url');fs.writeFileSync(pf,PASS,{mode:0o600});} console.log('Admin password:',PASS);}
const DB=path.join(DATA,'videos.json');
const load=()=>fs.existsSync(DB)?JSON.parse(fs.readFileSync(DB)):[];
const save=v=>fs.writeFileSync(DB,JSON.stringify(v,null,2));
const sessions=new Set();
const MUSIC=JSON.parse(fs.readFileSync(path.join(ROOT,'public','music','tracks.json'))).map(t=>t.id);const mus=m=>MUSIC.includes(m)?m:'';
const app=express();app.use(express.json());app.use(cookieParser());
const auth=(q,r,n)=>sessions.has(q.cookies.sid)?n():r.status(401).json({error:'unauthorized'});
app.post('/api/login',(q,r)=>{const a=Buffer.from(String(q.body.password||'')),b=Buffer.from(PASS);
 if(a.length===b.length&&crypto.timingSafeEqual(a,b)){const s=crypto.randomBytes(24).toString('hex');sessions.add(s);r.cookie('sid',s,{httpOnly:true,sameSite:'strict',maxAge:7*864e5});return r.json({ok:1});}
 setTimeout(()=>r.status(401).json({error:'Wrong password'}),800);});
app.post('/api/logout',(q,r)=>{sessions.delete(q.cookies.sid);r.clearCookie('sid');r.json({ok:1});});
app.get('/api/me',(q,r)=>r.json({admin:sessions.has(q.cookies.sid)}));
app.get('/api/videos',(q,r)=>r.json(load().sort((a,b)=>b.date.localeCompare(a.date))));
const upload=multer({storage:multer.diskStorage({destination:UP,filename:(q,f,cb)=>cb(null,crypto.randomBytes(8).toString('hex')+path.extname(f.originalname).toLowerCase())}),
 limits:{fileSize:20*1024**3},fileFilter:(q,f,cb)=>cb(null,/^video\//.test(f.mimetype)||/\.(mp4|mov|webm|mkv|m4v)$/i.test(f.originalname))});
const probe=f=>new Promise(res=>execFile('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',f],(e,o)=>res(e?0:parseFloat(o)||0)));
const thumb=(f,out,t)=>new Promise(res=>execFile('ffmpeg',['-y','-ss',String(t),'-i',f,'-frames:v','1','-vf','scale=960:-2','-q:v','3',out],e=>res(!e)));
app.post('/api/videos',auth,upload.single('video'),async(q,r)=>{
 if(!q.file) return r.status(400).json({error:'No video file'});
 const id=path.parse(q.file.filename).name,fp=q.file.path,dur=await probe(fp);
 const tn=id+'.jpg',ok=await thumb(fp,path.join(TH,tn),Math.min(3,dur/3||0));
 const v={id,file:q.file.filename,thumb:ok?tn:null,title:q.body.title||q.file.originalname,description:q.body.description||'',location:q.body.location||'',music:mus(q.body.music),duration:dur,size:q.file.size,date:new Date().toISOString()};
 const all=load();all.push(v);save(all);r.json(v);});
app.put('/api/videos/:id',auth,(q,r)=>{const all=load(),v=all.find(x=>x.id===q.params.id);if(!v)return r.sendStatus(404);
 ['title','description','location'].forEach(k=>{if(typeof q.body[k]==='string')v[k]=q.body[k]});if(typeof q.body.music==='string')v.music=mus(q.body.music);save(all);r.json(v);});
app.delete('/api/videos/:id',auth,(q,r)=>{let all=load();const v=all.find(x=>x.id===q.params.id);if(!v)return r.sendStatus(404);
 fs.rmSync(path.join(UP,v.file),{force:true});if(v.thumb)fs.rmSync(path.join(TH,v.thumb),{force:true});save(all.filter(x=>x!==v));r.json({ok:1});});
const AS=require('./airspace');const num=(v,a,b)=>{v=parseFloat(v);return isFinite(v)&&v>=a&&v<=b?v:null};
app.get('/api/airspace/check',auth,async(q,r)=>{const lat=num(q.query.lat,-90,90),lon=num(q.query.lon,-180,180);if(lat==null||lon==null)return r.status(400).json({error:'bad coords'});try{r.json(await AS.check(lat,lon))}catch(e){r.status(502).json({error:e.message})}});
app.get('/api/airspace/grid',auth,async(q,r)=>{const lat=num(q.query.lat,-90,90),lon=num(q.query.lon,-180,180);if(lat==null||lon==null)return r.status(400).json({error:'bad coords'});try{r.json(await AS.grid(lat,lon))}catch(e){r.status(502).json({error:e.message})}});
app.get('/api/airspace/tfrs',auth,async(q,r)=>{try{r.json(await AS.tfrList())}catch(e){r.status(502).json({error:e.message})}});
app.get('/api/airspace/geocode',auth,async(q,r)=>{const s=String(q.query.q||'').slice(0,200).trim();if(!s)return r.json([]);try{r.json(await AS.geocode(s))}catch(e){r.status(502).json({error:e.message})}});
app.use('/media',express.static(UP,{maxAge:'7d'}));app.use('/thumbs',express.static(TH,{maxAge:'7d'}));
// --- Share pages: server-rendered meta for gallery and /v/:id ---
const INDEX=path.join(ROOT,'public','index.html');
const hesc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const slugify=t=>String(t||'').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').trim().replace(/[\s_]+/g,'-').replace(/-+/g,'-').slice(0,60);
const vpath=v=>'v/'+v.id+(slugify(v.title)?'-'+slugify(v.title):'');
function publicBase(q){if(process.env.PUBLIC_URL)return process.env.PUBLIC_URL.replace(/\/+$/,'')+'/';
 const proto=(q.get('x-forwarded-proto')||q.protocol).split(',')[0],host=(q.get('x-forwarded-host')||q.get('host')).split(',')[0],pre=(q.get('x-forwarded-prefix')||'').replace(/\/+$/,'');return `${proto}://${host}${pre}/`}
function renderIndex(q,r,v){const B=publicBase(q);const base=new URL(B).pathname;const html=fs.readFileSync(INDEX,'utf8');
 const title=v?`${String(v.title).trim()} — DroneFoot`:'DroneFoot — Drone Footage';
 const desc=v?(v.description||`Drone footage${v.location?' from '+v.location:''} on DroneFoot`):'DroneFoot — aerial drone footage gallery. Landscapes, coastlines and cities captured from the sky.';
 const url=v?B+vpath(v):B;const lead=v||load().filter(x=>x.thumb).sort((a,b)=>b.date.localeCompare(a.date))[0];const img=lead&&lead.thumb?B+'thumbs/'+lead.thumb:null;
 const m=[base?`<base href="${base}">`:'',`<title>${hesc(title)}</title>`,`<meta name="description" content="${hesc(desc)}">`,`<link rel="canonical" href="${hesc(url)}">`,
  `<meta property="og:site_name" content="DroneFoot">`,`<meta property="og:type" content="${v?'video.other':'website'}">`,`<meta property="og:title" content="${hesc(title)}">`,`<meta property="og:description" content="${hesc(desc)}">`,`<meta property="og:url" content="${hesc(url)}">`,
  img?`<meta property="og:image" content="${hesc(img)}"><meta property="og:image:secure_url" content="${hesc(img)}"><meta property="og:image:width" content="960"><meta property="og:image:height" content="540"><meta property="og:image:alt" content="${hesc(lead.title)}">`:'',
  v?`<meta property="og:video" content="${hesc(B+'media/'+v.file)}"><meta property="og:video:secure_url" content="${hesc(B+'media/'+v.file)}"><meta property="og:video:type" content="video/mp4"><meta property="og:video:width" content="1920"><meta property="og:video:height" content="1080">`:'',
  v&&v.date?`<meta property="video:release_date" content="${hesc(v.date)}">`:'',
  `<meta name="twitter:card" content="${img?'summary_large_image':'summary'}">`,`<meta name="twitter:title" content="${hesc(title)}">`,`<meta name="twitter:description" content="${hesc(desc)}">`,img?`<meta name="twitter:image" content="${hesc(img)}"><meta name="twitter:image:alt" content="${hesc(lead.title)}">`:''].join('');
 r.set('Cache-Control','no-cache').type('html').send(html.replace(/<!--META-->[\s\S]*?<!--\/META-->/,m))}
app.get(['/','/index.html'],(q,r)=>renderIndex(q,r,null));
app.get('/v/:slug',(q,r)=>{const id=(q.params.slug.match(/^[0-9a-f]{16}/)||[])[0];const v=id&&load().find(x=>x.id===id);
 if(!v){r.status(404);return renderIndex(q,r,null)}
 renderIndex(q,r,v)});
app.get('/admin',(q,r)=>r.sendFile(path.join(ROOT,'public','admin.html')));
app.use(express.static(path.join(ROOT,'public')));
app.use((e,q,r,n)=>r.status(500).json({error:e.message}));
const srv=app.listen(PORT,process.env.HOST||'0.0.0.0',()=>console.log('Drone site on http://localhost:'+PORT));srv.requestTimeout=0;srv.timeout=0;
