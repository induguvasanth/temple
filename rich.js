'use strict';
(() => {
  const prefix='[[rich-html]]\n';
  const allowed=new Set('p br h2 h3 h4 strong b em i u s blockquote ul ol li a figure figcaption img table caption thead tbody tfoot tr th td'.split(' '));
  const discard=new Set('script style iframe object embed svg math template form input video audio'.split(' '));
  function clean(value) {
    const template=document.createElement('template');
    template.innerHTML=String(value??'');
    const output=document.createElement('div');
    function copy(node,parent) {
      if(node.nodeType===3){parent.append(document.createTextNode(node.data));return;}
      const tag=node.localName;
      if(!tag||discard.has(tag))return;
      if(!allowed.has(tag)){for(const child of node.childNodes)copy(child,parent);return;}
      const el=document.createElement(tag);
      if(tag==='a'||tag==='img'){
        const key=tag==='a'?'href':'src';
        try{
          const url=new URL(node.getAttribute(key)||'');
          if(url.protocol!=='https:'||url.username||url.password){if(tag==='img')return;}
          else el.setAttribute(key,url.href);
        }catch{if(tag==='img')return;}
        if(tag==='a'){el.target='_blank';el.rel='noopener noreferrer';}
        else {el.alt=node.getAttribute('alt')||'';el.loading='lazy';el.referrerPolicy='no-referrer';}
      }
      if(tag==='td'||tag==='th')for(const key of ['colspan','rowspan']){
        const n=Number(node.getAttribute(key));
        if(Number.isInteger(n)&&n>1&&n<=20)el.setAttribute(key,String(n));
      }
      for(const child of node.childNodes)copy(child,el);
      parent.append(el);
    }
    for(const node of template.content.childNodes)copy(node,output);
    return output.innerHTML;
  }
  function html(value) {
    const text=String(value??'');
    if(text.startsWith(prefix))return clean(text.slice(prefix.length));
    const p=document.createElement('p');p.textContent=text;
    return text?p.outerHTML:'';
  }
  window.TempleRich={html,clean,pack:value=>prefix+clean(value)};
})();
