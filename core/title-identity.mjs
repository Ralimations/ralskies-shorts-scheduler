// Titles are compared deterministically; the model only writes creative text.
export const titleKey = value => String(value || '').normalize('NFKC').toLowerCase().replace(/#[\p{L}\p{N}_]+/gu,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
export function assertUniqueTitle(rows, shortId, title) {
  const key=titleKey(title);
  if(!key)throw Error('TITLE_REQUIRED');
  if(rows.some(row=>String(row.short_id)!==String(shortId)&&titleKey(row.public_title)===key))throw Error('TITLE_ALREADY_USED');
}
