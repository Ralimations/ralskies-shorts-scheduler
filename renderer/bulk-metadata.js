(function(global){
 let audit=null,item=null,saving=false;
 const labels={public_title:'Title',description:'Description',youtube_tags:'Keyword tags',hashtags:'Description hashtags',related_video_id:'Related video ID'};
 function problemsHtml(problems){return problems.map(issue=>'<p><strong>'+esc(issue.message)+'</strong><br>'+esc(issue.solution)+'</p>').join('');}
 async function openAudit(){audit=await global.ralskies.bulkMetadataAudit(state.selectedBatch);showAudit();}
 function showAudit(){
  const rows=audit.items.map(row=>'<tr><td>'+esc(row.shortId)+'<br>'+esc(row.song)+'</td><td>'+esc(row.status)+'</td><td>'+row.values.public_title.length+'/100</td><td>'+((row.problems.length||row.manifestProblems.length)?esc([...new Set([...row.problems,...row.manifestProblems].map(p=>p.code))].join(', ')):'No format errors')+(row.differences.length?'<br>Manifest differs from tracker':'')+'</td><td><button class="ghost" data-bulk-meta-edit="'+esc(row.shortId)+'">Review / Edit</button></td></tr>').join('');
  setModal(audit.batchId+' · Check Metadata','<p>'+audit.items.length+' rows checked. '+audit.problemCount+' rows need format corrections; '+audit.differenceCount+' have differences between files.</p><p>The tracker supplies metadata for uploads. Review folder-manifest edits here before copying them to the tracker.</p><p class="subtle">Manifest: '+esc(audit.manifestPath)+'</p><table><thead><tr><th>Video</th><th>Status</th><th>Title length</th><th>Findings</th><th>Action</th></tr></thead><tbody>'+rows+'</tbody></table>','<button class="ghost" data-close-modal>Close</button><button class="ghost" data-bulk-meta-audit>Check Again</button>');
 }
 function showEditor(id){
  item=audit.items.find(row=>row.shortId===id);if(!item)throw Error('Select a metadata row.');
  const differences=item.differences.map(d=>'<details><summary>'+esc(labels[d.field])+': manifest differs</summary><p><strong>Tracker</strong></p><pre class="metadata-text">'+esc(d.tracker)+'</pre><p><strong>Folder manifest</strong></p><pre class="metadata-text">'+esc(d.manifest)+'</pre>'+(item.editable?'<button class="ghost" data-bulk-meta-source="'+esc(d.field)+'">Use Manifest Value in Editor</button>':'')+'</details>').join('');
  const fields=Object.entries(labels).map(([key,label])=>'<label>'+label+(key==='youtube_tags'?' (comma separated)':'')+(key==='related_video_id'?' (optional)':'')+(key==='description'?'<textarea rows="5" id="bulk-edit-'+key+'" '+(item.editable?'':'readonly')+'>'+esc(item.values[key])+'</textarea>':'<input id="bulk-edit-'+key+'" value="'+esc(item.values[key])+'" '+(item.editable?'':'readonly')+'>')+'</label>').join('');
  setModal(item.song+' · Metadata','<p>'+esc(item.shortId)+'</p>'+(!item.editable?'<div class="callout">'+esc(item.readonlyReason)+'</div>':'')+problemsHtml(item.problems)+differences+fields+'<div id="bulk-edit-validation" role="status"></div><p>Save changes to the local tracker used by the app. Folder manifests are reference copies and are not overwritten. YouTube changes happen only through your separate production review.</p>', '<button class="ghost" data-bulk-meta-back>Back to Checks</button>'+(item.suggestedTitle&&item.editable?'<button class="ghost" data-bulk-meta-shorten>Try Removing Trailing Hashtags</button>':'')+(item.editable?'<button class="primary" data-bulk-meta-save>Save to Tracker</button>':''));
  updateValidation();
 }
 function values(){return Object.fromEntries(Object.keys(labels).map(key=>[key,$('#bulk-edit-'+key).value]));}
 function updateValidation(){
  if(!$('#bulk-edit-validation'))return;
  const v=values(),issues=[],tags=v.youtube_tags.split(',').map(s=>s.trim()).filter(Boolean),size=tags.join(',').length+tags.filter(s=>s.includes(' ')).length*2,bytes=new Blob([v.description]).size;
  if(!v.public_title.trim()||v.public_title.length>100||/[<>]/.test(v.public_title))issues.push('Title: enter 1–100 characters, without < or >.');
  if(!v.description.trim()||bytes>5000||/[<>]/.test(v.description))issues.push('Description: enter text within 5,000 UTF-8 bytes, without < or >.');
  if(!tags.length||size>500)issues.push('Tags: provide comma-separated keywords within the 500-character allowance.');
  if(v.related_video_id.trim()&&!/^[A-Za-z0-9_-]{11}$/.test(v.related_video_id))issues.push('Related video: enter only the 11-character ID.');
  $('#bulk-edit-validation').innerHTML='<p>Title: '+v.public_title.length+'/100 · Description: '+bytes+'/5,000 bytes · Tags: '+size+'/500</p>'+issues.map(s=>'<p class="error-box">'+esc(s)+'</p>').join('');
  const save=$('[data-bulk-meta-save]');if(save)save.disabled=saving||issues.length>0;
 }
 async function action(target){
  if(target.closest('[data-bulk-meta-audit]')){await openAudit();return;}
  const edit=target.closest('[data-bulk-meta-edit]');if(edit){showEditor(edit.dataset.bulkMetaEdit);return;}
  if(target.closest('[data-bulk-meta-back]')){showAudit();return;}
  const source=target.closest('[data-bulk-meta-source]');if(source){const key=source.dataset.bulkMetaSource;$('#bulk-edit-'+key).value=item.sourceValues[key];updateValidation();return;}
  if(target.closest('[data-bulk-meta-shorten]')){$('#bulk-edit-public_title').value=item.suggestedTitle;updateValidation();return;}
  if(target.closest('[data-bulk-meta-save]')){
   if(saving)return;saving=true;updateValidation();
   try{await global.ralskies.bulkMetadataSave({batchId:audit.batchId,shortId:item.shortId,revision:item.revision,edits:values()});notify('Metadata saved to the tracker. Reopen production review before applying.');await openAudit();}
   catch(error){notify(error.message,'error');}finally{saving=false;updateValidation();}
  }
 }
 document.addEventListener('input',event=>{if(event.target.id?.startsWith('bulk-edit-'))updateValidation();});
 global.BulkMetadata={action,openAudit};
})(window);
