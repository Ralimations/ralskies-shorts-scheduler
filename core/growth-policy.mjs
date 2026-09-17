// Deterministic rules: no model calls are used for publishing decisions.
export const GROWTH_POLICY = Object.freeze({ cadence: 'four-per-week', postsPerDay: 1, postsPerWeek: 4, cooldownDays: 7, horizonDays: 14 });
export const contentKey = row => String(row.source_song || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ').replace(/\s+fandom$/,'');
export const isRetired = row => String(row.status || '').toUpperCase() === 'RETIRED';
export function topicKey(row={}) {
  if(row.content_type==='ORIGINAL')return 'original';
  const label=[row.original_filename,row.file_name,row.source_song,row.artist_or_fandom].filter(Boolean).join(' ').toLowerCase();
  if(/broadway|hadestown|dear evan hansen|great gatsby|epic the musical/.test(label))return 'broadway';
  if(/disney/.test(label))return 'disney';
  if(/fandom|alien stage|hazbin|digital circus|kpop demon hunters/.test(label))return 'fandom';
  if(/\brock\b/.test(label))return 'rock';
  if(/\bpop\b|\bjvke\b/.test(label))return 'pop';
  return String(row.artist_or_fandom||contentKey(row)).normalize('NFKC').trim().toLowerCase();
}
function rotationAllowed(events,row,at) {
  const key=topicKey(row);
  const previous=events.filter(e=>Date.parse(e.at)<at).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at))[0];
  const next=events.filter(e=>Date.parse(e.at)>at).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))[0];
  return !key||[previous,next].every(e=>!e?.topicKey||e.topicKey!==key);
}
export function weekKey(date) {
  const day = new Date(date + 'T00:00:00Z');
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}
export function growthReservations({ eligible, events, startDate, time, now, horizonDays = 14 }) {
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > 14) throw Error('GROWTH_HORIZON_MUST_BE_1_TO_14');
  const pending = [...eligible], updates = [], occupied = [...events];
  const start = Date.parse(startDate + 'T00:00:00Z');
  for (let offset = 0; offset < horizonDays; offset++) {
    const day = new Date(start + offset * 86400000), date = day.toISOString().slice(0, 10);
    if (![1,3,5,0].includes(day.getUTCDay())) continue;
    const at = Date.parse(date + 'T' + time + ':00+08:00');
    if (at <= now || occupied.some(e => e.pht?.slice(0,10) === date)) continue;
    if (occupied.filter(e => e.pht && weekKey(e.pht.slice(0,10)) === weekKey(date)).length >= 4) continue;
    const candidates = pending.filter(row => contentKey(row) && rotationAllowed(occupied,row,at) && !occupied.some(e => e.contentKey === contentKey(row) && Math.abs(Date.parse(e.at) - at) < 7 * 86400000));
    const recent = row => Math.max(0, ...occupied.filter(e => e.contentKey === contentKey(row) && Date.parse(e.at) < at).map(e => Date.parse(e.at)));
    candidates.sort((a,b) => Number(b.content_type === 'ORIGINAL') - Number(a.content_type === 'ORIGINAL') || recent(a) - recent(b) || String(b.intake_at || '').localeCompare(String(a.intake_at || '')) || String(a.short_id).localeCompare(String(b.short_id)));
    const row = candidates[0];
    if (!row) continue;
    updates.push({ short_id: row.short_id, scheduled_date: date, scheduled_time: time, timezone: 'Asia/Manila', posting_slot: time, schedule_order: updates.length + 1, schedule_policy: 'four-per-week' });
    occupied.push({ at: new Date(at).toISOString(), pht: date + ' ' + time, contentKey: contentKey(row), topicKey:topicKey(row) });
    pending.splice(pending.indexOf(row), 1);
  }
  return { updates, deferred: pending.map(row => ({ short_id: row.short_id, reason: contentKey(row) ? 'OUTSIDE_WINDOW_COOLDOWN_OR_TOPIC_ROTATION' : 'SONG_IDENTITY_REQUIRED' })) };
}
export function assertGrowthAvailable(events, row, at) {
  const date = new Date(Date.parse(at) + 8 * 3600000).toISOString().slice(0,10);
  if (!contentKey(row)) throw Error('SONG_IDENTITY_REQUIRED:' + row.short_id);

  if (![1,3,5,0].includes(new Date(date + 'T00:00:00Z').getUTCDay())) throw Error('GROWTH_POSTING_DAY_REQUIRED');
  if (events.some(e => e.pht?.slice(0,10) === date)) throw Error('GROWTH_DAILY_LIMIT');
  if (events.filter(e => e.pht && weekKey(e.pht.slice(0,10)) === weekKey(date)).length >= 4) throw Error('GROWTH_WEEKLY_LIMIT');
  if (events.some(e => e.contentKey === contentKey(row) && Math.abs(Date.parse(e.at) - Date.parse(at)) < 7 * 86400000)) throw Error('GROWTH_SONG_COOLDOWN');
  if(!rotationAllowed(events,row,Date.parse(at)))throw Error('GROWTH_TOPIC_ROTATION');
}
