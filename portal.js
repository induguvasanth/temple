'use strict';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const money=paise=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(Number(paise)/100);
const drive=id=>/^[A-Za-z0-9_-]+$/.test(id||'')?'https://drive.google.com/file/d/'+id+'/view':'';
const modal=$('modal');
let token='',expires=0,expiryTimer,activityTimer,lastTouch=0,tables={},active='Finance',page=0,uploading=false;
const titles={Finance:'Financial transactions',Giving:'Donation history',Donors:'Donor profiles',Sections:'Navigation sections',Content:'Devotee site editor',Requests:'Seva requests',Audit:'Audit log'};
const opt=(items,value)=>items.map(item=>{
  const [id,label]=Array.isArray(item)?item:[item,item];
  return '<option value="'+esc(id)+'" '+(String(id)===String(value)?'selected':'')+'>'+esc(label)+'</option>';
}).join('');
const message=(form,text)=>{form.querySelector('.notice').textContent=text;};
function rpc(action,data={}) {
  return new Promise((resolve,reject)=>{
    if(!globalThis.google?.script?.run) {reject(new Error('Open the deployed Apps Script portal.'));return;}
    google.script.run.withSuccessHandler(resolve).withFailureHandler(error=>{
      const text=String(error?.message||'Request failed.').replace(/^Exception:\s*/,'');
      if(/session has expired/i.test(text)) clearSession(text);
      reject(new Error(text));
    }).portal(action,{...data,token});
  });
}
function formAction(form,action) {
  let submitting=false;
  form.onsubmit=async event=>{
    event.preventDefault();
    if(submitting) return;
    const data=Object.fromEntries(new FormData(form));
    const buttons=[...form.querySelectorAll('button:not([type]),button[type="submit"],input[type="submit"]')].filter(button=>!button.disabled);
    submitting=true;
    buttons.forEach(button=>{button.disabled=true;});
    message(form,'');
    try {await action(data,form,event.submitter?.value);}
    catch(error) {message(form,error.message);}
    finally {
      buttons.forEach(button=>{button.disabled=false;});
      submitting=false;
    }
  };
}
function show(title,body) {
  disposeEditor();
  $('modalBody').onclick=null;
  $('modalTitle').textContent=title;$('modalBody').innerHTML=body;
  if(!modal.open) modal.showModal();
}
$('close').onclick=()=>{if(!uploading) modal.close();};
modal.addEventListener('close',()=>{if(!modal.open)disposeEditor();});
modal.addEventListener('cancel',e=>{if(uploading) e.preventDefault();});
function storeSession(value) {try{sessionStorage.setItem('temple-token',value);}catch{}}
function clearSession(text='') {
  token='';expires=0;lastTouch=0;tables={};page=0;storeSession('');
  clearTimeout(expiryTimer);clearTimeout(activityTimer);
  $('records').replaceChildren();$('stats').replaceChildren();$('sectionFilter').replaceChildren();
  $('workspace').hidden=true;$('logout').hidden=true;$('login').hidden=false;$('global').textContent=text;
  if(modal.open) modal.close();
  $('modalBody').replaceChildren();
}
function setExpiry(time) {
  expires=time;clearTimeout(expiryTimer);
  expiryTimer=setTimeout(()=>clearSession('Signed out after two hours of inactivity.'),Math.max(0,time-Date.now()));
}
function noteActivity() {
  if(!token) return;
  if(Date.now()>=expires) {clearSession('Your session has expired. Sign in again.');return;}
  if(activityTimer) return;
  const session=token;
  activityTimer=setTimeout(async ()=>{
    activityTimer=null;
    if(token!==session) return;
    try {const data=await rpc('touch');if(token===session){lastTouch=Date.now();setExpiry(data.expires);}} catch {}
  },Math.max(0,10000-(Date.now()-lastTouch)));
}
for(const event of ['pointerdown','keydown','wheel','touchstart']) document.addEventListener(event,noteActivity,{passive:true});
async function refresh() {
  const session=token,data=await rpc('snapshot');
  if(token!==session) return;
  tables=data.tables;setExpiry(data.expires);
  $('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;$('global').textContent='';
  render();
}
$('logout').onclick=()=>{
  const ending=rpc('logout');
  clearSession('Signed out.');
  ending.catch(()=>{$('global').textContent='Signed out on this device. The server session will expire automatically.';});
};
formAction($('loginForm'),async ({password},form)=>{
  const session=await rpc('login',{password});
  token=session.token;storeSession(token);form.reset();setExpiry(session.expires);
  await refresh();
});
$('forgot').onclick=()=>{
  show('Reset administrator password','<p>Send a six-digit code to the recovery email configured for this temple.</p><form class="form" id="sendOtp"><button class="button">Send code</button><p class="notice" role="status"></p></form><hr><form class="form" id="resetOtp"><label>Verification code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><label>New password<input name="password" type="password" autocomplete="new-password" minlength="16" maxlength="128" required></label><label>Confirm password<input name="confirm" type="password" autocomplete="new-password" minlength="16" maxlength="128" required></label><button class="button secondary">Set new password</button><p class="notice" role="status"></p></form>');
  formAction($('sendOtp'),async(_,form)=>{await rpc('sendOtp');message(form,'Code sent. Check the configured recovery inbox.');});
  formAction($('resetOtp'),async data=>{
    if(data.password!==data.confirm) throw new Error('The passwords do not match.');
    await rpc('reset',{code:data.code,password:data.password});
    clearSession('Password reset. Sign in with your new password.');
  });
};
function field(label,name,value='',attrs='',wide=false) {
  return '<label class="'+(wide?'wide':'')+'">'+esc(label)+'<input name="'+name+'" value="'+esc(value)+'" '+attrs+'></label>';
}
function area(label,name,value='',max=12000) {return '<label class="wide">'+esc(label)+'<textarea name="'+name+'" maxlength="'+max+'">'+esc(value)+'</textarea></label>';}
function select(label,name,items,value,required=true) {return '<label>'+esc(label)+'<select name="'+name+'"'+(required?' required':'')+'>'+opt(items,value)+'</select></label>';}
function attachment(label,id) {
  return '<div class="wide">'+field(label,'file','','type="file"')+
    (drive(id)?'<div class="actions"><a href="'+drive(id)+'" target="_blank" rel="noopener noreferrer">Current attachment ↗</a><label class="checkbox"><input type="checkbox" name="removeFile"> Remove current attachment</label></div>':'')+
    '<small class="muted">Up to 8 MB. Use YouTube or an HTTPS link for larger media.</small></div>';
}
function file64(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);
    reader.onerror=()=>reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}
