export function titleIssue(value) {
  if(typeof value!=='string'||!value.trim())return 'TITLE_EMPTY';
  if(value.length>100)return 'TITLE_TOO_LONG:'+value.length+'/100';
  if(/[<>]/.test(value))return 'TITLE_CONTAINS_ANGLE_BRACKET';
  return null;
}
export function planTitleIssues(plan) {
  return (plan.operations||[]).flatMap(op=>{const code=titleIssue(op.finalTitle);return code?[{shortId:op.shortId,code}]:[];});
}
export function assertPlanTitles(plan) {
  const issues=planTitleIssues(plan);
  if(issues.length)throw Error('INVALID_VIDEO_TITLES: '+issues.map(item=>item.shortId+' '+item.code).join('; '));
}
export function assertVideoTitle(title) {
  const issue=titleIssue(title);if(issue)throw Error('INVALID_VIDEO_TITLE: '+issue);
}
