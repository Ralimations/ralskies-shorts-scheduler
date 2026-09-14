(function(global){
 let model=null,busy=false;
 function show(){
  const report=model?.report;
  const timing=(report?.timing||[]).map(row=>'<tr><td>'+esc(row.time)+'</td><td>'+row.samples+'</td><td>'+row.medianViews+'</td></tr>').join('');
  const entries=(report?.entries||[]).slice(0,20).map(row=>'<tr><td>'+esc(row.title)+'<br>'+esc(row.topic)+'</td><td>'+row.views+'</td><td>'+row.averageViewSeconds.toFixed(1)+'</td><td>'+row.likes+'</td></tr>').join('');
  setModal('Weekly analytics and creative review','<p>Read-only performance evidence for tracked videos. Nothing here changes metadata or schedules.</p>'+(!model?.authorized?'<div class="callout"><strong>Analytics permission required</strong><p>Run <code>node phase2/youtube_phase2.mjs auth</code> from the desktop folder and grant read-only Analytics access. If Google reports the API is disabled, enable YouTube Analytics API in the same Cloud project.</p></div>':'')+(report?'<p>Period: '+esc(report.startDate)+' through '+esc(report.endDate)+' (Pacific reporting dates). Retrieved '+esc(report.generatedAt)+'.</p><p>'+esc(report.limitation)+'</p><h3>Historical release times (Manila)</h3><table><thead><tr><th>Release time</th><th>Videos sampled</th><th>Median period views</th></tr></thead><tbody>'+timing+'</tbody></table><h3>Titles and topics this week</h3><table><thead><tr><th>Video</th><th>Period views</th><th>Avg. view seconds</th><th>Likes</th></tr></thead><tbody>'+entries+'</tbody></table>'+(report.review?'<h3>LLM review - suggestions only</h3><div class="metadata-text">'+esc(report.review.text)+'</div>':''):'<p>No weekly report yet. Sync Analytics after connecting. Studio audience-online heatmaps are not available through this API; use Studio as additional evidence when choosing your window.</p>'),'<button class="ghost" data-close-modal>Close</button><button class="ghost" data-analytics-sync '+(!model?.authorized||busy?'disabled':'')+'>Sync Weekly Analytics</button><button class="primary" data-analytics-review '+(!report?.entries?.length||busy?'disabled':'')+'>Ask LLM to Review Titles / Topics</button>');
 }
 async function action(target){
  if(busy)return;
  if(target.closest('[data-analytics-open]')){model=await global.ralskies.analyticsStatus();show();return;}
  busy=true;show();
  try{if(target.closest('[data-analytics-sync]'))model.report=await global.ralskies.analyticsSync();else if(target.closest('[data-analytics-review]')){notify('The local model is reviewing title and topic performance.','info');model.report=await global.ralskies.analyticsReview();}}
  finally{busy=false;show();}
 }
 global.AnalyticsView={action};
})(window);
