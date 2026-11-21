const TEMPLE_MEDIA_BUILD = '2026-11-18-history-panchang-v1';
const MEDIA_FOLDERS = Object.freeze({
  carousel: '1tWptRIHZsgfY5F-rhhrOks51FnIvjoSI',
  gallery: '13K4PzmmRdHUQisdxvnX0gxRk-Ngu-ptH',
  priests: '1fgjZz6jDAdWYWnsb5RvnSdUvbDpSG2LC'
});
const EXTRA_SHEETS = Object.freeze({
  Audio: ['id','weekday','title','driveUrl','imageUrl','status','updated'],
  Festivals: ['id','date','title','notes','status','updated'],
  TempleHistory: ['id','title','folderId','shortText','fullText','status','updated'],
  LiveTV: ['id','title','youtubeUrl','description','status','updated']
});
// Optional temple tabs. Accept manually pasted human-readable header labels.
const EXTRA_LABELS = {
 Audio:['ID','Weekday','Title','Drive URL','Image URL','Status','Updated'],
 Festivals:['ID','Date','Title','Notes','Status','Updated'],
 TempleHistory:['ID','Title','Folder ID','Short Text','Full Text','Status','Updated'],
 LiveTV:['ID','Title','YouTube URL','Description','Status','Updated']
};
function extraHeading_(text){return String(text||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function ensureTempleExtras_(){
 const ss=SpreadsheetApp.openById(cfg_('SHEET_ID'));
 for(const name of Object.keys(EXTRA_SHEETS)){
  const columns=EXTRA_SHEETS[name], labels=EXTRA_LABELS[name];
  const tab=ss.getSheetByName(name)||ss.insertSheet(name);
  if(!tab.getLastRow()){
   tab.getRange(1,1,1,columns.length).setValues([labels]);tab.setFrozenRows(1);
  } else if(name==='Audio'){
   // Migrate a six-column Audio tab by inserting Image URL before Status.
   const headers=tab.getRange(1,1,1,7).getDisplayValues()[0].map(extraHeading_);
   if(headers[0]==='id'&&headers[1]==='weekday'&&headers[2]==='title'&&
     headers[3]==='driveurl'&&headers[4]==='status'&&headers[5]==='updated'&&!headers[6]){
     tab.insertColumnBefore(5);tab.getRange(1,5).setValue('Image URL');
   }
  }
  const actual=tab.getRange(1,1,1,columns.length).getDisplayValues()[0].map(extraHeading_);
  if(actual.join('|')!==columns.map(extraHeading_).join('|')){
   fail_('Unexpected headers in '+name+'. Expected: '+labels.join(' | '));
  }
 }
 return 'Audio, Festivals, TempleHistory and LiveTV tabs are ready';
}
function extraRows_(name,publicOnly){
 const columns=EXTRA_SHEETS[name];if(!columns)return [];
 const tab=SpreadsheetApp.openById(cfg_('SHEET_ID')).getSheetByName(name);
 if(!tab||tab.getLastRow()<2)return [];
 const actual=tab.getRange(1,1,1,columns.length).getDisplayValues()[0].map(extraHeading_);
 if(actual.join('|')!==columns.map(extraHeading_).join('|'))return [];
 return tab.getRange(2,1,tab.getLastRow()-1,columns.length).getDisplayValues()
  .map((values,i)=>Object.fromEntries([...columns.map((k,j)=>[k,values[j]]),['_row',i+2]]))
  .map(r=>name==='Audio'?({...r,weekday:({'sunday':0,'monday':1,'tuesday':2,'wednesday':3,'thursday':4,'friday':5,'saturday':6}[String(r.weekday).toLowerCase()] ?? r.weekday)}):r)
  .filter(r=>r.title&&(!publicOnly||r.status==='Published'));
}
function extraSave_(name,value){
 ensureTempleExtras_();const cols=EXTRA_SHEETS[name],tab=sheet_(name),old=extraRows_(name,false).find(r=>r.id===value.id);
 const row={id:old?.id||uid_(),status:choice_(value.status,['Published','Draft']),updated:stamp_()};
 if(name==='Audio'){
  const weekday=Number(value.weekday);if(!Number.isInteger(weekday)||weekday<0||weekday>7)fail_('Choose a weekday 0–6 or Audio Gallery (7).');
  if(weekday<7&&extraRows_('Audio',false).some(x=>Number(x.weekday)===weekday&&x.id!==row.id&&x.status==='Published'&&row.status==='Published'))fail_('A published song already exists for this weekday.');
  const link=safeUrl_(value.driveUrl);
  if(!/^https:\/\//i.test(link))fail_('Enter an HTTPS MP3 URL, preferably Cloudinary.');
  if(!(/\.(mp3|m4a|ogg|wav|aac)(?:[?#]|$)/i.test(link)||/^https:\/\/res\.cloudinary\.com\/[A-Za-z0-9_-]+\/video\/upload\//i.test(link)||/^https:\/\/drive\.google\.com\/file\/d\//i.test(link)))fail_('Use a direct audio URL (Cloudinary video/upload or .mp3), or a Drive link for legacy records.');
  Object.assign(row,{weekday:String(weekday),title:title_(value.title),driveUrl:link,imageUrl:value.imageUrl?safeUrl_(value.imageUrl):''});
 } else if(name==='Festivals'){
  Object.assign(row,{date:date_(value.date),title:title_(value.title),notes:clean_(value.notes,500)});
 } else if(name==='LiveTV'){
  const link=safeUrl_(value.youtubeUrl);
  if(!/^https:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\//i.test(link))fail_('Use a YouTube video, live video or channel URL.');
  Object.assign(row,{title:title_(value.title),youtubeUrl:link,description:clean_(value.description,500)});
 } else if(name==='TempleHistory'){
  const folderId=clean_(value.folderId,120).replace(/^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\//,'').split(/[?#/]/)[0];
  if(!/^[A-Za-z0-9_-]{15,120}$/.test(folderId))fail_('Enter a valid Drive folder ID or folder URL.');
  Object.assign(row,{title:title_(value.title),folderId,shortText:clean_(value.shortText,500),fullText:clean_(value.fullText,12000)});
 } else fail_('Invalid extra sheet');
 const target=old?old._row:tab.getLastRow()+1;
 tab.getRange(target,1,1,cols.length).setNumberFormat('@').setValues([cols.map(k=>String(row[k]||''))]);
 audit_('Save '+name,name,row.id);return row;
}
function extraDelete_(name,id,password){
  if(!eq_(password,cfg_('DELETE_PASSWORD')))fail_('Incorrect deletion password.');
  const row=extraRows_(name,false).find(r=>r.id===id);if(!row)fail_('Record not found.');
  sheet_(name).deleteRow(row._row);audit_('Delete '+name,name,id);return {deleted:id};
}

const IDLE = 7200000;
const FILE_MAX = 8 * 1024 * 1024;
const CHUNK = 1024 * 1024;
const SCHEMA = {
  Sections:['id','slug','title','summary','order','status','updated','deleted'],
  Content:['id','section','title','body','date','extra','url','media','order','status','updated','deleted'],
  Finance:['id','type','date','amountPaise','category','method','reference','party','notes','receipt','status','recordedBy','updated','deleted','donorId','coverage','publishDonor','publicNote'],
  Donors:['id','name','phone','email','notes','updated','deleted'],
  Requests:['id','service','date','name','note','status','updated','deleted'],
  Sessions:['id','seen','revoked'],
  Audit:['id','date','action','table','target']
};
const STARTER = [
  ['about','About the temple'],['timings','Darshan & pooja timings'],['sevas','Sevas'],
  ['priests','Priests'],['gallery','Gallery'],['videos','Videos'],['articles','Articles'],
  ['donations','Donations'],['announcements','Announcements'],['visit','Visit & contact']
];
const props_ = () => PropertiesService.getScriptProperties();
const now_ = () => Date.now();
const stamp_ = () => new Date().toISOString();
const uid_ = () => Utilities.getUuid().replace(/-/g,'');
const token_ = () => uid_()+uid_();
const fail_ = message => {throw new Error(message);};
const cfg_ = name => props_().getProperty(name) || fail_('Missing configuration: '+name);
const clean_ = (v,n=1500) => typeof v==='string' ? v.trim().slice(0,n) : '';
const hex_ = bytes => bytes.map(x=>('0'+(x&255).toString(16)).slice(-2)).join('');
const hash_ = value => hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,value,Utilities.Charset.UTF_8));
const mac_ = (value,key) => hex_(Utilities.computeHmacSha256Signature(value,key,Utilities.Charset.UTF_8));
const lock_ = fn => {
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try {const result=fn();SpreadsheetApp.flush();return result;} finally {lock.releaseLock();}
};
function eq_(a,b) {
  a=String(a||''); b=String(b||'');
  let diff=a.length^b.length;
  for(let i=0;i<b.length;i++) diff|=(a.charCodeAt(i)||0)^b.charCodeAt(i);
  return diff===0;
}
function initialize_() {
  lock_(()=>{
    const props=props_();
    const ss=SpreadsheetApp.openById(cfg_('SHEET_ID'));
    const folder=DriveApp.getFolderById(cfg_('DRIVE_FOLDER_ID'));
    if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE || folder.getEditors().length || folder.getViewers().length) fail_('Use a private owner-only Drive folder.');
    if(!props.getProperty('PASSWORD_HASH')) {
      const password=cfg_('INITIAL_PASSWORD');
      validatePassword_(password);
      const pepper=token_();
      props.setProperties({PASSWORD_PEPPER:pepper,PASSWORD_HASH:mac_(password,pepper)});
      props.deleteProperty('INITIAL_PASSWORD');
    }
    Object.keys(SCHEMA).forEach(name=>{
      const tab=ss.getSheetByName(name)||ss.insertSheet(name);
      if(!tab.getLastRow()) {tab.getRange(1,1,1,SCHEMA[name].length).setValues([SCHEMA[name]]);tab.setFrozenRows(1);}
      else {
        const headers=tab.getRange(1,1,1,SCHEMA[name].length).getDisplayValues()[0];
        const legacy=name==='Finance'&&headers.slice(-2).every(v=>!v)&&headers.slice(0,-2).join('|')===SCHEMA[name].slice(0,-2).join('|');
        if(legacy) tab.getRange(1,1,1,SCHEMA[name].length).setValues([SCHEMA[name]]);
        else if(headers.join('|')!==SCHEMA[name].join('|')) fail_('Unexpected headers in '+name);
      }
    });
    if(!rows_('Sections').length) STARTER.forEach(([slug,title],i)=>put_('Sections',{id:uid_(),slug,title,order:i+1,status:'Published',updated:stamp_()}));
  });
}
function sheet_(name) {return SpreadsheetApp.openById(cfg_('SHEET_ID')).getSheetByName(name);}
// Adds only two optional disclosure columns; existing finance records remain private.
// Safe to run manually after updating Code.gs; also called before saving finance records.
function migratePublicDonorConsent_() {
  const tab=sheet_('Finance');
  const expected=SCHEMA.Finance;
  const headers=tab.getRange(1,1,1,expected.length).getDisplayValues()[0];
  if(headers.join('|')===expected.join('|')) return 'Already configured';
  const oldCount=expected.length-2;
  if(headers.slice(0,oldCount).join('|')===expected.slice(0,oldCount).join('|') &&
     headers.slice(oldCount).every(value=>!value)) {
    tab.getRange(1,oldCount+1,1,2).setValues([expected.slice(oldCount)]);
    return 'Added public donor consent columns';
  }
  fail_('Finance headers differ from the expected schema; do not overwrite this sheet.');
}
function rows_(name) {
  const tab=sheet_(name), count=tab.getLastRow()-1, keys=SCHEMA[name];
  return count>0 ? tab.getRange(2,1,count,keys.length).getDisplayValues().map((cells,i)=>{
    const row={_row:i+2};
    keys.forEach((key,j)=>row[key]=cells[j]);
    return row;
  }) : [];
}
function put_(name,row) {
  const tab=sheet_(name), keys=SCHEMA[name], range=tab.getRange(row._row||tab.getLastRow()+1,1,1,keys.length);
  range.setNumberFormat('@');
  range.setValues([keys.map(key=>{
    const value=String(row[key]??'');
    return /^[=+\-@']/.test(value) ? "'"+value : value;
  })]);
}
function safe_(row) {const {_row,deleted,...record}=row;return record;}
function alive_(name) {return rows_(name).filter(row=>!row.deleted);}
function byId_(name,id) {return alive_(name).find(row=>row.id===id);}
function audit_(action,table,target) {put_('Audit',{id:uid_(),date:stamp_(),action,table,target});}
function validatePassword_(value) {if(typeof value!=='string'||value.length<16||value.length>128) fail_('Use a password of 16–128 characters.');}
function passwordOK_(value) {return typeof value==='string'&&value.length<=128&&eq_(mac_(value,cfg_('PASSWORD_PEPPER')),cfg_('PASSWORD_HASH'));}
function session_(token,touch) {
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)) fail_('Your session has expired. Sign in again.');
  const row=rows_('Sessions').find(r=>r.id===hash_(token));
  if(!row||row.revoked||now_()-Number(row.seen)>=IDLE) fail_('Your session has expired. Sign in again.');
  if(touch) {row.seen=now_();put_('Sessions',row);}
  return row;
}
function limit_(key,max,window) {
  const props=props_(), time=now_();
  let state=JSON.parse(props.getProperty(key)||'null');
  if(!state||time>=state.until) state={until:time+window,count:0};
  if(state.count>=max) fail_('Too many attempts. Try again later.');
  state.count++;
  props.setProperty(key,JSON.stringify(state));
}
function cleanupExpired_() {
  lock_(()=>{
    const expired=rows_('Sessions').filter(r=>r.revoked||now_()-Number(r.seen)>86400000);
    expired.reverse().forEach(r=>sheet_('Sessions').deleteRow(r._row));
    const props=props_();
    Object.keys(props.getProperties()).filter(k=>k.startsWith('UPLOAD_')).forEach(k=>{
      const row=JSON.parse(props.getProperty(k));
      if(now_()>row.until) props.deleteProperty(k);
    });
  });
}
function doGet(event) {
  const view=event?.parameter?.view;
  if(view==='image') return ContentService.createTextOutput(JSON.stringify(publicImage_(event.parameter.id))).setMimeType(ContentService.MimeType.JSON);
  if(view==='publicMedia') return ContentService.createTextOutput(JSON.stringify({build:TEMPLE_MEDIA_BUILD,driveCarousel:driveFolderPhotos_(MEDIA_FOLDERS.carousel),driveGallery:driveFolderPhotos_(MEDIA_FOLDERS.gallery),drivePriests:driveFolderPhotos_(MEDIA_FOLDERS.priests)})).setMimeType(ContentService.MimeType.JSON);
  if(view==='admin'||view==='request') {
    const template=HtmlService.createTemplateFromFile('Portal');
    template.view=view;
    template.home=safeUrl_(props_().getProperty('PUBLIC_SITE_URL')||'https://induguvasanth.github.io/temple/');
    return template.evaluate().setTitle(view==='admin'?'Temple administration':'Seva requests').addMetaTag('viewport','width=device-width, initial-scale=1');
  }
  return ContentService.createTextOutput(JSON.stringify(publicData_())).setMimeType(ContentService.MimeType.JSON);
}
// Published media are sourced from these Drive folders, not GitHub assets.
// Only place images intended for public display in these folders.
function driveFolderPhotos_(folderId) {
  const items=[];
  try {
    const files=DriveApp.getFolderById(folderId).getFiles();
    while(files.hasNext() && items.length<100) {
      const file=files.next();
      if(file.isTrashed() || !/^image\//i.test(file.getMimeType())) continue;
      items.push({id:file.getId(),title:file.getName(),modified:file.getLastUpdated().getTime(),
        media:'https://drive.google.com/file/d/'+file.getId()+'/view'});
    }
    items.sort((a,b)=>b.modified-a.modified);
  } catch(error) {console.error('Drive folder listing failed: '+folderId+' '+error.message);}
  return items.map(({modified,...item})=>item);
}
// Only folders explicitly published in TempleHistory are exposed. First filename alphabetically is cover.
function publicTempleHistory_(){
 return extraRows_('TempleHistory',true).map(record=>{
  const photos=driveFolderPhotos_(record.folderId).sort((a,b)=>a.title.localeCompare(b.title,undefined,{numeric:true}));
  return {id:record.id,title:record.title,shortText:record.shortText,fullText:record.fullText,photos,cover:photos[0]||null};
 });
}
function publicData_() {
  const all=alive_('Sections');
  const sections=all.filter(r=>r.status==='Published'&&!['events','shop'].includes(r.slug)).map(safe_);
  const keys=new Set(sections.map(r=>r.id));
  const about=sections.find(r=>r.slug==='about');
  const articles=all.find(r=>r.slug==='articles');
  const donorProfiles=new Map(alive_('Donors').map(r=>[r.id,r]));
  const finance=alive_('Finance').filter(r=>r.status==='Active'&&['Donation','Expense'].includes(r.type)).map(r=>{
    const result={date:r.date,type:r.type,category:r.category,amountPaise:r.amountPaise};
    // Never publish identities from historical data without explicit per-record consent.
    if(r.type==='Donation' && r.publishDonor==='Yes') {
      const donorName=clean_(donorProfiles.get(r.donorId)?.name || r.party,140);
      if(donorName) {
        result.donorName=donorName;
        // Separate profiles with identical names; unlinked legacy records stay individual.
        result.donorKey=r.donorId?'profile:'+r.donorId:'entry:'+r.id;
        result.publicNote=clean_(r.publicNote,350);
      }
    }
    return result;
  });
  const donations=finance.filter(r=>r.type==='Donation').map(({date,category,amountPaise})=>({date,category,amountPaise}));
  return {sections,donations,finance,liveTV:extraRows_('LiveTV',true),audio:extraRows_('Audio',true),festivals:extraRows_('Festivals',true),templeHistory:publicTempleHistory_(),driveCarousel:driveFolderPhotos_(MEDIA_FOLDERS.carousel),driveGallery:driveFolderPhotos_(MEDIA_FOLDERS.gallery),drivePriests:driveFolderPhotos_(MEDIA_FOLDERS.priests),carouselConfigured:all.some(r=>r.slug==='carousel'),content:alive_('Content').filter(r=>keys.has(r.section)&&r.status==='Published').map(r=>{
    const {media,...record}=safe_(r);
    if(about&&articles&&r.section===articles.id&&/^history of chidambareshwara swamy temple$/i.test(String(r.title||'').trim())) record.section=about.id;
    return {...record,media:media ? 'https://drive.google.com/file/d/'+encodeURIComponent(media)+'/view' : ''};
  })};
}
// Read-only image delivery for published content and the designated public-photo folders.
// Files remain in Drive; the browser does not need individual Drive "Anyone with link" grants.
function publicImage_(id) {
  if(typeof id!=='string'||!/^[A-Za-z0-9_-]{5,120}$/.test(id)) return {};
  try {
    const file=DriveApp.getFileById(id);
    if(file.isTrashed() || !/^image\/(jpeg|png|gif|webp)$/i.test(file.getMimeType())) return {};
    const published=new Set(alive_('Sections').filter(r=>r.status==='Published').map(r=>r.id));
    let allowed=alive_('Content').some(r=>r.media===id&&r.status==='Published'&&published.has(r.section));
    if(!allowed) {
      const folders=new Set([...Object.values(MEDIA_FOLDERS),...extraRows_('TempleHistory',true).map(r=>r.folderId)]);
      const parents=file.getParents();
      while(parents.hasNext()) if(folders.has(parents.next().getId())) {allowed=true;break;}
    }
    if(!allowed) return {};
    // Use a small preview to keep ContentService JSON responses reliable.
    const image=file.getThumbnail()||(file.getSize()<=700000?file.getBlob():null);
    if(!image||!/^image\/(jpeg|png|gif|webp)$/i.test(image.getContentType())) return {};
    const bytes=image.getBytes();
    return bytes.length<=750000?{image:'data:'+image.getContentType()+';base64,'+Utilities.base64Encode(bytes)}:{};
  } catch(error) {console.error('Public image delivery failed: '+error.message);return {};}
}
function keepMediaPublic_(fileId,excludedId) {
  const published=new Set(alive_('Sections').filter(row=>row.status==='Published').map(row=>row.id));
  return alive_('Content').some(row=>row.id!==excludedId&&row.media===fileId&&row.status==='Published'&&published.has(row.section));
}
function setVisibility_(data) {
  const name=choice_(data.table,['Sections','Content']);
  const row=byId_(name,data.id)||fail_('This record no longer exists.');
  if(row.updated!==data.updated) fail_('This record changed. Reload before editing.');
  const status=choice_(data.status,['Draft','Published']);
  if(row.status===status) return safe_(row);
  if(name==='Content'&&status==='Published') {
    const section=byId_('Sections',row.section)||fail_('The parent section is missing.');
    if(section.status!=='Published') fail_('Show the parent section before publishing this item.');
  }
  // Publishing controls visibility in the temple catalog, not Google Drive sharing settings.
  // The read-only publicImage_ endpoint serves authorized public media without setSharing().
  row.status=status;row.updated=stamp_();put_(name,row);
  audit_(status==='Published'?'Show':'Hide',name,row.id);
  return safe_(row);
}
function portal(action,data) {
  data=data||{};
  if(action==='youtubeChunk') return uploadChunk_(data);
  return lock_(()=>{
    if(action==='login') {
      limit_('LOGIN_RATE',10,900000);
      if(!passwordOK_(data.password)) fail_('Incorrect password.');
      props_().deleteProperty('LOGIN_RATE');
      const token=token_();
      put_('Sessions',{id:hash_(token),seen:now_()});
      return {token,expires:now_()+IDLE};
    }
    if(action==='sendOtp'||action==='reset') {
      if(data.channel!==undefined&&data.channel!=='email') fail_('Password recovery is available by email only.');
      return emailOtp_(action,data);
    }
    if(action==='catalog') return publicData_();
    if(action==='submitRequest'||action==='trackRequest') return request_(action,data);
    const session=session_(data.token,action!=='snapshot');
    if(action==='snapshot') return {extraAudio:extraRows_('Audio',false),extraFestivals:extraRows_('Festivals',false),extraHistory:extraRows_('TempleHistory',false),extraLiveTV:extraRows_('LiveTV',false),categoryCatalog:JSON.parse(props_().getProperty('FINANCE_CATEGORY_CATALOG')||'[]'),expires:Number(session.seen)+IDLE,tables:Object.fromEntries(['Sections','Content','Finance','Donors','Requests','Audit'].map(name=>[name,alive_(name).map(safe_)]))};
    if(action==='touch') return {expires:Number(session.seen)+IDLE};
    if(action==='extraInit') return {message:ensureTempleExtras_()};
    if(action==='extraList')return {audio:extraRows_('Audio',false),festivals:extraRows_('Festivals',false),history:extraRows_('TempleHistory',false),liveTV:extraRows_('LiveTV',false)};
    if(action==='extraSave') return extraSave_(choice_(data.name,['Audio','Festivals','TempleHistory','LiveTV']),data.record||{});
    if(action==='extraDelete')return extraDelete_(choice_(data.name,['Audio','Festivals','TempleHistory','LiveTV']),data.id,data.password);
    if(action==='mediaList') return mediaList_(data.folder);
    if(action==='mediaProbe') return mediaProbe_(data.folder);
    if(action==='mediaUpload') return mediaUpload_(data);
    if(action==='mediaDelete') return mediaDelete_(data);
    if(action==='logout') {session.revoked='yes';put_('Sessions',session);return {};}
    if(action==='categoryAdd') {
      const label=clean_(data.label,140);
      if(!label||!/^[-\w\s/&().]+$/.test(label)) fail_('Enter a valid category or Parent / Subcategory name.');
      const items=JSON.parse(props_().getProperty('FINANCE_CATEGORY_CATALOG')||'[]');
      if(!items.some(x=>x.toLowerCase()===label.toLowerCase())) items.push(label);
      props_().setProperty('FINANCE_CATEGORY_CATALOG',JSON.stringify(items));
      audit_('Add category','Finance',label);
      return {items};
    }
    if(action==='categoryDelete') {
      limit_('DELETE_PASSWORD_RATE',10,900000);
      if(!eq_(data.password,cfg_('DELETE_PASSWORD'))) fail_('Incorrect deletion password.');
      const label=clean_(data.label,140);
      if(alive_('Finance').some(r=>r.category===label)) fail_('This category contains financial records. Reassign those records before deleting the category.');
      const items=JSON.parse(props_().getProperty('FINANCE_CATEGORY_CATALOG')||'[]').filter(x=>x!==label);
      props_().setProperty('FINANCE_CATEGORY_CATALOG',JSON.stringify(items));
      audit_('Delete category','Finance',label);
      return {items};
    }
    if(action==='save') return save_(data);
    if(action==='visibility') return setVisibility_(data);
    if(action==='delete') return remove_(data);
    if(action==='youtubeStart') return uploadStart_(data,session.id);
    if(action==='youtubeCancel') {
      const id=clean_(data.upload,64), state=uploadState_(id,session.id);
      if(state.busyUntil>now_()) fail_('Wait for the current video chunk to finish.');
      props_().deleteProperty('UPLOAD_'+id);
      return {};
    }
    fail_('Unknown action.');
  });
}
function date_(value) {
  const text=clean_(value,10), parsed=new Date(text+'T00:00:00Z');
  if(!/^\d{4}-\d\d-\d\d$/.test(text)||isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==text) fail_('Enter a valid date.');
  return text;
}
function safeUrl_(value) {
  const url=clean_(value,1000);
  if(!url) return '';
  if(!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?(?:[/?#][^\s\\]*)?$/i.test(url)) fail_('Enter a valid HTTPS link.');
  return url;
}
function choice_(value,choices) {if(!choices.includes(value)) fail_('Select a valid option.');return value;}
function title_(value) {return clean_(value,140)||fail_('Enter a title.');}
function order_(value) {
  const text=String(value??'0');
  if(!/^\d{1,5}$/.test(text)) fail_('Enter a sort order from 0 to 99999.');
  return Number(text);
}
function paise_(value) {
  const text=String(value||'');
  if(!/^\d{1,9}(\.\d{1,2})?$/.test(text)) fail_('Enter a valid rupee amount.');
  const [whole,fraction='']=text.split('.');
  const amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(amount<=0) fail_('Enter an amount greater than zero.');
  return amount;
}
function save_(data) {
  const name=choice_(data.table,['Sections','Content','Finance','Donors','Requests']);
  if(name==='Finance') migratePublicDonorConsent_();
  const v=data.record||{};
  const old=v.id ? byId_(name,v.id)||fail_('This record no longer exists.') : null;
  if(old && old.updated!==v.updated) fail_('This record changed. Close the form and reload before editing.');
  const requestId=name==='Finance'&&!old&&/^[a-f0-9-]{36}$/.test(data.requestId||'')?'entry-'+data.requestId:'';
  if(requestId) {
    const previous=rows_('Finance').find(row=>row.id===requestId);
    if(previous) {
      if(previous.deleted) fail_('This transaction was already saved and then deleted.');
      return safe_(previous);
    }
  }
  const row={...old,id:old?.id||requestId||uid_(),updated:stamp_()};
  const status=()=>choice_(v.status,['Draft','Published']);
  let field, visibility=false;
  if(name==='Sections') {
    const slug=clean_(v.slug,50).toLowerCase();
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail_('Use letters, digits and single hyphens for the page slug.');
    if(alive_('Sections').some(r=>r.slug===slug&&r.id!==row.id)) fail_('That page slug is already in use.');
    Object.assign(row,{slug,title:title_(v.title),summary:clean_(v.summary),order:order_(v.order),status:status()});
  } else if(name==='Content') {
    const section=byId_('Sections',v.section)||fail_('Choose a section.');
    Object.assign(row,{section:section.id,title:title_(v.title),body:clean_(v.body,12000),date:v.date?date_(v.date):'',extra:clean_(v.extra,300),url:safeUrl_(v.url),order:order_(v.order),status:status()});
    visibility=row.status==='Published';
    if(visibility&&section.status!=='Published') fail_('Publish the parent section first.');
    field='media';
  } else if(name==='Finance') {
    Object.assign(row,{type:choice_(v.type,['Donation','Expense']),date:date_(v.date),amountPaise:paise_(v.amount),category:title_(v.category),method:choice_(v.method,['Cash','UPI','Bank transfer','Card','Cheque','Other']),reference:clean_(v.reference,120),party:clean_(v.party,150),notes:clean_(v.notes,12000),status:choice_(v.status,old?.status==='Review'?['Active','Inactive','Review']:['Active','Inactive']),recordedBy:old?.recordedBy||clean_(props_().getProperty('ADMIN_LABEL'),100)||'Temple administrator'});
    const donorId=clean_(v.donorId,100);
    if(donorId) {
      if(row.type!=='Donation') fail_('Only donations can be assigned to a donor.');
      const donor=byId_('Donors',donorId);
      if(!donor&&old?.donorId!==donorId) fail_('Choose an existing donor.');
      row.donorId=donorId;
      if(!row.party&&donor) row.party=donor.name;
    } else row.donorId='';
    row.coverage=old?.coverage||'Entered in portal';
    // Disclose the donor's name and this record's public note ONLY with affirmative consent.
    row.publishDonor=row.type==='Donation'?choice_(String(v.publishDonor||'No'),['No','Yes']):'No';
    row.publicNote=row.publishDonor==='Yes'?clean_(v.publicNote,350):'';
    field='receipt';
  } else if(name==='Donors') {
    const email=clean_(v.email,254);
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail_('Enter a valid email.');
    Object.assign(row,{name:title_(v.name),phone:clean_(v.phone,40),email,notes:clean_(v.notes,12000)});
  } else {
    if(!old) fail_('Request does not exist.');
    row.status=choice_(v.status,['Pending','Confirmed','Declined']);
  }
  let uploaded;
  try {
    if(field) {
      if(data.file) {uploaded=driveUpload_(data.file,name==='Content'?(byId_('Sections',row.section)?.slug==='carousel'?'Temple-Hero-Carousel':byId_('Sections',row.section)?.slug==='gallery'?'Temple-Gallery':'') : '');row[field]=uploaded.getId();}
      else if(v.removeFile) row[field]='';
      // Do not call setSharing: it fails on some Drive accounts even after file creation.
      // Published images are served through publicImage_ for supported public content.
    }
    put_(name,row);
  } catch(error) {
    if(uploaded) {try {uploaded.setTrashed(true);} catch(ignored) {}}
    throw error;
  }
  audit_(old?'Update':'Create',name,row.id);
  return safe_(row);
}
function remove_(data) {
  limit_('DELETE_PASSWORD_RATE',10,900000);
  if(!eq_(data.password,cfg_('DELETE_PASSWORD'))) fail_('Enter the configured deletion password.');
  props_().deleteProperty('DELETE_PASSWORD_RATE');
  const name=choice_(data.table,['Sections','Content','Finance','Donors']);
  const row=byId_(name,data.id)||fail_('This record no longer exists.');
  if(row.updated!==data.updated) fail_('This record changed. Reload before deleting.');
  if(name==='Sections'&&alive_('Content').some(r=>r.section===row.id)) fail_('Move or delete the items in this section first.');
  // Remove the catalog record without requiring permission to change Drive sharing.
  row.deleted=stamp_();
  put_(name,row);
  audit_('Delete',name,row.id);
  return {};
}
// Media tools are available only after the portal() admin session check.
// Neither these functions nor saving/publishing media changes Drive sharing.
function mediaFolder_(which) {
  const label=choice_(which,['gallery','carousel','priests']);
  return {label,id:MEDIA_FOLDERS[label]};
}
function mediaList_(which) {
  const target=mediaFolder_(which);
  let folder;
  try {folder=DriveApp.getFolderById(target.id);}
  catch(error){fail_('MEDIA['+TEMPLE_MEDIA_BUILD+'] cannot open '+target.label+' folder: '+error.message);}
  const photos=[];
  try {
    const files=folder.getFiles();
    while(files.hasNext()&&photos.length<250) {
      const file=files.next();
      if(file.isTrashed()||!/^image\/(?:jpeg|png|gif|webp)$/i.test(file.getMimeType()))continue;
      photos.push({id:file.getId(),name:file.getName(),size:file.getSize(),
        modified:file.getLastUpdated().toISOString()});
    }
  } catch(error) {fail_('MEDIA['+TEMPLE_MEDIA_BUILD+'] cannot list '+target.label+' images: '+error.message);}
  photos.sort((a,b)=>String(b.modified).localeCompare(String(a.modified)));
  return {build:TEMPLE_MEDIA_BUILD,folder:target.label,folderId:target.id,photos};
}
// Performs a real write+trash test, unlike getFolderById() which only checks read access.
function mediaProbe_(which) {
  const target=mediaFolder_(which), result={build:TEMPLE_MEDIA_BUILD,folder:target.label,stages:[]};
  let testFile;
  try {
    const folder=DriveApp.getFolderById(target.id);
    result.stages.push('Folder read: OK ('+folder.getName()+')');
    testFile=folder.createFile('TEMP-Temple-Media-Check-'+Date.now()+'.txt','Temporary test file; safe to delete',MimeType.PLAIN_TEXT);
    result.stages.push('File creation: OK');
    testFile.setTrashed(true);
    result.stages.push('Move to trash: OK');
    result.success=true;
  } catch(error) {
    result.success=false;
    result.error=String(error.message||error);
    result.stages.push('FAILED: '+result.error);
    if(testFile) result.tempFileId=testFile.getId();
  }
  return result;
}
function mediaUpload_(data) {
  const target=mediaFolder_(data.folder);
  const file=data.file||{};
  if(!/^image\/(?:jpeg|png|gif|webp)$/i.test(String(file.type||''))) fail_('Only JPG, PNG, GIF and WebP images are supported.');
  let uploaded;
  try {uploaded=driveUpload_(file,target.label==='gallery'?'Temple-Gallery':target.label==='priests'?'Temple-Priest-Photos':'Temple-Hero-Carousel');}
  catch(error){fail_('MEDIA['+TEMPLE_MEDIA_BUILD+'] '+target.label+' upload failed: '+error.message);}
  audit_('Upload image',target.label,uploaded.getId());
  return {build:TEMPLE_MEDIA_BUILD,id:uploaded.getId(),name:uploaded.getName(),folder:target.label};
}
function mediaDelete_(data) {
  limit_('DELETE_PASSWORD_RATE',10,900000);
  if(!eq_(data.password,cfg_('DELETE_PASSWORD'))) fail_('Incorrect deletion password.');
  const target=mediaFolder_(data.folder), id=clean_(data.id,120);
  if(!/^[A-Za-z0-9_-]{10,120}$/.test(id)) fail_('Invalid image ID.');
  let file;
  try {
    file=DriveApp.getFileById(id);
    const parents=file.getParents();let matches=false;
    while(parents.hasNext()) if(parents.next().getId()===target.id) matches=true;
    if(!matches) fail_('Image does not belong to the selected temple media folder.');
    if(file.isTrashed()) fail_('This image is already in the trash.');
    if(!/^image\/(?:jpeg|png|gif|webp)$/i.test(file.getMimeType())) fail_('Only temple images can be deleted here.');
    file.setTrashed(true);
  } catch(error){fail_('MEDIA['+TEMPLE_MEDIA_BUILD+'] cannot move the image to trash: '+error.message);}
  // Clear catalog references so the website doesn't show broken image entries.
  alive_('Content').filter(row=>row.media===id).forEach(row=>{row.media='';row.updated=stamp_();put_('Content',row);});
  audit_('Trash image',target.label,id);
  return {build:TEMPLE_MEDIA_BUILD,deleted:id};
}
function driveUpload_(file,subfolder) {
  const name=clean_(file.name,200);
  if(!name||typeof file.base64!=='string'||file.base64.length>Math.ceil(FILE_MAX/3)*4) fail_('Choose a file up to 8 MB.');
  const bytes=Utilities.base64Decode(file.base64);
  if(!bytes.length||bytes.length>FILE_MAX) fail_('Choose a file up to 8 MB.');
  const mime=/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(file.type||'')?file.type:'application/octet-stream';
  // Access the selected media folder directly; do not unnecessarily touch the root.
  const assigned=subfolder==='Temple-Hero-Carousel'?MEDIA_FOLDERS.carousel:subfolder==='Temple-Gallery'?MEDIA_FOLDERS.gallery:subfolder==='Temple-Priest-Photos'?MEDIA_FOLDERS.priests:'';
  let folder;
  try {
    folder=DriveApp.getFolderById(assigned||cfg_('DRIVE_FOLDER_ID'));
    if(subfolder&&!assigned){
      const existing=folder.getFoldersByName(subfolder);
      folder=existing.hasNext()?existing.next():folder.createFolder(subfolder);
    }
  } catch(error) {fail_('Gallery upload: cannot open destination folder: '+error.message);}
  try {return folder.createFile(Utilities.newBlob(bytes,mime,name));}
  catch(error) {fail_('Gallery upload: cannot create file: '+error.message);}
}
function request_(action,data) {
  if(action==='trackRequest') {
    if(!/^[a-f0-9]{64}$/.test(data.code||'')) fail_('Enter your tracking code.');
    const row=byId_('Requests',hash_(data.code))||fail_('Request not found.');
    return {status:row.status,date:row.date,service:row.service};
  }
  const {sections,content}=publicData_();
  const sevas=sections.find(r=>r.slug==='sevas');
  const item=content.find(r=>r.id===data.service&&r.section===sevas?.id)||fail_('Choose an available seva.');
  const date=date_(data.date);
  if(date<Utilities.formatDate(new Date(),'Asia/Kolkata','yyyy-MM-dd')) fail_('Choose today or a future date.');
  limit_('PUBLIC_REQUEST_RATE',30,600000);
  const code=token_();
  put_('Requests',{id:hash_(code),service:item.title,date,name:title_(data.name),note:clean_(data.note,500),status:'Pending',updated:stamp_()});
  return {code,status:'Pending'};
}
