import fs from 'node:fs/promises';
import path from 'node:path';
export async function activityHistory(directory){
 let files;try{files=await fs.readdir(directory);}catch(e){if(e.code==='ENOENT')return {entries:[],total:0};throw e;}
 const entries=[];
 const add=(row,file,defaults={})=>entries.push({file,timestamp:String(row.timestamp||row.updated_at||row.created_at||defaults.timestamp||''),event:String(row.event||row.code||defaults.event||'JOURNAL_SNAPSHOT'),state:String(row.state||''),shortId:String(row.shortId||row.short_id||''),batchId:String(row.batchId||row.batch_id||defaults.batchId||''),executionId:String(row.executionId||row.execution_id||defaults.executionId||''),message:String(row.message||row.result||'')});
 for(const file of files.filter(name=>/^production-.*\.log$/.test(name)||/\.journal\.json$/.test(name)||name==='exceptions.json'||name==='desktop-activity.jsonl')){
  try{
   const raw=await fs.readFile(path.join(directory,file),'utf8');
   if(file.endsWith('.log')||file.endsWith('.jsonl')){for(const line of raw.split(/\r?\n/).filter(Boolean)){try{add(JSON.parse(line),file);}catch{add({event:'UNREADABLE_LOG_ENTRY',message:'A saved log line could not be parsed.'},file);}}}
   else {const value=JSON.parse(raw);if(file==='exceptions.json'){for(const row of (Array.isArray(value)?value:value.exceptions||[]))add(row,file,{event:'EXCEPTION'});}else for(const row of value.rows||[])add(row,file,{timestamp:value.created_at,batchId:value.batch_id||value.batchId,executionId:value.execution_id||value.executionId});}
  }catch(error){add({event:'HISTORY_READ_ERROR',message:error.code||'Invalid saved log'},file);}
 }
 entries.sort((a,b)=>b.timestamp.localeCompare(a.timestamp));return {entries,total:entries.length};
}

let pending=Promise.resolve();
export function appendActivity(directory,entry){
 const row={timestamp:new Date().toISOString(),event:String(entry.event),state:String(entry.state),message:String(entry.message||'')};
 const write=pending.then(async()=>{await fs.mkdir(directory,{recursive:true});await fs.appendFile(path.join(directory,'desktop-activity.jsonl'),JSON.stringify(row)+'\n');});
 pending=write.catch(()=>{});return write;
}
