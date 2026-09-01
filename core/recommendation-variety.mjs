export const HUMAN_EDIT_CANDIDATES = Object.freeze({
  'RS-A733CFED6C10': "making Meant to Be Yours everyone's emotional problem",
  'RS-81BC290BEFD0': 'when Meant to Be Yours finally opens up',
  'RS-7C36BD289C24': "Can't Help Falling in Love | Elvis Presley Cover",
  'RS-1FE31531FECC': "this Can't Help Falling in Love moment still hits",
  'RS-FF293C685C10': "making Can't Help Falling in Love everyone's problem",
  'RS-91146360CD9D': 'this Out of My League moment still hits',
  'RS-84D1A758E198': "when Can't Help Falling in Love stops being polite"
});
const HOOKS = Object.freeze(['when {song} finally opens up','I love this part of {song}','{song}, but this is the part I wait for']);
export function variedHook(row,index=0){const hook=HOOKS[index%HOOKS.length];return hook.replaceAll('{song}',row.source_song||'this song');}
