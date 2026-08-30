const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('node:fs'); const path = require('node:path'); const crypto = require('node:crypto');
const ROOT = path.resolve(__dirname, '..');
const PROJECT = __dirname;
const OUT = path.join(PROJECT, 'outputs', 'ralskies-content-engine');
const STATE = path.join(OUT, 'phase2_upload_state.json');
const INSPECT = path.join(OUT, 'Ralskies_Upload_Tracker.xlsx.inspect.ndjson');
const SETTINGS = path.join(OUT, 'desktop_settings.json');
function walk(dir){let out=[]; for(const e of fs.readdirSync(dir,{withFileTypes:true})){const f=path.join(dir,e.name); if(e.isDirectory()&&e.name!=='node_modules'&&!f.includes(`${path.sep}.git${path.sep}`))out.push(...walk(f)); else if(e.isFile()&&e.name.toLowerCase().endsWith('.mp4'))out.push(f)} return out}
function digest(file){return new Promise((ok,no)=>{const h=crypto.createHash('sha256');fs.createReadStream(file).on('error',no).on('data',x=>h.update(x)).on('end',()=>ok(h.digest('hex')))})}
function dashboard(){if(!fs.existsSync(INSPECT))return {}; const lines=fs.readFileSync(INSPECT,'utf8').split(/\r?\n/).filter(Boolean); const t=lines.map(x=>JSON.parse(x)).find(x=>x.kind==='table'&&x.sheet==='Dashboard'); const r={}; for(const row of t?.values||[])if(row?.[0])r[String(row[0])]=row[1]; return r}
async function inventory(){const files=await Promise.all(walk(ROOT).map(async file=>({file:path.relative(ROOT,file),name:path.basename(file),hash:await digest(file),size:fs.statSync(file).size,status:'REVIEW'}))); const state=fs.existsSync(STATE)?JSON.parse(fs.readFileSync(STATE,'utf8')):{}; return {files,dashboard:dashboard(),state,scannedAt:new Date().toISOString()}}
ipcMain.handle('engine:inventory',inventory);
ipcMain.handle('engine:calendar',()=>{const file=path.join(OUT,'prepared_queue.json'); return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):[]});
ipcMain.handle('engine:settings',()=>fs.existsSync(SETTINGS)?JSON.parse(fs.readFileSync(SETTINGS,'utf8')):{timezone:'Asia/Manila',slots:['17:30','22:30'],optionalSlot:'01:30',protectedWindow:'20:00–21:00',shortsPerDay:2,dryRun:true});
ipcMain.handle('engine:save-settings',(_e,settings)=>{fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(SETTINGS,JSON.stringify(settings,null,2));return settings});
ipcMain.handle('engine:choose-folder',()=>dialog.showOpenDialogSync({properties:['openDirectory']})?.[0]||null);
ipcMain.handle('engine:dry-run',(_e,action)=>({action,dryRun:true,message:'No files, tracker rows, or YouTube resources were modified.'}));
function createWindow(){const win=new BrowserWindow({width:1440,height:930,minWidth:1100,minHeight:700,backgroundColor:'#0b1020',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false}});win.loadFile(path.join(__dirname,'renderer','index.html'))}
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow()})}); app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