function openEditor(row={}) {
  const table=active, sectionOptions=(tables.Sections||[]).map(r=>[r.id,r.title]);
  let fields='';
  if(table==='Finance') fields=
    select('Transaction type','type',['Donation','Expense'],row.type)+select('Donor profile','donorId',[['','Unassigned'],...(tables.Donors||[]).map(d=>[d.id,d.name+(d.phone?' · '+d.phone:'')]),...(row.donorId&&!(tables.Donors||[]).some(d=>d.id===row.donorId)?[[row.donorId,'Archived donor']]:[])],row.donorId,false)+field('Transaction date','date',row.date||day(),'type="date" required')+
    field('Amount in ₹','amount',row.amountPaise?(Number(row.amountPaise)/100).toFixed(2):'','inputmode="decimal" maxlength="12" required')+
    field('Category','category',row.category,'maxlength="140" list="txCategories" required')+'<datalist id="txCategories"></datalist>'+select('Payment method','method',['Cash','UPI','Bank transfer','Card','Cheque','Other'],row.method)+
    field('Reference number','reference',row.reference,'maxlength="120"')+field('Paid by or to','party',row.party,'maxlength="150"',true)+
    richField('Private finance notes','notes',row.notes)+select('Donor consent: show name and public note','publishDonor',['No','Yes'],row.publishDonor||'No')+field('Public donor note (only if consent is Yes)','publicNote',row.publicNote||'','maxlength="350"')+attachment('Receipt file',row.receipt)+select('Status','status',row.status==='Review'?['Review','Active','Inactive']:['Active','Inactive'],row.status)+
    (row.recordedBy?'<p class="muted">Recorded by '+esc(row.recordedBy)+'</p>':'');
  if(table==='Donors') {
    const prior=[...new Set((tables.Finance||[]).filter(x=>x.type==='Donation'&&x.party).map(x=>x.party))].sort();
    fields=field('Donor name','name',row.name,'maxlength="140" list="donorNames" required',true)+
      '<datalist id="donorNames">'+opt(prior)+'</datalist>'+
      field('Phone','phone',row.phone,'type="tel" maxlength="40"')+field('Email','email',row.email,'type="email" maxlength="254"')+area('Private notes','notes',row.notes);
  }
  if(table==='Sections') fields=field('Section title','title',row.title,'maxlength="140" required')+
    field('Navigation slug','slug',row.slug,'pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="50" required')+
    area('Section introduction','summary',row.summary,1500)+field('Sort order','order',row.order||0,'type="number" min="0" max="99999" required')+
    select('Visibility','status',['Draft','Published'],row.status);
  if(table==='Content') {
    if(!sectionOptions.length) {show('Add a section first','<p>Create a navigation section before adding its content.</p>');return;}
    fields=select('Section','section',sectionOptions,row.section||$('sectionFilter').value)+field('Title','title',row.title,'maxlength="140" required')+
      richField('Public description or article','body',row.body)+field('Date','date',row.date,'type="date"')+
      field('Time, price or short label','extra',row.extra,'maxlength="300"')+field('HTTPS link','url',row.url,'type="url" maxlength="1000"',true)+
      attachment('Media or document',row.media)+field('Sort order','order',row.order||0,'type="number" min="0" max="99999" required')+select('Visibility','status',['Draft','Published'],row.status);
  }
  if(table==='Requests') fields='<div class="wide"><strong>'+esc(row.service)+'</strong><p>'+esc(row.name)+' · '+esc(row.date)+'</p><p>'+esc(row.note)+'</p></div>'+
    select('Request status','status',['Pending','Confirmed','Declined'],row.status);
  const heading={Finance:'transaction',Donors:'donor',Sections:'section',Content:'content',Requests:'request'};
  show((row.id?'Edit ':'Add ')+heading[table],'<form id="editor" class="form cols">'+fields+'<p class="notice wide" role="status"></p><div class="actions wide"><button class="button" value="save">Save</button><button class="button secondary" value="another">Save and add another</button><button class="button secondary" value="continue">Save and continue editing</button></div></form>');
  if(table==='Finance') {
    bindRich('notes');
    const form=$('editor'), toggle=()=>{
      form.elements.donorId.disabled=form.elements.type.value!=='Donation';
      const categories=[...new Set((tables.Finance||[]).filter(r=>r.type===form.elements.type.value&&r.category).map(r=>r.category))].sort();
      $('txCategories').innerHTML=opt(categories);
    };
    form.elements.type.onchange=toggle;toggle();
  }
  if(table==='Content') bindRich('body');
  const requestId=table==='Finance'&&!row.id?crypto.randomUUID():'';
  formAction($('editor'),async (record,form,next)=>{
    collectRich(record);
    const selected=form.elements.file?.files[0];
    let file;
    if(selected) {
      if(selected.size>8*1024*1024||!selected.size) throw new Error('Choose a file up to 8 MB.');
      file={name:selected.name,type:selected.type,base64:await file64(selected)};
    }
    delete record.file;
    const saved=await rpc('save',{table,requestId,record:{...record,id:row.id||'',updated:row.updated||''},file:file||null});
    modal.close();await refresh();
    if(next==='continue') openEditor(saved);
    if(next==='another') openEditor(table==='Content'?{section:saved.section}:{});

  });
}
function confirmDelete(row) {
  const table=active;
  show('Delete record','<p>Remove '+esc(row.title||row.category||row.name)+' from the portal? Enter the deletion password configured in Script Properties.</p><form class="form" id="deleteForm">'+field('Deletion password','password','','type="password" autocomplete="off" required')+'<button class="button">Delete record</button><p class="notice" role="status"></p></form>');
  formAction($('deleteForm'),async ({password})=>{
    await rpc('delete',{table,id:row.id,updated:row.updated,password});
    modal.close();await refresh();
  });
}
function openYouTube() {
  const videoSection=(tables.Sections||[]).find(r=>r.slug==='videos');
  if(!videoSection) {show('Create a Videos section','<p>Add a navigation section with the slug “videos” first.</p>');return;}
  show('Upload to YouTube','<p>Select a video up to 1 GB. The upload goes to the channel authorized by the Apps Script owner.</p><form id="youtubeForm" class="form">'+
    field('Video file','video','','type="file" accept="video/*" required')+field('Title','title','','maxlength="100" required')+area('Description','description','',4500)+
    select('YouTube visibility','privacy',['private','unlisted','public'],'private')+
    select('Made for kids','audience',[['','Choose an audience'],['no','No'],['yes','Yes']],'')+
    '<progress id="uploadProgress" max="1" value="0" hidden></progress><p class="notice" role="status"></p><button class="button">Start upload</button></form>');
  formAction($('youtubeForm'),async(data,form)=>{
    const file=form.elements.video.files[0];
    if(!file||file.size>1024*1024*1024) throw new Error('Select a video up to 1 GB.');
    uploading=true;$('close').disabled=true;
    const progress=$('uploadProgress');progress.hidden=false;
    try {
      const start=await rpc('youtubeStart',{title:data.title,description:data.description,privacy:data.privacy,forKids:data.audience==='yes',size:file.size,mime:file.type});
      let offset=0,result,repeats=0;
      while(offset<file.size) {
        const base64=await file64(file.slice(offset,offset+start.chunkSize));
        result=await rpc('youtubeChunk',{upload:start.upload,offset,base64});
        repeats=result.offset===offset?repeats+1:0;
        if(repeats>2) throw new Error('The upload stopped making progress. Check YouTube Studio before retrying.');
        offset=result.offset;progress.value=offset/file.size;
      }
      if(!result?.videoId) throw new Error('YouTube did not confirm the video. Check YouTube Studio.');
      try {
        await rpc('save',{table:'Content',record:{section:videoSection.id,title:data.title,body:data.description,url:result.url,order:0,status:'Draft'}});
      } catch(error) {
        show('Video uploaded','<p>The draft could not be saved. Add the video link manually from Section content.</p><p><a href="'+esc(result.url)+'" target="_blank" rel="noopener noreferrer">'+esc(result.url)+'</a></p><p class="notice">'+esc(error.message)+'</p>');
        return;
      }
      show('Video uploaded','<p>A draft video entry was added to the Videos section.</p><a href="'+esc(result.url)+'" target="_blank" rel="noopener noreferrer">View on YouTube ↗</a>');
      await refresh();
    } finally {uploading=false;$('close').disabled=false;}
  });
}
function openHistory(donor) {
  const normalized=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
  const all=(tables.Finance||[]).filter(r=>r.type==='Donation').sort((a,b)=>b.date.localeCompare(a.date));
  const linked=all.filter(r=>r.donorId===donor.id);
  const possible=all.filter(r=>!r.donorId&&normalized(r.party)===normalized(donor.name));
  const line=r=>'<article class="row between"><div><strong>'+esc(money(r.amountPaise))+'</strong><p>'+[r.date,r.reference,r.status,r.coverage].filter(Boolean).map(esc).join(' · ')+'</p>'+(r.notes?'<details><summary>Private notes</summary><div class="rich-text">'+TempleRich.html(r.notes)+'</div></details>':'')+'</div>'+(drive(r.receipt)?'<a class="button compact secondary" href="'+drive(r.receipt)+'" target="_blank" rel="noopener noreferrer">Receipt ↗</a>':'')+'<button class="button compact secondary" data-tx="'+esc(r.id)+'">Review transaction</button></article>';
  const activeTotal=linked.filter(r=>r.status==='Active').reduce((sum,r)=>sum+Number(r.amountPaise),0);
  show(donor.name+' · Donations','<div class="stats"><div class="stat"><span>Linked donations</span><strong>'+linked.length+'</strong></div><div class="stat"><span>Active donation total</span><strong>'+esc(money(activeTotal))+'</strong></div></div><div class="list">'+(linked.map(line).join('')||'<p>No linked donations.</p>')+'</div>'+(possible.length?'<h3>Possible historical matches</h3><p>These names match. Review the source details before assigning a transaction to this donor.</p><div class="list">'+possible.map(line).join('')+'</div>':''));
  $('modalBody').onclick=e=>{
    const transaction=all.find(r=>r.id===e.target.dataset.tx);
    if(transaction) {active='Finance';render();openEditor({...transaction,donorId:transaction.donorId||donor.id});}
  };
}
function render() {
  const finance=tables.Finance||[], pending=(tables.Requests||[]).filter(r=>r.status==='Pending').length;
  const sum=(type,status)=>finance.filter(r=>r.type===type&&r.status===status).reduce((total,r)=>total+Number(r.amountPaise),0);
  const donation=sum('Donation','Active'),expense=sum('Expense','Active');
  const review=finance.filter(r=>r.status==='Review').length;
  const cards=[
    ['Active donations',money(donation),'donation'],
    ['Active expenses',money(expense),'expense'],
    ['Net balance',money(donation-expense),donation<expense?'expense':'balance'],
    ['Pending sevas',pending,'sevas']
  ];
  $('stats').innerHTML=cards.map(([label,value,tone])=>'<div class="stat stat-'+tone+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('')+
    (review?'<button type="button" class="review-ledger">'+review+' transactions need review · excluded from totals →</button>':'');
  $('stats').querySelector('.review-ledger')?.addEventListener('click',()=>{
    active='Finance';page=0;$('search').value='';
    for(const id of ['financeType','financeYear','financeCategory','financeMethod','dateFrom','dateTo']) $(id).value='';
    $('financeStatus').value='Review';$('financeFilterPanel').open=true;render();
  });
  const latest=[...finance].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,5);
  $('financeOverview').innerHTML='<div><span>Donations received</span><strong>'+esc(money(donation))+'</strong></div><div><span>Temple expenses</span><strong>'+esc(money(expense))+'</strong></div><div><span>Available balance</span><strong>'+esc(money(donation-expense))+'</strong></div>';
  $('recentFinance').innerHTML=latest.length?latest.map(r=>'<div class="finance-preview-row"><span><b>'+esc(r.category||r.type||'Transaction')+'</b><small>'+esc(r.date||'')+'</small></span><strong class="'+(r.type==='Expense'?'outflow':'inflow')+'">'+(r.type==='Expense'?'−':'+')+esc(money(r.amountPaise))+'</strong><button type="button" class="finance-edit-preview" data-finance-edit="'+esc(r.id)+'" aria-label="Edit transaction">✎</button></div>').join(''):'<p class="muted">No financial transactions yet. Add a transaction to get started.</p>';
  if($('adminSideNav') && $('tabs').parentElement!==$('adminSideNav')) $('adminSideNav').append($('tabs'));
  $('tabs').innerHTML=Object.entries(titles).map(([key,title])=>'<button class="button secondary" type="button" aria-pressed="'+(active===key)+'" data-tab="'+key+'">'+title+'</button>').join('');
  $('moduleTitle').textContent=titles[active];
  $('add').hidden=['Requests','Audit','Giving'].includes(active);
  $('add').textContent={Finance:'Add transaction',Donors:'Add donor',Sections:'Add section',Content:'Add content'}[active]||'Add';
  $('uploadVideo').hidden=active!=='Content';
  $('sectionFilterLabel').hidden=active!=='Content';
  $('siteControls').hidden=!['Sections','Content'].includes(active);
  $('sectionShortcuts').innerHTML=(tables.Sections||[]).filter(r=>r.slug!=='carousel').sort((a,b)=>Number(a.order)-Number(b.order)).map(r=>'<button type="button" class="button compact secondary" data-site-section="'+esc(r.id)+'">'+esc(r.title)+'</button>').join('');
  const rows=tables.Finance||[];
  for(const [id,values] of [['financeYear',rows.map(r=>r.date?.slice(0,4))],['financeCategory',rows.map(r=>r.category)],['financeMethod',rows.map(r=>r.method)]]){
    $(id).innerHTML=opt([['','All'],...[...new Set(values.filter(Boolean))].sort()],$(id).value);
  }
  $('financeFilterPanel').hidden=active!=='Finance';
  $('sectionFilter').innerHTML=opt([['','All sections'],...(tables.Sections||[]).map(r=>[r.id,r.title])],$('sectionFilter').value);
  renderRows();
}
const donorKey=value=>String(value||'').trim().replace(/\s+/g,' ').toLowerCase();
function donationGroups(){
  const donors=new Map((tables.Donors||[]).map(row=>[row.id,row]));
  const groups=new Map();
  for(const row of tables.Finance||[]){
    if(row.type!=='Donation') continue;
    const key=row.donorId?'profile:'+row.donorId:'legacy:'+donorKey(row.party);
    const name=row.donorId?(donors.get(row.donorId)?.name||row.party||'Archived donor'):(row.party||'Unnamed donations');
    if(!groups.has(key)) groups.set(key,{key,name,linked:!!row.donorId,rows:[],active:0});
    const group=groups.get(key);group.rows.push(row);
    if(row.status==='Active')group.active+=Number(row.amountPaise)||0;
  }
  return [...groups.values()];
}
function renderGiving(query){
  const groups=donationGroups().filter(g=>g.name.toLowerCase().includes(query));
  if($('sort').value==='name')groups.sort((a,b)=>a.name.localeCompare(b.name));
  else if($('sort').value==='highest')groups.sort((a,b)=>b.active-a.active);
  else {
    const latest=g=>g.rows.reduce((date,r)=>String(r.date||'')>date?String(r.date):date,'');
    groups.sort((a,b)=>($('sort').value==='oldest'?1:-1)*latest(a).localeCompare(latest(b)));
  }
  page=Math.min(page,Math.max(0,Math.ceil(groups.length/12)-1));
  $('recordCount').textContent=groups.length+' donor profiles or recorded-name groups';
  $('records').innerHTML='<div class="giving-grid">'+groups.slice(page*12,page*12+12).map(g=>'<article class="giving-card"><span class="badge">'+(g.linked?'Linked profile':'Recorded name · unlinked')+'</span><h3>'+esc(g.name)+'</h3><strong>'+esc(money(g.active))+'</strong><p class="muted">'+g.rows.length+' transactions · active total shown</p><button class="button compact" data-giving="'+esc(g.key)+'">View full history</button></article>').join('')+'</div>';
  $('pagination').innerHTML=groups.length>12?'<button type="button" class="button compact secondary" data-page="-1" '+(!page?'disabled':'')+'>Previous</button><span>'+(page+1)+' / '+Math.ceil(groups.length/12)+'</span><button type="button" class="button compact secondary" data-page="1" '+((page+1)*12>=groups.length?'disabled':'')+'>Next</button>':'';
}
function showGiving(key){
  const group=donationGroups().find(g=>g.key===key);
  if(!group)return;
  const history=[...group.rows].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const note=r=>r.notes?'<details><summary>Notes</summary><div class="rich-text">'+TempleRich.html(r.notes)+'</div></details>':'';
  const cards=history.map(r=>'<article class="history-row"><div class="row between"><strong>'+esc(money(r.amountPaise))+'</strong><span class="badge">'+esc(r.status)+'</span></div><p>'+[r.date,r.category,r.method,r.reference].filter(Boolean).map(esc).join(' · ')+'</p>'+note(r)+'<div class="actions">'+(drive(r.receipt)?'<a class="button compact secondary" href="'+drive(r.receipt)+'" target="_blank" rel="noopener noreferrer">Receipt ↗</a>':'')+'<button type="button" class="button compact secondary" data-history-edit="'+esc(r.id)+'">Review transaction</button></div></article>').join('');
  show(group.name+' · Donations','<p><strong>'+esc(money(group.active))+'</strong> active total · '+history.length+' transactions</p>'+(!group.linked?'<p class="muted">Grouped by the name recorded in the ledger. Confirm the donor identity before linking these entries to a profile.</p>':'')+cards);
  $('modalBody').onclick=e=>{
    const row=history.find(r=>r.id===e.target.dataset.historyEdit);
    if(row){active='Finance';page=0;render();openEditor(row);}
  };
}
function renderRows() {
  const section=$('sectionFilter').value, query=$('search').value.trim().toLowerCase();
  if(active==='Giving'){renderGiving(query);return;}
  const financeType=$('financeType').value, financeStatus=$('financeStatus').value, dateFrom=$('dateFrom').value, dateTo=$('dateTo').value;
  const source=(tables[active]||[]).filter(r=>{
    if(active==='Content'&&section&&r.section!==section) return false;
    if(active==='Finance'&&(($('financeYear').value&&!r.date?.startsWith($('financeYear').value))||($('financeCategory').value&&r.category!==$('financeCategory').value)||($('financeMethod').value&&r.method!==$('financeMethod').value)||(financeType&&r.type!==financeType)||(financeStatus&&r.status!==financeStatus)||(dateFrom&&r.date<dateFrom)||(dateTo&&r.date>dateTo))) return false;
    return !query||Object.values(r).some(v=>String(v).toLowerCase().includes(query));
  }).reverse();
  const sort=$('sort').value;
  if(sort==='name') source.sort((a,b)=>String(a.title||a.name||a.category||a.service||a.action||'').localeCompare(String(b.title||b.name||b.category||b.service||b.action||'')));
  if(active==='Finance'&&['latest','oldest'].includes(sort)) source.sort((a,b)=>(sort==='latest'?-1:1)*String(a.date||'').localeCompare(String(b.date||'')));
  else if(sort==='oldest') source.reverse();
  if(sort==='highest') source.sort((a,b)=>Number(b.amountPaise||0)-Number(a.amountPaise||0));
  page=Math.max(0,Math.min(page,Math.ceil(source.length/20)-1));
  $('recordCount').textContent=source.length+' '+(source.length===1?'record':'records');
  const slice=source.slice(page*20,page*20+20);
  const txActions=r=>'<button class="button compact secondary" data-edit="'+esc(r.id)+'">Edit</button> <button class="button compact secondary" data-delete="'+esc(r.id)+'">Delete</button>';
  const txStatus=r=>'<span class="badge status-'+esc(String(r.status).toLowerCase())+'">'+esc(r.status)+'</span>';
  const ledgerRows=slice.map(r=>'<tr><td><strong>'+esc(r.party||'—')+'</strong><small>'+esc(r.reference||'')+'</small></td><td>'+esc(r.date)+'</td><td>'+esc(r.type)+'<small>'+esc(r.category)+'</small></td><td class="ledger-amount">'+esc(money(r.amountPaise))+'</td><td>'+esc(r.method)+'</td><td>'+txStatus(r)+'</td><td>'+txActions(r)+'</td></tr>').join('');
  const mobileRows=slice.map(r=>'<article class="transaction-card"><div class="row between"><strong>'+esc(r.party||'—')+'</strong><strong class="ledger-amount">'+esc(money(r.amountPaise))+'</strong></div><p>'+[r.date,r.type,r.category,r.method,r.reference].filter(Boolean).map(esc).join(' · ')+'</p><div class="row between">'+txStatus(r)+'<div class="actions">'+txActions(r)+'</div></div></article>').join('');
  $('records').innerHTML=active==='Finance'&&slice.length ? '<div class="ledger-scroll"><table class="ledger"><thead><tr>'+['Paid by or to','Date','Transaction','Amount','Payment','Status','Actions'].map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+ledgerRows+'</tbody></table></div><div class="transaction-cards">'+mobileRows+'</div>'  : slice.map(r=>{
    const title=r.title||r.category||r.name||r.service||r.action;
    const detail=active==='Finance'?[r.type,money(r.amountPaise),r.date,r.method,r.party,r.reference]:
      active==='Donors'?[r.phone,r.email]:active==='Sections'?['/'+r.slug,'Sort order '+r.order]:
      active==='Content'?[(tables.Sections||[]).find(s=>s.id===r.section)?.title,r.date,r.extra]:
      active==='Requests'?[r.name,r.date,r.note]:[r.date,r.table,r.target];
    return '<article class="row between"><div><strong>'+esc(title)+'</strong> '+(r.status?'<span class="badge">'+esc(r.status)+'</span>':'')+'<p>'+detail.filter(Boolean).map(esc).join(' · ')+'</p></div>'+
      (active==='Audit'?'':'<div class="actions">'+(active==='Donors'?'<button class="button compact" data-history="'+esc(r.id)+'">Donation history</button>':'')+'<button class="button compact secondary" data-edit="'+esc(r.id)+'">'+(active==='Requests'?'Update status':'Edit')+'</button>'+
      (active==='Requests'?'':'<button class="button compact secondary" data-delete="'+esc(r.id)+'">Delete</button>')+(['Sections','Content'].includes(active)?'<button class="button compact" data-visibility="'+esc(r.id)+'">'+(r.status==='Published'?'Hide':'Show')+'</button>':'')+'</div>')+'</article>';
  }).join('')||'<p class="muted">No matching records.</p>';
  $('pagination').innerHTML=source.length>20?'<button type="button" class="button compact secondary" data-page="-1" '+(!page?'disabled':'')+'>Previous</button><span>'+ (page+1)+' / '+Math.ceil(source.length/20)+'</span><button type="button" class="button compact secondary" data-page="1" '+((page+1)*20>=source.length?'disabled':'')+'>Next</button>':'';
}
$('tabs').onclick=e=>{const btn=e.target.closest('[data-tab]');if(!btn)return;active=btn.dataset.tab;page=0;$('search').value='';render();$('tabs').querySelector('[data-tab="'+active+'"]').focus();};
$('pagination').onclick=e=>{if(e.target.dataset.page){page+=Number(e.target.dataset.page);renderRows();}};
$('search').oninput=()=>{page=0;renderRows();};
for(const id of ['sort','sectionFilter','financeType','financeStatus','dateFrom','dateTo','financeYear','financeCategory','financeMethod']) $(id).onchange=()=>{page=0;renderRows();};
$('records').onclick=async e=>{
  if(e.target.dataset.giving){showGiving(e.target.dataset.giving);return;}
  const id=e.target.dataset.edit||e.target.dataset.delete||e.target.dataset.history||e.target.dataset.visibility;
  if(!id) return;
  const row=tables[active].find(r=>r.id===id);
  if(!row) return;
  if(e.target.dataset.visibility){
    e.target.disabled=true;
    try {await rpc('visibility',{table:active,id:row.id,updated:row.updated,status:row.status==='Published'?'Draft':'Published'});await refresh();}
    catch(error){$('global').textContent=error.message;}
    finally{e.target.disabled=false;}
  } else (e.target.dataset.history?openHistory:e.target.dataset.edit?openEditor:confirmDelete)(row);
};
$('sectionShortcuts').onclick=e=>{
  const section=e.target.dataset.siteSection;
  if(!section) return;
  active='Content';page=0;$('search').value='';render();
  $('sectionFilter').value=section;renderRows();
};
$('manageCarousel').onclick=async()=>{
  const button=$('manageCarousel');button.disabled=true;
  try {
    let section=(tables.Sections||[]).find(r=>r.slug==='carousel');
    if(!section){section=await rpc('save',{table:'Sections',record:{title:'Homepage carousel',slug:'carousel',order:0,status:'Published'}});await refresh();}
    active='Content';page=0;$('search').value='';render();
    $('sectionFilter').value=section.id;renderRows();
  } catch(error){$('global').textContent=error.message;}
  finally{button.disabled=false;}
};
$('add').onclick=()=>openEditor();
$('uploadVideo').onclick=openYouTube;
$('reload').onclick=()=>refresh().catch(error=>{$('global').textContent=error.message;});
async function requestPage() {
  $('request').hidden=false;
  const form=$('requestForm');form.elements.date.min=day();
  formAction(form,async(data,current)=>{
    const r=await rpc('submitRequest',data);
    current.reset();
    show('Request submitted','<p>Your request is pending. Save this code to check its status.</p><p><code>'+esc(r.code)+'</code></p>');
    $('trackForm').elements.code.value=r.code;
  });
  formAction($('trackForm'),async(data,current)=>{
    const r=await rpc('trackRequest',{code:data.code.trim()});
    message(current,r.service+' · '+r.date+' · '+r.status);
  });
  try {
    const data=await rpc('catalog'), sevas=data.sections.find(s=>s.slug==='sevas');
    const items=data.content.filter(r=>r.section===sevas?.id);
    form.elements.service.innerHTML=opt(items.map(r=>[r.id,r.title]));
    if(!items.length){form.querySelector('button').disabled=true;message(form,'The committee has yet to publish sevas.');}
  } catch(error) {form.querySelector('button').disabled=true;message(form,error.message);}
}
if(document.body.dataset.view==='request') requestPage();
else {
  $('admin').hidden=false;
  try{token=sessionStorage.getItem('temple-token')||'';}catch{}
  if(token) refresh().catch(error=>clearSession(error.message));
}

// Dashboard shortcuts preserve the existing editor, permissions and save flow.
document.querySelector('.admin-overview')?.addEventListener('click',event=>{
 const edit=event.target.closest('[data-finance-edit]');
 if(edit){const row=(tables.Finance||[]).find(r=>String(r.id)===edit.dataset.financeEdit);if(row){active='Finance';page=0;render();openEditor(row);}return;}
 const btn=event.target.closest('[data-go-module]');if(!btn)return;
 active=btn.dataset.goModule;page=0;$('search').value='';render();
 if(btn.dataset.create==='true'&&!$('add').hidden)$('add').click();
 else document.querySelector('.admin-layout')?.scrollIntoView({behavior:'smooth',block:'start'});
});
