'use strict';
function richField(label,name,value) {
  return '<div class="wide rich-field"><label for="rich-'+name+'">'+esc(label)+'</label><div class="editor-tools" id="tools-'+name+'" aria-label="Formatting controls"></div><div class="rich-editor rich-text" contenteditable="true" role="textbox" aria-multiline="true" aria-label="'+esc(label)+'" id="rich-'+name+'">'+TempleRich.html(value)+'</div></div>';
}
let editorState=null;
function disposeEditor(){
  const state=editorState;editorState=null;
  if(!state)return;
  try {state.instance?.destruct();} catch {}
  state.host?.remove();
}
function bindRich(name){
  const area=$('rich-'+name), tools=$('tools-'+name), state={name,area,instance:null};
  editorState=state;
  const commands=[['Heading','formatBlock','h3'],['Bold','bold'],['Italic','italic'],['Underline','underline'],['Bullets','insertUnorderedList'],['Numbers','insertOrderedList'],['Quote','formatBlock','blockquote'],['Link','createLink'],['Image','insertImage'],['Table','table'],['Undo','undo'],['Redo','redo']];
  for(const [label,command,arg] of commands){
    const button=document.createElement('button');button.type='button';button.className='button compact secondary';button.textContent=label;
    button.onmousedown=event=>event.preventDefault();
    button.onclick=()=>{
      area.focus();
      if(command==='table'){document.execCommand('insertHTML',false,'<table><tbody><tr><th>Heading</th><th>Heading</th></tr><tr><td>Text</td><td>Text</td></tr></tbody></table><p></p>');return;}
      let value=arg;
      if(command==='createLink'||command==='insertImage'){
        const input=prompt('Enter an HTTPS URL');
        try {const u=new URL(input);if(u.protocol!=='https:'||u.username||u.password)return;value=u.href;}catch{return;}
      }
      document.execCommand(command,false,value);
    };
    tools.append(button);
  }
  area.addEventListener('paste',event=>{
    event.preventDefault();
    const plain=event.clipboardData.getData('text/plain');
    document.execCommand('insertText',false,plain);
  });
  const jodit=globalThis.Jodit;
  if(typeof jodit?.make!=='function')return;
  const host=document.createElement('div'), input=document.createElement('textarea');
  input.value=area.innerHTML;
  input.setAttribute('aria-label',area.getAttribute('aria-label'));
  host.className='jodit-field';host.append(input);area.after(host);
  try {
    state.instance=jodit.make(input,{
      minHeight:160,height:240,toolbarAdaptive:false,statusbar:false,
      askBeforePasteHTML:false,askBeforePasteFromWord:false,defaultActionOnPaste:'insert_only_text',
      buttons:['paragraph','bold','italic','underline','|','ul','ol','blockquote','link','templeImage','table','|','undo','redo'],
      controls:{templeImage:{name:'templeImage',icon:'image',tooltip:'Insert an HTTPS image',exec(editor){
        const source=prompt('Enter a direct HTTPS image URL');
        try {
          const url=new URL(source);
          if(url.protocol!=='https:'||url.username||url.password)return;
          const image=document.createElement('img');
          image.src=url.href;image.alt=prompt('Image description (optional)')||'';
          editor.s.insertHTML(image.outerHTML);editor.synchronizeValues();
        }catch{}
      }}}
    });
    state.host=host;tools.hidden=true;area.hidden=true;
  } catch {
    state.instance=null;host.remove();
  }
}
function collectRich(record){
  if(!editorState)return;
  const {name,instance,area}=editorState;
  const html=TempleRich.pack(instance?instance.value:area.innerHTML);
  if(html.length>12000)throw new Error('Formatted text is too long. Shorten it to 12,000 characters.');
  record[name]=html;
}
