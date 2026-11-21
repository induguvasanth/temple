'use strict';
const config=window.TEMPLE_CONFIG;
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const url=value=>{
  try {const parsed=new URL(value);return parsed.protocol==='https:'?esc(parsed.href):'';} catch {return '';}
};
const sorted=items=>[...items].sort((a,b)=>Number(a.order)-Number(b.order)||a.title.localeCompare(b.title));
const driveId=value=>String(value||'').match(/(?:drive\.google\.com\/file\/d\/|[?&]id=)([\w-]+)/)?.[1]||'';
function thumbnail(value) {
  const id=driveId(value);
  if(!id) return '';
  return 'https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz=w1600';
}
const photoCache=new Map();
function getPhoto(id) {
  if(!photoCache.has(id)){
    const endpoint=new URL(config.endpoint);
    endpoint.searchParams.set('view','image');endpoint.searchParams.set('id',id);
    photoCache.set(id,fetch(endpoint,{credentials:'omit',signal:AbortSignal.timeout(8000)})
      .then(r=>r.ok?r.json():null).then(r=>/^data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(r?.image||'')?r.image:'').catch(()=>''));
  }
  return photoCache.get(id);
}
function media(record,photoSection) {
  const external=url(record.url), drive=url(record.media);
  let markup='';
  if(external) {
    const parsed=new URL(record.url);
    const video=parsed.hostname==='youtu.be'?parsed.pathname.slice(1):
      ['www.youtube.com','youtube.com','m.youtube.com'].includes(parsed.hostname)?parsed.searchParams.get('v'):'';
    if(/^[A-Za-z0-9_-]{11}$/.test(video||'')) markup='<img loading="lazy" alt="" src="https://i.ytimg.com/vi/'+video+'/hqdefault.jpg">';
    else if(/\.(?:avif|gif|jpe?g|png|webp)$/i.test(parsed.pathname)) markup='<img loading="lazy" alt="'+esc(record.title)+'" src="'+external+'">';
    if(video) markup='<div class="inline-video"><iframe loading="lazy" title="'+esc(record.title)+'" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen src="https://www.youtube-nocookie.com/embed/'+video+'"></iframe></div>'; else if(markup) markup=markup;
  }
  if(drive&&photoSection&&thumbnail(record.media)&&!markup.includes('<img')) markup+='<img loading="lazy" alt="'+esc(record.title)+'" data-drive="'+esc(driveId(record.media))+'" src="'+esc(thumbnail(record.media))+'">';

  return markup;
}
// On-hover muted previews for desktop. Click starts normal playback in the same card.
function youtubeVideoId(value){
  try {
    const u=new URL(value);
    const host=u.hostname.toLowerCase();
    let id='';
    if(host==='youtu.be'||host==='www.youtu.be') id=u.pathname.split('/')[1]||'';
    else if(['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)) {
      id=u.searchParams.get('v')||u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/)?.[1]||'';
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id)?id:'';
  } catch {return '';}
}
function mountVideoPreviewFrames(){
  const canHover=window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  document.querySelectorAll('.temple-video-frame[data-video-id]').forEach(frame=>{
    const id=frame.dataset.videoId;
    const still=frame.innerHTML;
    let mode='still',delay;
    const embed=muted=>{
      frame.innerHTML='<iframe title="Temple video player" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="eager" referrerpolicy="strict-origin-when-cross-origin" src="https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&mute='+(muted?'1':'0')+'&playsinline=1&rel=0"></iframe>';
      frame.dataset.playState=muted?'preview':'playing';
      mode=muted?'preview':'playing';
    };
    if(canHover){
      frame.addEventListener('mouseenter',()=>{if(mode!=='still')return;delay=setTimeout(()=>embed(true),400);});
      frame.addEventListener('mouseleave',()=>{clearTimeout(delay);if(mode==='preview'){frame.innerHTML=still;frame.dataset.playState='still';mode='still';}});
    }
    frame.addEventListener('click',event=>{if(mode==='playing')return;clearTimeout(delay);event.preventDefault();embed(false);});
    frame.addEventListener('keydown',event=>{if((event.key==='Enter'||event.key===' ')&&mode!=='playing'){event.preventDefault();clearTimeout(delay);embed(false);}});
  });
}
let catalogPage=0;
let galleryViewerItems=[];
function gallerySrc(record) {
  const thumb=thumbnail(record.media);
  if(thumb) return thumb;
  const direct=url(record.url||'');
  if(!direct) return '';
  try {return /\.(?:avif|jpe?g|png|webp|gif)$/i.test(new URL(record.url).pathname)?new URL(record.url).href:'';}
  catch {return '';}
}
// Priest portraits are sourced ONLY from the dedicated priest folder.
// Name each Drive photograph after the corresponding priest (for example, "Sri Rama Sharma.jpg")
// or "priest-1.jpg" in the same order as the published priest profiles.
function priestPhoto(record,index,data){
  const photos=Array.isArray(data.drivePriests)?data.drivePriests:[];
  const normalize=value=>String(value||'').toLowerCase().normalize('NFKD')
    .replace(/\.(jpg|jpeg|png|webp|gif)$/i,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const wanted=normalize(record.title);
  const candidate=photos.find(photo=>photo.id && photo.id===driveId(record.media)) ||
    photos.find(photo=>wanted.length>2 && normalize(photo.title)===wanted) ||
    photos.find(photo=>wanted.length>4 && normalize(photo.title).length>4 && (normalize(photo.title).includes(wanted)||wanted.includes(normalize(photo.title)))) ||
    photos.find(photo=>new RegExp('^(?:priest|priest photo|portrait) '+(index+1)+'$','i').test(normalize(photo.title)));
  if(!candidate)return null;
  return {title:record.title||'Priest photograph',media:candidate.media,id:candidate.id};
}
function priestPicture(record,index,data){
  const photo=priestPhoto(record,index,data);
  if(!photo)return '<div class="priest-fallback" role="img" aria-label="Priest photograph not added">ॐ</div>';
  const source=thumbnail(photo.media);
  return '<img loading="lazy" alt="Portrait of '+esc(record.title||'temple priest')+'" src="'+esc(source)+'" data-drive="'+esc(photo.id)+'">';
}
function hydrateDriveImages(){
  document.querySelectorAll('#sections img[data-drive], #historyDialogPhoto img[data-drive], #heritagePreviewGrid img[data-drive]').forEach(img=>{
    const fallback=async()=>{
      const backup=img.dataset.drive?await getPhoto(img.dataset.drive):'';
      if(!img.isConnected)return;
      if(backup){img.addEventListener('error',()=>img.remove(),{once:true});img.src=backup;}
      else {img.classList.add('gallery-image-unavailable');img.alt='Image preview unavailable';}
    };
    img.addEventListener('error',fallback,{once:true});
    if(img.complete&&img.naturalWidth===0){img.removeEventListener('error',fallback);fallback();}
  });
}
// These image paths are illustrative editorial artwork; the committee's real Drive folders stay authoritative.
const heritageArt = Object.freeze({
  'HERITAGE-KEDARNATH-2026':'heritage-kedarnath.webp',
  'HERITAGE-RAMESWARAM-2026':'heritage-rameswaram.webp',
  'HERITAGE-MEENAKSHI-2026':'heritage-meenakshi.webp'
});
function historyImage(record){
  if(record.cover?.media)return thumbnail(record.cover.media);
  return heritageArt[record.id]||'';
}
function uniqueHistory(items){
  const seen=new Set();
  return (Array.isArray(items)?items:[]).filter(r=>{
    if(!r||!String(r.title||'').trim())return false;
    const key=String(r.id||r.title).trim().toLocaleLowerCase();
    if(seen.has(key))return false;
    seen.add(key);return true;
  });
}
function renderHeritagePreview(items){
 const box=$('heritagePreviewGrid');if(!box)return;
 const entries=[...items.filter(r=>r.id==='HERITAGE-KEDARNATH-2026'),...items.filter(r=>r.id==='HERITAGE-RAMESWARAM-2026'),...items.filter(r=>r.id==='HERITAGE-MEENAKSHI-2026')];
 const chosen=entries.length?entries.slice(0,3):items.slice(0,3);
 box.innerHTML=chosen.length?chosen.map(r=>{
  const i=historyState.records.indexOf(r), image=historyImage(r);
  return '<article class="heritage-preview-card">'+(image?'<div class="heritage-preview-image"><img src="'+esc(image)+'" alt="Illustrative artwork for '+esc(r.title)+'" loading="lazy"><span class="heritage-art-label">'+(heritageArt[r.id]?'Artistic illustration':'Temple photograph')+'</span></div>':'<div class="heritage-preview-image heritage-plain">🛕</div>')+'<div class="heritage-preview-content"><h3>'+esc(r.title)+'</h3><p>'+esc(r.shortText||'Explore this temple and its sacred traditions.')+'</p><button type="button" class="mini-button" data-history-index="'+i+'">Discover history ↗</button></div></article>';
 }).join(''):'<p class="muted">New temple stories will appear after publication in Google Sheets.</p>';
}
function render(data) {
  historyState.records=uniqueHistory(data.templeHistory);
  if($('templeExtras'))$('browse').before($('templeExtras'));
  stopInlineGallery();
  const sections=sorted(data.sections.filter(s=>!['carousel','events','shop'].includes(s.slug)));
  const gallerySection=sections.find(section=>section.slug==='gallery');
  // Drive's dedicated Gallery folder is the authoritative photo album. Content
  // records may add captions, but should not be required for images to appear.
  const listed=gallerySection?data.content.filter(record=>record.section===gallerySection.id&&gallerySrc(record)):[];
  const folderImages=(Array.isArray(data.driveGallery)?data.driveGallery:[]).map(record=>({
    ...record, title:record.title||record.name||'Temple photograph',
    media:record.media||(record.id?'https://drive.google.com/file/d/'+record.id+'/view':''),
    url:record.url||''
  }));
  const seenGallery=new Set();
  galleryViewerItems=[...folderImages,...sorted(listed)].filter(record=>{
    const key=driveId(record.media)||record.id||record.url;
    if(!gallerySrc(record)||seenGallery.has(key))return false;
    seenGallery.add(key);return true;
  });
  const needle=$('search').value.trim().toLowerCase(), filter=$('filter').value, sort=$('sort').value;
  $('nav').innerHTML='<a href="#home" '+(!filter?'aria-current="page"':'')+'>Home</a>'+sections.map(s=>'<a href="#'+esc(s.slug)+'" '+(filter===s.id?'aria-current="page"':'')+'>'+esc(({about:'About',timings:'Timings',sevas:'Sevas',priests:'Priests',gallery:'Gallery',videos:'Videos',articles:'Resources',donations:'Donations',contact:'Visit'}[s.slug]||s.title))+'</a>').join('')+'<a href="#templeExtras">Calendar &amp; Songs</a>';
  const byId=new Map(sections.map(s=>[s.id,s]));
  const pager=$('catalogPager');pager.replaceChildren();
  // Keep the calendar and music visible when navigating directly to any section.
  if(!filter&&!needle){
    const sectionBySlug=slug=>sections.find(s=>s.slug===slug);
    const sectionItems=slug=>{const section=sectionBySlug(slug);return section?sorted(data.content.filter(r=>r.section===section.id)):[];};
    const picture=r=>{if(!r)return '';const src=thumbnail(r.media)||(/\.(?:jpg|jpeg|png|webp)$/i.test(r.url||'')?url(r.url):'');return src?'<img loading="lazy" alt="'+esc(r.title)+'" src="'+esc(src)+'"'+(driveId(r.media)?' data-drive="'+esc(driveId(r.media))+'"':'')+'>':'';};
    const firstPhoto=slug=>sectionItems(slug).find(r=>thumbnail(r.media)||/\.(?:jpg|jpeg|png|webp)$/i.test(r.url||''));
    const block=(title,slug,inner,icon='✿')=>'<section class="temple-panel panel-'+esc(slug)+'" id="panel-'+esc(slug)+'"><div class="temple-panel-title"><span class="panel-icon">'+icon+'</span><h2>'+title+'</h2></div>'+inner+'</section>';
    const about=sectionItems('about');
    const intro=about[0];
    const aboutText=String(intro?.body||sectionBySlug('about')?.summary||'Discover the heritage and traditions of our sacred temple.').replace(/<[^>]*>/g,' ').replace(/\[\[rich-html\]\]/g,'').slice(0,250);
    const aboutHtml='<div class="about-flex">'+(picture(firstPhoto('about')||firstPhoto('gallery'))||'<div class="panel-placeholder">ॐ</div>')+'<div><p>'+esc(aboutText)+'</p><a class="mini-button" href="#about">Read more ›</a></div></div>';
    const sevas=sectionItems('sevas');
    const sevasHtml='<p class="panel-intro">Explore sacred services and worship offerings.</p><div class="seva-list">'+(sevas.slice(0,5).map(r=>'<a href="#sevas">❯ &nbsp; '+esc(r.title)+' <span>›</span></a>').join('')||'<a href="#sevas">View available sevas →</a>')+'</div><a class="mini-button" href="#sevas">View all sevas ›</a>';
    const priests=sectionItems('priests');
    const priestsHtml='<div class="priest-preview">'+((data.drivePriests||[]).slice(0,2).map(photo=>'<a href="#priests"><img loading="lazy" src="'+esc(thumbnail(photo.media))+'" data-drive="'+esc(photo.id)+'" alt="'+esc(photo.title)+'"><strong>'+esc(String(photo.title||'').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' '))+'</strong></a>').join('')||'<p>View temple priest details.</p>')+'</div><a class="mini-button" href="#priests">View all priests ›</a>';
    const timings=sectionItems('timings');
    const timingsHtml='<div class="timing-list">'+(timings.slice(0,6).map(r=>'<a href="#timings"><span>▣ &nbsp; '+esc(r.title)+'</span><strong>'+esc(String(r.extra||'').slice(0,42))+'</strong></a>').join('')||'<a href="#timings">See daily pooja and darshan timings →</a>')+'</div>';
    const gallery=galleryViewerItems;
    const galleryHtml='<div class="gallery-preview">'+gallery.slice(0,4).map((r,i)=>'<button type="button" class="gallery-tile" data-gallery-index="'+i+'" aria-label="View '+esc(r.title)+' in gallery slideshow">'+picture(r)+'</button>').join('')+'</div>'+
      '<a class="mini-button" href="#gallery">Open gallery & slideshow →</a>'+
      (!gallery.length?'<p class="gallery-help">Gallery photos are not loaded yet. Check the Drive connection.</p>':'');
    const videos=sectionItems('videos');
    const video=videos.find(r=>url(r.url));
    const youtube=video?.url?.match(/(?:youtu\.be\/|[?&]v=)([\w-]{11})/)?.[1];
    const videoHtml=youtube?'<div class="video-preview"><iframe title="'+esc(video?.title||'Temple video')+'" loading="lazy" allowfullscreen allow="accelerometer; autoplay; encrypted-media; picture-in-picture" src="https://www.youtube-nocookie.com/embed/'+youtube+'"></iframe></div>':'<a class="video-preview" href="#videos">'+picture(firstPhoto('gallery'))+'<span class="video-play">▶</span></a>';
    const donationList=Array.isArray(data.finance)?data.finance.filter(r=>r.type==='Donation'):(Array.isArray(data.donations)?data.donations:[]);const donationTotal=donationList.reduce((n,r)=>n+Number(r.amountPaise||0),0);const donationsHtml='<div class="donate-panel"><span class="donate-symbol">♡</span><p>Transparent support for daily worship and temple care.</p><strong>₹'+(donationTotal/100).toLocaleString('en-IN',{maximumFractionDigits:2})+' donated</strong><a class="mini-button" href="#donations">Category-wise finances ›</a></div>';
    const visitHtml='<div class="visit-preview temple-live-map"><div><strong>⌖ Chidambareshwara Swamy Temple</strong><p>'+esc(config.place)+'</p><a class="mini-button" href="https://www.google.com/maps/search/?api=1&amp;query=19.1148733%2C84.6807024" target="_blank" rel="noopener noreferrer">Open Google Maps ↗</a></div><iframe loading="lazy" title="Live Google map of Chidambareshwara Swamy Temple, Ichchapuram" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=19.1148733%2C84.6807024&amp;z=17&amp;output=embed" allowfullscreen></iframe></div>';
    const historyRecords=historyState.records;
    renderHeritagePreview(historyRecords);
    const historyHtml='<div class="temple-history-cards">'+(historyRecords.slice(0,3).map((r,i)=>{
      const imageSrc=historyImage(r);
      const photo=imageSrc?'<img loading="lazy" src="'+esc(imageSrc)+'" '+(r.cover?.id?'data-drive="'+esc(r.cover.id)+'"':'')+' alt="'+esc(r.title)+'">':'<div class="history-image-placeholder">🛕</div>';
      return '<article class="temple-history-card">'+photo+'<div class="history-summary"><h3>'+esc(r.title)+'</h3><p>'+esc(r.shortText||'Learn about this sacred place and its heritage.')+'</p><button type="button" class="mini-button" data-history-index="'+i+'">More details →</button></div></article>';
    }).join('')||'<p class="muted">Temple history records will appear here when published.</p>')+'</div>'+(historyRecords.length>3?'<button type="button" class="history-see-more mini-button" id="historySeeMore" aria-expanded="false">See all '+historyRecords.length+' temples →</button>':'');
    $('sections').innerHTML='<div class="temple-dashboard">'+block('About the Temple','about',aboutHtml,'♜')+block('Sevas','sevas',sevasHtml,'✿')+block('Priests','priests',priestsHtml,'♙')+block('Pooja Timings','timings',timingsHtml,'◷')+block('Temple Gallery','gallery',galleryHtml,'▧')+block('Temple Video','videos',videoHtml,'▶')+block('Donations','donations',donationsHtml,'♡')+block('Temple History','history',historyHtml,'♜')+block('Visit & Contact','contact',visitHtml,'⌖')+'</div>';
    // The reference design places calendar and music immediately after the hero.
    $('templeExtras').hidden=false;
    $('resultCount').textContent='';
  } else {
    const selected=byId.get(filter);
    const items=sorted(data.content.filter(r=>byId.has(r.section)&&(!filter||r.section===filter)&&(!needle||[byId.get(r.section)?.title,r.title,r.body,r.extra].some(v=>String(v||'').toLowerCase().includes(needle)))));
    if(sort==='name')items.sort((a,b)=>a.title.localeCompare(b.title));
    if(sort==='recent')items.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    const limit=8, pages=Math.max(1,Math.ceil(items.length/limit));
    catalogPage=Math.min(catalogPage,pages-1);
    const cards=items.slice(catalogPage*limit,(catalogPage+1)*limit).map(r=>{
      const section=byId.get(r.section);
      const text=r.body||'', formatted=TempleRich.html(text);
      const body=text.length>290||text.startsWith('[[rich-html]]')?'<details class="public-details"><summary>Read more</summary><div class="rich-text">'+formatted+'</div></details>':'<div class="rich-text">'+formatted+'</div>';
      return '<article class="card"><h3>'+esc(r.title)+'</h3>'+(r.date?'<time datetime="'+esc(r.date)+'">'+esc(r.date)+'</time>':'')+(r.extra?'<p class="card-meta">'+esc(r.extra)+'</p>':'')+'<div class="actions">'+media(r,['gallery','priests','about','articles'].includes(section.slug))+'</div>'+body+(section.slug==='sevas'&&$('request').href?'<a class="button compact secondary" href="'+esc($('request').href)+'">Request a seva ↗</a>':'')+'</article>';
    }).join('');
    if(selected?.slug==='videos') {
      const records=sorted(data.content.filter(r=>r.section===selected.id));
      const cards=records.map(r=>{
        const id=youtubeVideoId(r.url||r.media||'');
        if(!id)return '<article class="temple-video-card"><div class="temple-video-frame video-empty">Video unavailable</div><div class="temple-video-details"><h3>'+esc(r.title||'Temple video')+'</h3></div></article>';
        return '<article class="temple-video-card"><div class="temple-video-frame" data-video-id="'+id+'" data-play-state="still" tabindex="0" role="button" aria-label="Play '+esc(r.title||'Temple video')+'"><img loading="lazy" alt="" src="https://i.ytimg.com/vi/'+id+'/hqdefault.jpg"><button type="button" class="temple-video-play" aria-label="Play '+esc(r.title||'Temple video')+'">▶</button></div><div class="temple-video-details"><h3>'+esc(r.title||'Temple video')+'</h3>'+(r.body?'<p>'+esc(String(r.body).replace(/<[^>]*>/g,' ').slice(0,125))+'</p>':'')+'</div></article>';
      }).join('');
      $('sections').innerHTML='<section class="temple-video-collection"><div class="video-collection-heading"><p class="gallery-overline">TEMPLE VIDEOS</p><h2>Videos</h2><p class="muted">Select a video to play on this page.</p></div><div class="temple-video-grid">'+(cards||'<p>No videos available.</p>')+'</div></section>';
      $('resultCount').textContent='';
      mountVideoPreviewFrames();return;
    }
    if(selected?.slug==='priests') {
      const sectionRecords=sorted(data.content.filter(r=>r.section===selected.id));
      const photos=Array.isArray(data.drivePriests)?data.drivePriests:[];
      const normalize=v=>String(v||'').normalize('NFKD').toLowerCase().replace(/\.[^.]+$/,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
      const photoCards=photos.map(photo=>{
        const name=String(photo.title||'Temple priest').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();
        const matched=sectionRecords.find(r=>normalize(r.title)===normalize(photo.title));
        const id=driveId(photo.media)||photo.id;
        return '<article class="priest-profile-card"><button type="button" class="priest-photo-open" data-priest-image><img loading="lazy" alt="'+esc(name)+'" src="'+esc(thumbnail(photo.media))+'" data-drive="'+esc(id)+'"></button><div class="priest-profile-info"><h3>'+esc(name)+'</h3>'+(matched?.extra?'<p>'+esc(matched.extra)+'</p>':'')+'</div></article>';
      });
      const matchedNames=new Set(photos.map(p=>normalize(p.title)));
      const unpictured=sectionRecords.filter(r=>!matchedNames.has(normalize(r.title))).map(r=>'<article class="priest-profile-card"><div class="priest-photo-placeholder">ॐ</div><div class="priest-profile-info"><h3>'+esc(r.title)+'</h3><p>Portrait not yet matched</p></div></article>');
      $('sections').innerHTML='<section class="priest-directory"><div class="priest-directory-heading"><p class="gallery-overline">TEMPLE PRIESTS</p><h2>Our Priests</h2></div><div class="priest-directory-grid">'+([...photoCards,...unpictured].join('')||'<p>No priest photographs available.</p>')+'</div></section>';
      $('resultCount').textContent='';hydrateDriveImages();return;
    }
    if(selected?.slug==='gallery') {
      const galleryCards=galleryViewerItems.map((r,i)=>{
        const image=gallerySrc(r);
        return '<button type="button" class="gallery-explore-card" data-gallery-index="'+i+'" aria-label="Full view: '+esc(r.title)+'">'+
          '<span class="gallery-explore-image"><img loading="lazy" alt="'+esc(r.title)+'" src="'+esc(image)+'"'+(driveId(r.media)?' data-drive="'+esc(driveId(r.media))+'"':'')+'></span>'+
          '<span class="gallery-explore-meta"><strong>'+esc(r.title||'Temple photograph')+'</strong><span>⛶ Full view</span></span></button>';
      }).join('');
      const collectionActions=galleryViewerItems.length?'<div class="gallery-collection-actions"><button type="button" class="gallery-start-button" id="galleryOpenFirst">⛶ Open gallery viewer</button><button type="button" class="gallery-play-button" id="galleryStartSlideshow">▶ Start slideshow</button></div>':'';
      $('sections').innerHTML='<section class="devotee-gallery"><div class="gallery-explore-heading"><div><p class="gallery-overline">TEMPLE MOMENTS</p><h2>Photo Gallery</h2><p class="muted">Explore all photos from the temple Google Drive gallery. Select any photo to see it full-size and browse with slideshow controls.</p></div><span class="gallery-count-pill">'+galleryViewerItems.length+' photographs</span></div>'+collectionActions+
        (galleryCards?'<div class="gallery-explore-grid" aria-label="All temple photographs">'+galleryCards+'</div>':'<p class="gallery-empty-state">No Gallery images were returned from Google Drive. Check that the folder has photos and the current Apps Script deployment has Drive access.</p>')+'</section>';
      $('resultCount').textContent='';hydrateDriveImages();
      if($('galleryOpenFirst')) $('galleryOpenFirst').onclick=()=>openGalleryViewer(0);
      if($('galleryStartSlideshow')) $('galleryStartSlideshow').onclick=()=>{openGalleryViewer(0);$('viewerPlay').click();};
      return;
    }
    if(selected?.slug==='donations'&&Array.isArray(data.finance||data.donations)){
      // Public finance: active transactions only; never expose private donor identities or notes.
      const finance=(data.finance||data.donations.map(r=>({...r,type:'Donation'}))).filter(r=>['Donation','Expense'].includes(r.type));
      const money=n=>'₹'+(Number(n||0)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
      const total=type=>finance.filter(r=>r.type===type).reduce((n,r)=>n+Number(r.amountPaise||0),0);
      const donated=total('Donation'),spent=total('Expense');
      const groups=[];
      for(const record of finance){
        const category=record.category||'General';
        let group=groups.find(g=>g.type===record.type&&g.category===category);
        if(!group){group={type:record.type,category,records:[],total:0};groups.push(group);}
        group.records.push(record);group.total+=Number(record.amountPaise||0);
      }
      groups.sort((a,b)=>a.type.localeCompare(b.type)||b.total-a.total||a.category.localeCompare(b.category));
      const categories=[...new Set(groups.map(g=>g.category))].sort();
      const publicDonors=new Map();
      for(const record of finance) {
        if(record.type!=='Donation'||!record.donorKey||!record.donorName) continue;
        const key=String(record.donorKey);
        if(!publicDonors.has(key)) publicDonors.set(key,{key,name:record.donorName,records:[],total:0});
        const donor=publicDonors.get(key);
        donor.records.push(record);donor.total+=Number(record.amountPaise||0);
      }
      const donorList=[...publicDonors.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
      $('sections').innerHTML=`<section class="public-donations finance-public">
        <div class="finance-heading"><div><p class="finance-kicker">TRANSPARENT TEMPLE FINANCES</p><h2>Donations & Expenses</h2><p class="muted">Read-only finances with donor names shown only when consent has been recorded.</p></div><span class="finance-readonly">🔒 Public view · No editing</span></div>
        <div class="public-finance-stats">
          <div class="finance-stat-card donation"><span>♡ Active donations</span><strong>${money(donated)}</strong><small>Contributions recorded</small></div>
          <div class="finance-stat-card expense"><span>↗ Active expenses</span><strong>${money(spent)}</strong><small>Temple expenditure</small></div>
          <div class="finance-stat-card balance"><span>◈ Net balance</span><strong>${money(donated-spent)}</strong><small>Donations minus expenses</small></div>
        </div>
        <div class="finance-section-title"><div><p class="finance-kicker">EXPLORE BY CATEGORY</p><h3>Category-wise breakdown</h3></div><span>Select a card to see its records</span></div>
        <div class="finance-public-toolbar"><label>Search categories<input id="donationSearch" type="search" placeholder="Search category names…"></label><label>Transaction type<select id="donationType"><option value="All">All categories</option><option value="Donation">Donations</option><option value="Expense">Expenses</option></select></label><label>Category<select id="donationCategory"><option value="">Every category</option>${categories.map(cat=>'<option value="'+esc(cat)+'">'+esc(cat)+'</option>').join('')}</select></label></div>
        <div id="financeCategories" class="finance-category-grid"></div>
<p class="finance-footnote">Only active records are included. Donor names and public notes appear inside category details only when approved for public display.</p>
      </section><dialog id="financeDialog" class="finance-dialog" aria-labelledby="financeDialogTitle"><div class="finance-dialog-top"><h2 id="financeDialogTitle">Category details</h2><button type="button" id="financeDialogClose" aria-label="Close category details">✕</button></div><div id="financeDialogBody"></div></dialog>`;
      const dialog=$('financeDialog');
      $('financeDialogClose').onclick=()=>dialog.close();
      dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
      // Finance details use a centered, searchable, sortable table rather than a long text list.
      const openFinanceDetails=(title,records,total,description)=>{
        $('financeDialogTitle').textContent=title;
        $('financeDialogBody').innerHTML='<div class="finance-popup-summary"><span>'+records.length+' record'+(records.length===1?'':'s')+'</span><strong>'+money(total)+'</strong></div>'+
          (description?'<p class="finance-history-disclaimer">'+esc(description)+'</p>':'')+
          '<div class="finance-detail-controls"><label>Search details<input id="financeDetailSearch" type="search" placeholder="Date, category, donor or note…"></label><label>Sort by<select id="financeDetailSort"><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="high">Highest amount</option><option value="low">Lowest amount</option></select></label></div>'+
          '<div class="finance-detail-scroll"><table class="finance-detail-table"><thead><tr><th>Date</th><th>Donor / Details</th><th>Category</th><th>Amount</th></tr></thead><tbody id="financeDetailRows"></tbody></table></div><p id="financeDetailCount" class="finance-detail-count"></p>';
        const refresh=()=>{
          const q=$('financeDetailSearch').value.trim().toLowerCase(),sortBy=$('financeDetailSort').value;
          const filtered=records.filter(r=>!q||[r.date,r.category,r.donorName,r.publicNote,r.type].some(value=>String(value||'').toLowerCase().includes(q)));
          filtered.sort((a,b)=>sortBy==='oldest'?String(a.date||'').localeCompare(String(b.date||'')):
            sortBy==='high'?Number(b.amountPaise||0)-Number(a.amountPaise||0):
            sortBy==='low'?Number(a.amountPaise||0)-Number(b.amountPaise||0):
            String(b.date||'').localeCompare(String(a.date||'')));
          $('financeDetailRows').innerHTML=filtered.length?filtered.map(r=>{
            const donor=r.donorName&&r.donorKey?'<button class="finance-donor-link" type="button" data-public-donor="'+esc(r.donorKey)+'">'+esc(r.donorName)+' ↗</button>':'<span class="ledger-anonymous">'+(r.type==='Expense'?'Temple expense':'Anonymous donor')+'</span>';
            return '<tr><td>'+esc(r.date||'—')+'</td><td>'+donor+(r.publicNote?'<small class="finance-detail-note">'+esc(r.publicNote)+'</small>':'')+'</td><td>'+esc(r.category||'General')+'</td><td class="finance-detail-amount">'+money(r.amountPaise)+'</td></tr>';
          }).join(''):'<tr><td colspan="4" class="ledger-empty">No records match this search.</td></tr>';
          $('financeDetailCount').textContent='Showing '+filtered.length+' of '+records.length+' records';
        };
        $('financeDetailSearch').oninput=refresh;$('financeDetailSort').onchange=refresh;refresh();
        if(!dialog.open)dialog.showModal();
      };
      const showCategory=index=>{
        const group=groups[index];if(!group)return;
        openFinanceDetails(group.category+' · '+(group.type==='Donation'?'Donations':'Expenses'),group.records,group.total,'Read-only temple financial records.');
      };
      const showDonor=key=>{
        const donor=publicDonors.get(key);if(!donor)return;
        openFinanceDetails(donor.name+' · Donation history',donor.records,donor.total,'Only donations approved for public display are included. Contact information and internal notes remain private.');
      };
      $('financeDialogBody').addEventListener('click',event=>{
        const button=event.target.closest('[data-public-donor]');if(button) showDonor(button.dataset.publicDonor);
      });
      const update=()=>{
        const search=$('donationSearch').value.trim().toLowerCase(),type=$('donationType').value,category=$('donationCategory').value;
        const shown=groups.map((g,index)=>({...g,index})).filter(g=>(type==='All'||g.type===type)&&(!category||g.category===category)&&(!search||g.category.toLowerCase().includes(search)));
        $('financeCategories').innerHTML=shown.length?shown.map(g=>`<button type="button" class="finance-category-card ${g.type==='Expense'?'expense':'donation'}" data-category-index="${g.index}"><span class="category-card-icon" aria-hidden="true">${g.type==='Expense'?'↗':'♡'}</span><span class="category-card-type">${g.type==='Donation'?'DONATIONS':'EXPENSES'}</span><strong>${esc(g.category)}</strong><span class="category-card-total">${money(g.total)}</span><small>${g.records.length} records</small><span class="category-card-link">View category details →</span></button>`).join(''):'<p class="empty">No matching categories.</p>';
        $('financeCategories').querySelectorAll('[data-category-index]').forEach(button=>{button.onclick=()=>showCategory(Number(button.dataset.categoryIndex));});
      };
      ['donationSearch','donationType','donationCategory'].forEach(id=>$(id).addEventListener(id==='donationSearch'?'input':'change',update));
      update();return;
    }
    $('sections').innerHTML='<h2>'+esc(selected?.title||'Search results')+'</h2>'+(selected?.summary?'<p>'+esc(selected.summary)+'</p>':'')+(cards?'<div class="grid">'+cards+'</div>':'<p class="empty">No published items match this view.</p>');
    $('resultCount').textContent='';
    if(pages>1){
      for(const [label,d] of [['Previous',-1],['Next',1]]){
        const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent=label;button.disabled=catalogPage+d<0||catalogPage+d>=pages;
        button.onclick=()=>{catalogPage+=d;render(data);$('browse').scrollIntoView();};pager.append(button);
      }
      const count=document.createElement('span');count.textContent=(catalogPage+1)+' / '+pages;pager.insertBefore(count,pager.lastChild);
    }
  }
  hydrateDriveImages();
}
function renderAnnouncements(data) {
  const section=data.sections.find(s=>s.slug==='announcements');
  const bar=$('announcementBar'), ticker=$('announcementTicker');
  if(!section){bar.hidden=true;return;}
  const notices=sorted(data.content.filter(r=>r.section===section.id&&String(r.title||r.body||'').trim()));
  if(!notices.length){bar.hidden=true;return;}
  const texts=notices.map(r=>[r.title,r.extra].filter(Boolean).join(' — ')||String(r.body||'').replace(/<[^>]+>/g,' ').slice(0,180));
  ticker.replaceChildren();
  for(let i=0;i<2;i++)for(const text of texts){const span=document.createElement('span');span.textContent='✦  '+text;ticker.append(span);}
  ticker.style.setProperty('--ticker-seconds',Math.max(18,texts.join(' ').length*.16)+'s');
  bar.hidden=false;
  $('announcementPause').onclick=()=>{const paused=ticker.classList.toggle('paused');$('announcementPause').textContent=paused?'▶':'Ⅱ';$('announcementPause').setAttribute('aria-label',paused?'Resume announcements':'Pause announcements');};
}
// On-page gallery slideshow: accessible even before opening the fullscreen dialog.
let inlineGalleryTimer=null;
function stopInlineGallery(){
  clearInterval(inlineGalleryTimer);inlineGalleryTimer=null;
  if($('galleryInlinePlay')){$('galleryInlinePlay').textContent='▶ Start slideshow';$('galleryInlinePlay').setAttribute('aria-pressed','false');}
}
function initInlineGallery(){
  stopInlineGallery();
  if(!$('galleryInlineImage')||!galleryViewerItems.length)return;
  let current=0,serial=0;
  const image=$('galleryInlineImage'),counter=$('galleryInlineCounter');
  const thumbs=$('galleryInlineThumbnails');
  thumbs.innerHTML=galleryViewerItems.map((r,i)=>'<button type="button" data-inline-index="'+i+'" aria-label="Preview photo '+(i+1)+': '+esc(r.title||'Temple photo')+'"><img loading="lazy" alt="" src="'+esc(gallerySrc(r))+'"'+(driveId(r.media)?' data-drive="'+esc(driveId(r.media))+'"':'')+'></button>').join('');
  const draw=async index=>{
    current=(index+galleryViewerItems.length)%galleryViewerItems.length;
    const turn=++serial,record=galleryViewerItems[current];
    const fallbackId=driveId(record.media)||record.id||'';
    image.alt=record.title||'Temple photo';
    $('galleryInlineTitle').textContent=record.title||'Temple photo';
    counter.textContent=(current+1)+' / '+galleryViewerItems.length;
    image.onerror=async()=>{
      image.onerror=null;
      if(!fallbackId)return $('galleryInlineLoading').hidden=false;
      const photo=await getPhoto(fallbackId);
      if(serial!==turn)return;
      if(photo){image.onerror=()=>{$('galleryInlineLoading').hidden=false;};image.src=photo;}
      else $('galleryInlineLoading').hidden=false;
    };
    $('galleryInlineLoading').hidden=true;
    image.src=gallerySrc(record);
    [...thumbs.children].forEach((button,i)=>button.setAttribute('aria-current',String(i===current)));
    thumbs.children[current]?.scrollIntoView({inline:'nearest',block:'nearest'});
  };
  $('galleryInlinePrev').onclick=()=>draw(current-1);
  $('galleryInlineNext').onclick=()=>draw(current+1);
  $('galleryInlineFull').onclick=()=>openGalleryViewer(current);
  $('galleryInlinePlay').onclick=()=>{
    if(inlineGalleryTimer)return stopInlineGallery();
    $('galleryInlinePlay').textContent='Ⅱ Pause slideshow';$('galleryInlinePlay').setAttribute('aria-pressed','true');
    inlineGalleryTimer=setInterval(()=>{if(document.hidden||!image.isConnected)return stopInlineGallery();draw(current+1);},5000);
  };
  $('galleryInlinePreviews').onclick=()=>{
    const show=thumbs.hidden;thumbs.hidden=!show;
    $('galleryInlinePreviews').textContent=show?'▤ Hide previews':'▤ Show previews';
    $('galleryInlinePreviews').setAttribute('aria-pressed',String(show));
  };
  thumbs.onclick=event=>{const btn=event.target.closest('[data-inline-index]');if(btn)draw(Number(btn.dataset.inlineIndex));};
  let startX=0;
  $('galleryInlineImage').addEventListener('touchstart',event=>{startX=event.changedTouches[0]?.screenX||0;},{passive:true});
  $('galleryInlineImage').addEventListener('touchend',event=>{const dx=(event.changedTouches[0]?.screenX||0)-startX;if(Math.abs(dx)>50)draw(current+(dx>0?-1:1));},{passive:true});
  draw(0);
}
function carousel(data) {
  const custom=data.sections.find(s=>s.slug==='carousel');
  // Use published gallery/about photos until the carousel section has published slides.
  const candidates=id=>sorted(data.content.filter(r=>r.section===id&&(thumbnail(r.media)||url(r.url))));
  const preferred=custom?candidates(custom.id):[];
  const defaultSlides=['about','gallery'].flatMap(slug=>{
    const section=data.sections.find(s=>s.slug===slug);
    return section?candidates(section.id):[];
  });
  const driveSlides=Array.isArray(data.driveCarousel)?data.driveCarousel:[];
  const slides=(driveSlides.length?driveSlides:(preferred.length?preferred:defaultSlides)).slice(0,30);
  if(!slides.length){
    $('carousel').hidden=false;
    $('photoStatus').textContent='No carousel photos loaded from Google Drive';
    $('heroSlideCaption').textContent='Carousel photos unavailable';
    for(const id of ['photoPrev','photoNext','photoPause','photoFullscreen'])$(id).hidden=true;
    const retry=document.createElement('button');retry.type='button';retry.className='carousel-retry';retry.textContent='↻ Retry loading';
    retry.onclick=()=>location.reload();$('photoDots').replaceChildren(retry);
    return;
  }
  const hero=document.querySelector('.hero-media');
  const stage=$('heroImageStage');
  let current=0, serial=0, timer=null, paused=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dots=$('photoDots');
  const pauseButton=$('photoPause');
  const schedule=()=>{clearTimeout(timer);if(!paused&&slides.length>1)timer=setTimeout(()=>draw(current+1),7000);};
  if(pauseButton){pauseButton.hidden=slides.length<2;pauseButton.onclick=()=>{paused=!paused;pauseButton.textContent=paused?'▶ Play':'Ⅱ Pause';pauseButton.setAttribute('aria-pressed',String(paused));schedule();};pauseButton.textContent=paused?'▶ Play':'Ⅱ Pause';}
  hero.addEventListener('mouseenter',()=>clearTimeout(timer));
  hero.addEventListener('mouseleave',schedule);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(timer);else schedule();});
  let startX=0;
  hero.addEventListener('touchstart',event=>{startX=event.changedTouches[0]?.screenX||0;},{passive:true});
  hero.addEventListener('touchend',event=>{const diff=(event.changedTouches[0]?.screenX||0)-startX;if(Math.abs(diff)>55)draw(current+(diff>0?-1:1));},{passive:true});
  slides.forEach((slide,i)=>{
    const button=document.createElement('button');
    button.type='button';button.className='photo-dot';button.setAttribute('aria-label','Show photo '+(i+1));
    button.onclick=()=>draw(i);dots.append(button);
  });
  async function draw(index) {
    current=(index+slides.length)%slides.length;
    const turn=++serial, slide=slides[current];
    const image=new Image();image.alt='';
    const load=source=>new Promise(resolve=>{
      image.onload=()=>resolve(true);image.onerror=()=>resolve(false);
      if(source) image.src=source;else resolve(false);
    });
    const initial=thumbnail(slide.media)||slide.url;
    let ready=await load(initial);
    if(!ready&&driveId(slide.media)) ready=await load(await getPhoto(driveId(slide.media)));
    if(turn!==serial) return;
    if(ready){image.alt=slide.title||'Temple photograph';stage.querySelector('img')?.remove();stage.prepend(image);stage.classList.add('has-photo');$('photoFullscreen').onclick=()=>openImageViewer(image.src,slide.title);}else{stage.querySelector('img')?.remove();stage.classList.remove('has-photo');$('photoFullscreen').onclick=()=>{};}
    $('heroSlideCaption').textContent=slide.title||'Temple moments';
    $('photoStatus').textContent=(current+1)+' / '+slides.length+(ready?'':' · Unavailable');
    [...dots.children].forEach((dot,i)=>dot.setAttribute('aria-current',i===current?'true':'false'));
    schedule();
  }
  $('carousel').hidden=false;
  $('photoPrev').onclick=()=>draw(current-1);
  $('photoNext').onclick=()=>draw(current+1);
  $('carousel').onkeydown=event=>{
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
      event.preventDefault();draw(current+(event.key==='ArrowLeft'?-1:1));
    }
  };
  draw(0);
}
(async()=>{
  $('brand').textContent=$('temple').textContent=config.name;
  $('place').textContent=config.place;
  document.title=config.name;
  if(url(config.hero)) {
    const hero=new Image();hero.src=config.hero;hero.alt='';
    document.getElementById('heroImageStage').prepend(hero);
  }
  if(!url(config.endpoint)) {
    $('notice').textContent='Temple listings will appear here when the site is connected to Google Sheets.';
    return;
  }
  for(const id of ['admin','request']) {
    const target=new URL(config.endpoint);
    target.searchParams.set('view',id);
    $(id).href=target.href;$(id).hidden=false;
  }
  $('notice').textContent='Loading temple information…';
  const fetchCatalog=async endpoint=>{
    const response=await fetch(endpoint,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(22000)});
    if(!response.ok) throw new Error('Catalog unavailable');
    const data=await response.json();
    if(!Array.isArray(data.sections)||!Array.isArray(data.content)) throw new Error('Unexpected catalog format');
    return data;
  };
  try {
    let data;
    try {data=await fetchCatalog(config.endpoint);$('notice').hidden=true;}
    catch {data=await fetchCatalog('./catalog.json');$('notice').textContent='Showing the last saved temple information. Live updates are temporarily unavailable.';}
    // Gallery/carousel folders are fetched independently when the catalog is stale
    // or a folder is temporarily unavailable. This avoids a blank slider on fallback.
    if(!(Array.isArray(data.driveCarousel)&&data.driveCarousel.length)||
       !(Array.isArray(data.driveGallery)&&data.driveGallery.length)) {
      try {
        const mediaUrl=new URL(config.endpoint);
        mediaUrl.searchParams.set('view','publicMedia');
        const response=await fetch(mediaUrl,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(16000)});
        if(!response.ok)throw new Error('Photo service unavailable');
        const albums=await response.json();
        if(Array.isArray(albums.driveCarousel)&&albums.driveCarousel.length)data.driveCarousel=albums.driveCarousel;
        if(Array.isArray(albums.driveGallery)&&albums.driveGallery.length)data.driveGallery=albums.driveGallery;
        if(Array.isArray(albums.drivePriests)&&albums.drivePriests.length)data.drivePriests=albums.drivePriests;
      } catch(error) {console.warn('Google Drive album lookup could not complete:',error.message);}
    }
    // Drive folder photos appear even if no Gallery catalog records were published.
    if(!data.sections.some(s=>s.slug==='gallery')){
      data.sections.push({id:'drive-gallery-section',slug:'gallery',title:'Gallery',summary:'Temple photographs',order:7,status:'Published'});
    }
    const sections=sorted(data.sections.filter(s=>!['carousel','events','shop'].includes(s.slug)));
    renderAnnouncements(data);
    mountTempleExtras(data);
    for(const section of sections) $('filter').add(new Option(section.title,section.id));
    const published=new Set(sections.map(section=>section.slug));
    $('heroTimings').hidden=!published.has('timings');
    const route=()=>{
      const slug=location.hash.slice(1);
      $('filter').value=sections.find(s=>s.slug===slug)?.id||'';
      $('search').value='';catalogPage=0;render(data);
      const navToggle=$('mobileNavToggle');
      if(navToggle){navToggle.setAttribute('aria-expanded','false');document.querySelector('.strip')?.classList.remove('nav-open');}
      if(slug==='home'){window.scrollTo({top:0,behavior:'smooth'});return;}
      if(slug==='templeExtras'||slug==='templeLiveTV'){(slug==='templeLiveTV'?$('templeLiveTV'):$('templeExtras')).scrollIntoView({block:'start',behavior:'smooth'});return;}
      if(slug){const panel=$('sections').querySelector('#panel-'+CSS.escape(slug));(panel||$('browse')).scrollIntoView({block:'start',behavior:'smooth'});}
    };
    addEventListener('hashchange',route);
    $('nav').addEventListener('click',event=>{
      const link=event.target.closest('a');
      if(link?.hash===location.hash)route();
    });
    $('mobileNavToggle')?.addEventListener('click',()=>{
      const strip=document.querySelector('.strip'),opened=strip.classList.toggle('nav-open');
      $('mobileNavToggle').setAttribute('aria-expanded',String(opened));
    });
    $('search').addEventListener('input',()=>{catalogPage=0;render(data);});
    $('sort').addEventListener('change',()=>{catalogPage=0;render(data);});
    $('filter').addEventListener('change',()=>{
      const hash='#'+(sections.find(s=>s.id===$('filter').value)?.slug||'browse');
      history.replaceState(null,'',hash);catalogPage=0;render(data);
    });
    $('controls').hidden=true;
    // Initial load must preserve the hero position; only user navigation should scroll.
    const initialSlug=location.hash.slice(1);
    if(initialSlug && !['home','browse'].includes(initialSlug)) {route();}
    else { $('filter').value=''; render(data); requestAnimationFrame(()=>window.scrollTo(0,0)); }
    carousel(data);
  } catch {$('notice').textContent='Temple information is temporarily unavailable.';}
})();

// Month navigation and weekday audio: data is maintained in the same Google Sheet.
const templeTZ='Asia/Kolkata';
const teluguWeek=['ఆది','సోమ','మంగళ','బుధ','గురు','శుక్ర','శని'];
let calendarAnchor=new Date(),extrasCatalog={festivals:[],audio:[]};
function templeToday(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:templeTZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const x=Object.fromEntries(p.map(z=>[z.type,z.value]));return x.year+'-'+x.month+'-'+x.day;}
function templeDateKey(y,m,d){return y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');}
function drawTempleCalendar(){
 const y=calendarAnchor.getFullYear(),m=calendarAnchor.getMonth();
 $('calMonth').textContent=new Intl.DateTimeFormat('te-IN',{year:'numeric',month:'long'}).format(new Date(y,m,1));
 $('calWeekdays').innerHTML=teluguWeek.map(t=>'<span>'+t+'</span>').join('');
 const start=new Date(y,m,1).getDay(),length=new Date(y,m+1,0).getDate(),today=templeToday();
 const events=Array.isArray(extrasCatalog.festivals)?extrasCatalog.festivals:[];
 let days='';for(let n=0;n<start;n++)days+='<span class="calendar-blank"></span>';
 for(let d=1;d<=length;d++){const key=templeDateKey(y,m,d),hit=events.filter(e=>e.date===key);days+='<button type="button" class="calendar-day'+(key===today?' is-today':'')+(hit.length?' has-festival':'')+'" data-event-date="'+key+'" aria-label="'+key+(hit.length?', '+hit.map(e=>e.title).join(', '):'')+'"><span>'+d+'</span>'+(hit.length?'<i aria-hidden="true"></i>':'')+'</button>';}
 $('calDays').innerHTML=days;
 const monthEvents=events.filter(e=>typeof e.date==='string'&&e.date.startsWith(y+'-'+String(m+1).padStart(2,'0')+'-')).sort((a,b)=>a.date.localeCompare(b.date));
 $('calEvents').innerHTML='<h3>ఈ నెల పండుగలు · Festivals</h3>'+(monthEvents.length?monthEvents.map(e=>'<div class="festival-event"><time datetime="'+esc(e.date)+'">'+esc(e.date.slice(8))+'</time><div><strong>'+esc(e.title)+'</strong>'+(e.notes?'<p>'+esc(e.notes)+'</p>':'')+'</div></div>').join(''):'<p class="muted">No festival entries have been published for this month yet.</p>');
}
function mountTempleExtras(data){
 extrasCatalog={audio:Array.isArray(data.audio)?data.audio:[],festivals:Array.isArray(data.festivals)?data.festivals:[]};
 const today=templeToday(), parts=today.split('-').map(Number);calendarAnchor=new Date(parts[0],parts[1]-1,1);
 drawTempleCalendar();
 const weekday=new Date(Date.UTC(parts[0],parts[1]-1,parts[2])).getUTCDay();
 initializeAudioGallery(extrasCatalog.audio,weekday);
 renderTempleLiveTV(data.liveTV||[]);
}
// Devotional playlist: one featured track per weekday, plus unlimited other tracks (weekday=7).
const audioGallery={tracks:[],queue:[],current:-1,shuffle:false,repeat:false,mode:'daily',today:0};
const WEEK_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function audioStreamURL(record){
 const source=String(record?.driveUrl||'').trim();
 if(!/^https:\/\//i.test(source))return '';
 // Keep direct HTTPS audio links intact; legacy Drive links often cannot stream reliably.
 const drive=source.match(/(?:drive\.google\.com\/file\/d\/|[?&]id=)([A-Za-z0-9_-]+)/);
 return drive?'https://drive.google.com/uc?export=download&id='+encodeURIComponent(drive[1]):source;
}
function audioListOrder(){return audioGallery.tracks.map((_,i)=>i);}
function audioShuffle(queue){
 const result=[...queue];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
 return result;
}
function audioQueueMode(mode,selected){
 audioGallery.mode=mode;
 let queue=audioListOrder();
 if(mode==='gallery')queue=queue.filter(i=>Number(audioGallery.tracks[i].weekday)===7);
 if(mode==='weekday')queue=queue.filter(i=>Number(audioGallery.tracks[i].weekday)<7);
 if(audioGallery.shuffle)queue=audioShuffle(queue);
 if(selected!=null&&queue.includes(selected))queue=[selected,...queue.filter(i=>i!==selected)];
 audioGallery.queue=queue;
 return queue.length?queue[0]:-1;
}
function audioSetTrack(index,autoplay){
 if(index<0||!audioGallery.tracks[index])return;
 audioGallery.current=index;
 const record=audioGallery.tracks[index];
 const container=$('weekdayAudio');
 const cover=record.imageUrl?'<img class="audio-cover" loading="lazy" src="'+esc(thumbnail(record.imageUrl))+'" alt="'+esc(record.title)+' cover">':'<div class="audio-cover audio-cover-placeholder">♫</div>';
 const day=Number(record.weekday)===7?'Audio gallery':WEEK_NAMES[Number(record.weekday)]+' · '+teluguWeek[Number(record.weekday)];
 container.innerHTML='<div class="audio-song-wrap">'+cover+'<div class="audio-song-details"><div class="audio-current-day">'+esc(day)+'</div><h3>'+esc(record.title)+'</h3><audio id="templeAudioPlayer" controls preload="metadata" src="'+esc(audioStreamURL(record))+'">Your browser does not support audio.</audio><p id="templeAudioError" class="audio-stream-error" role="status" hidden>Song unavailable. Check that the Audio sheet has a playable public MP3 URL (Cloudinary recommended).</p></div></div>';
 const player=$('templeAudioPlayer');
 player.addEventListener('ended',()=>audioNext(true));
 player.addEventListener('error',()=>{$('templeAudioError').hidden=false;});
 renderAudioGallery();
 if(autoplay){const promise=player.play();if(promise&&promise.catch)promise.catch(()=>{});}
}
function audioNext(autoplay){
 const q=audioGallery.queue;if(!q.length)return;
 const currentPos=q.indexOf(audioGallery.current);
 if(currentPos===q.length-1&&!audioGallery.repeat){const player=$('templeAudioPlayer');if(player)player.pause();$('audioPlaylistStatus').textContent='Playlist complete · Select Play all to listen again';return;}
 const next=q[(currentPos+1+q.length)%q.length];audioSetTrack(next,autoplay);
}
function audioPrev(){const q=audioGallery.queue;if(!q.length)return;const i=q.indexOf(audioGallery.current);audioSetTrack(q[(i-1+q.length)%q.length],true);}
function renderAudioGallery(){
 const ag=audioGallery,active=ag.current;
 $('audioWeek').innerHTML=WEEK_NAMES.map((day,n)=>{
  const index=ag.tracks.findIndex(t=>Number(t.weekday)===n);
  return '<button type="button" class="audio-week-chip'+(n===ag.today?' current':'')+(index===active?' is-selected':'')+'" data-audio-week="'+n+'" '+(index<0?'disabled':'')+'>'+esc(teluguWeek[n]+' · '+day)+'</button>';
 }).join('');
 const grid=$('audioGalleryTracks');
 grid.innerHTML=ag.tracks.length?ag.tracks.map((track,i)=>'<button type="button" class="audio-track'+(i===active?' active':'')+'" data-audio-index="'+i+'" aria-current="'+(i===active?'true':'false')+'"><span class="audio-track-icon">'+(i===active?'♫':'▶')+'</span><span><strong>'+esc(track.title)+'</strong><small>'+esc(Number(track.weekday)===7?'Audio gallery':WEEK_NAMES[Number(track.weekday)])+'</small></span></button>').join(''):'<p class="muted">Add published tracks in the Audio sheet to see your playlist here.</p>';
 const status=$('audioPlaylistStatus');if(status)status.textContent=(active>=0?String(active+1)+' of '+ag.tracks.length+' songs':'No song selected')+(ag.shuffle?' · Shuffle on':'');
 const sh=$('audioShuffle');sh.setAttribute('aria-pressed',String(ag.shuffle));sh.textContent=ag.shuffle?'⇄ Shuffle on':'⇄ Shuffle';
 const rep=$('audioRepeat');rep.setAttribute('aria-pressed',String(ag.repeat));rep.textContent=ag.repeat?'↻ Repeat on':'↻ Repeat';
}
function initializeAudioGallery(records,today){
 const tracks=(Array.isArray(records)?records:[]).filter(r=>Number.isInteger(Number(r.weekday))&&Number(r.weekday)>=0&&Number(r.weekday)<=7&&audioStreamURL(r));
 audioGallery.tracks=tracks;audioGallery.today=today;audioGallery.shuffle=false;audioGallery.repeat=false;
 const todayIndex=tracks.findIndex(r=>Number(r.weekday)===today);
 const selected=todayIndex>=0?todayIndex:(tracks.length?0:-1);
 audioQueueMode('all',selected);
 if(selected>=0)audioSetTrack(selected,false);
 else{$('weekdayAudio').innerHTML='<div class="audio-empty"><strong>No songs published</strong><p>Add weekday or gallery tracks in Admin → Daily audio.</p></div>';renderAudioGallery();}
}
$('audioWeek').addEventListener('click',event=>{
 const b=event.target.closest('[data-audio-week]');if(!b)return;
 const i=audioGallery.tracks.findIndex(t=>Number(t.weekday)===Number(b.dataset.audioWeek));
 if(i>=0){audioQueueMode('all',i);audioSetTrack(i,true);}
});
$('audioGalleryTracks').addEventListener('click',event=>{
 const b=event.target.closest('[data-audio-index]');if(!b)return;
 const i=Number(b.dataset.audioIndex);audioQueueMode('all',i);audioSetTrack(i,true);
});
$('audioPlayAll').addEventListener('click',()=>{const i=audioQueueMode('all');if(i>=0)audioSetTrack(i,true);});
$('audioPlayGallery').addEventListener('click',()=>{const i=audioQueueMode('gallery');if(i>=0)audioSetTrack(i,true);});
$('audioShuffle').addEventListener('click',()=>{
 audioGallery.shuffle=!audioGallery.shuffle;
 const i=audioQueueMode(audioGallery.mode,audioGallery.current);
 if(i>=0)renderAudioGallery();
});
$('audioRepeat').addEventListener('click',()=>{audioGallery.repeat=!audioGallery.repeat;renderAudioGallery();});
$('audioNext').addEventListener('click',()=>audioNext(true));
$('audioPrev').addEventListener('click',audioPrev);

// Full temple history, with carousel only if that folder has multiple images.
let historyState={records:[],index:0,slide:0};
// Safely format short, committee-authored Markdown paragraphs and headings.
function formatTempleHistoryText(source){
 return String(source||'').split(/\n{2,}/).map(block=>{
  const lines=block.split('\n').map(line=>{
   const safe=esc(line).replace(/\*\*([^*\n]+)\*\*/g,'<strong>$1</strong>');
   const heading=safe.match(/^(#{1,4})\s+(.+)$/);
   if(heading)return '<h'+Math.min(4,heading[1].length+1)+'>'+heading[2]+'</h'+Math.min(4,heading[1].length+1)+'>';
   return safe;
  });
  return lines.every(line=>/^<h[2-4]>/.test(line))?lines.join(''): '<p>'+lines.join('<br>')+'</p>';
 }).join('');
}
function showTempleHistory(index){
 const record=historyState.records[index];if(!record)return;
 historyState.index=index;historyState.slide=0;
 $('historyDialogTitle').textContent=record.title;
 $('historyDialogText').innerHTML=formatTempleHistoryText(record.fullText||record.shortText||'');
 paintTempleHistory();$('templeHistoryDialog').showModal();
}
function paintTempleHistory(){
 const r=historyState.records[historyState.index];if(!r)return;
 const photos=r.photos||[],i=historyState.slide;
 $('historyDialogPhoto').innerHTML=photos.length?'<div class="history-large-photo"><img alt="'+esc(r.title)+'" src="'+esc(thumbnail(photos[i].media))+'" data-drive="'+esc(photos[i].id)+'"></div>'+(photos.length>1?'<div class="history-photo-controls"><button type="button" data-history-move="-1">← Previous</button><span>'+(i+1)+' / '+photos.length+'</span><button type="button" data-history-move="1">Next →</button></div>':''):(historyImage(r)?'<div class="history-large-photo"><img src="'+esc(historyImage(r))+'" alt="Illustrative artwork for '+esc(r.title)+'"><span class="heritage-art-label">Artistic illustration</span></div>':'<div class="history-image-placeholder">🛕</div>');
 hydrateDriveImages();
}
$('historyDialogClose').onclick=()=>$('templeHistoryDialog').close();
$('templeHistoryDialog').addEventListener('click',e=>{if(e.target===$('templeHistoryDialog')){$('templeHistoryDialog').close();return;}const b=e.target.closest('[data-history-move]');if(b){const r=historyState.records[historyState.index],len=r.photos.length;historyState.slide=(historyState.slide+Number(b.dataset.historyMove)+len)%len;paintTempleHistory();}});
document.addEventListener('click',e=>{
 const more=e.target.closest('#historySeeMore');
 if(more){const grid=document.querySelector('.temple-history-cards');if(!grid)return;const expanded=more.getAttribute('aria-expanded')==='true';if(expanded){grid.querySelectorAll('[data-history-extra]').forEach(n=>n.remove());more.textContent='See all '+historyState.records.length+' temples →';}else{historyState.records.slice(3).forEach((r,i)=>{const card=document.createElement('article');card.className='temple-history-card';card.dataset.historyExtra='true';const coverSrc=historyImage(r);const cover=coverSrc?'<img loading="lazy" src="'+esc(coverSrc)+'" alt="'+esc(r.title)+'">':'<div class="history-image-placeholder">🛕</div>';card.innerHTML=cover+'<div class="history-summary"><h3>'+esc(r.title)+'</h3><p>'+esc(r.shortText||'Learn about this sacred place.')+'</p><button type="button" class="mini-button" data-history-index="'+(i+3)+'">More details →</button></div>';grid.append(card);});more.textContent='Show fewer temples ↑';hydrateDriveImages();}more.setAttribute('aria-expanded',String(!expanded));return;}
 const b=e.target.closest('[data-history-index]');if(b){e.preventDefault();showTempleHistory(Number(b.dataset.historyIndex));}});
$('openPanchang').onclick=()=>{
 const date=templeToday();const events=(extrasCatalog.festivals||[]).filter(e=>e.date===date);
 $('panchangTodayBody').innerHTML='<p class="panchang-date">'+esc(new Intl.DateTimeFormat('te-IN',{timeZone:templeTZ,dateStyle:'full'}).format(new Date()))+'</p><h3>Today’s temple observances</h3>'+(events.length?events.map(e=>'<article><strong>'+esc(e.title)+'</strong><p>'+esc(e.notes||'')+'</p></article>').join(''):'<p>No temple festival has been published for today.</p>');
 $('panchangDialog').showModal();
};
$('panchangClose').onclick=()=>$('panchangDialog').close();
$('panchangDialog').addEventListener('click',e=>{if(e.target===$('panchangDialog'))$('panchangDialog').close();});
$('calPrev').onclick=()=>{calendarAnchor.setMonth(calendarAnchor.getMonth()-1);drawTempleCalendar();};
$('calNext').onclick=()=>{calendarAnchor.setMonth(calendarAnchor.getMonth()+1);drawTempleCalendar();};
$('calToday').onclick=()=>{const p=templeToday().split('-').map(Number);calendarAnchor=new Date(p[0],p[1]-1,1);drawTempleCalendar();};
$('calDays').onclick=event=>{const b=event.target.closest('[data-event-date]');if(!b)return;const matched=extrasCatalog.festivals.filter(e=>e.date===b.dataset.eventDate); if(matched.length)$('calEvents').innerHTML='<h3>'+esc(b.dataset.eventDate)+'</h3>'+matched.map(e=>'<div class="festival-event"><strong>'+esc(e.title)+'</strong><p>'+esc(e.notes||'')+'</p></div>').join('');};
mountTempleExtras({});

// Accessible fullscreen photo viewer: galleries use the whole collection, not a single image.
let viewerPhotos=[],viewerIndex=0,viewerTimer=null,viewerPlaying=false,viewerFrameSerial=0;
const viewer=$('imageViewer');
function stopViewerSlideShow(){clearInterval(viewerTimer);viewerTimer=null;viewerPlaying=false;$('viewerPlay').textContent='▶ Start slideshow';$('viewerPlay').setAttribute('aria-pressed','false');}
function drawViewerFrame(){
  const record=viewerPhotos[viewerIndex];if(!record)return;
  const img=$('fullImage'), serial=++viewerFrameSerial;
  img.alt=record.title||'Temple photograph';
  $('viewerTitle').textContent=record.title||'Temple photograph';
  $('viewerCount').textContent=(viewerIndex+1)+' / '+viewerPhotos.length;
  $('viewerPrev').hidden=$('viewerNext').hidden=$('viewerPlay').hidden=viewerPhotos.length<2;
  const src=record.src||'';
  if(record.id){img.onerror=async()=>{
    const backup=await getPhoto(record.id);
    if(serial!==viewerFrameSerial||!backup)return;
    img.onerror=null;img.src=backup;
  };}else img.onerror=null;
  img.src=src;
  for(const button of $('viewerThumbnails').children){button.setAttribute('aria-current',String(Number(button.dataset.viewerIndex)===viewerIndex));}
  $('viewerThumbnails').children[viewerIndex]?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
}
function setViewerFrames(photos,index){
  if(!photos.length)return;
  stopViewerSlideShow();viewerPhotos=photos;viewerIndex=Math.max(0,Math.min(index,photos.length-1));
  $('viewerThumbnails').innerHTML=photos.length>1?photos.map((record,i)=>'<button type="button" data-viewer-index="'+i+'" aria-label="Show image '+(i+1)+': '+esc(record.title)+'"><img loading="lazy" src="'+esc(record.src)+'" alt=""></button>').join(''):'';
  $('viewerThumbnails').hidden=photos.length<2; $('viewerPreviews').hidden=photos.length<2; $('viewerPreviews').setAttribute('aria-pressed','true'); $('viewerPreviews').textContent='▤ Hide previews';
  if(!viewer.open)viewer.showModal();drawViewerFrame();
}
function openImageViewer(src,title){if(!src)return;setViewerFrames([{src,title:title||'Temple image',id:''}],0);}
function openGalleryViewer(index){const photos=galleryViewerItems.map(record=>({title:record.title||'Temple photograph',id:driveId(record.media),src:gallerySrc(record)}));setViewerFrames(photos,index);}
function moveViewer(delta){if(viewerPhotos.length<2)return;viewerIndex=(viewerIndex+delta+viewerPhotos.length)%viewerPhotos.length;drawViewerFrame();}
$('closeImageViewer').onclick=()=>viewer.close();
$('viewerPrev').onclick=()=>moveViewer(-1);
$('viewerNext').onclick=()=>moveViewer(1);
$('viewerPreviews').onclick=()=>{const previews=$('viewerThumbnails'),show=previews.hidden;previews.hidden=!show;$('viewerPreviews').setAttribute('aria-pressed',String(show));$('viewerPreviews').textContent=show?'▤ Hide previews':'▤ Show previews';};
$('viewerPlay').onclick=()=>{if(viewerPlaying){stopViewerSlideShow();return;}if(viewerPhotos.length<2)return;viewerPlaying=true;$('viewerPlay').textContent='Ⅱ Pause slideshow';$('viewerPlay').setAttribute('aria-pressed','true');viewerTimer=setInterval(()=>{if(!document.hidden)moveViewer(1);},5000);};
$('viewerThumbnails').onclick=event=>{const target=event.target.closest('[data-viewer-index]');if(target){viewerIndex=Number(target.dataset.viewerIndex);drawViewerFrame();}};
viewer.addEventListener('close',()=>{stopViewerSlideShow();viewerPhotos=[];$('fullImage').removeAttribute('src');});
viewer.addEventListener('click',event=>{if(event.target===viewer)viewer.close();});
viewer.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();moveViewer(event.key==='ArrowLeft'?-1:1);}});
let viewerStartX=0;
viewer.addEventListener('touchstart',event=>{viewerStartX=event.changedTouches[0]?.screenX||0;},{passive:true});
viewer.addEventListener('touchend',event=>{const distance=(event.changedTouches[0]?.screenX||0)-viewerStartX;if(Math.abs(distance)>55)moveViewer(distance>0?-1:1);},{passive:true});
document.addEventListener('click',event=>{
  const galleryButton=event.target.closest('[data-gallery-index]');
  if(galleryButton){event.preventDefault();openGalleryViewer(Number(galleryButton.dataset.galleryIndex));return;}
  const priestImage=event.target.closest('[data-priest-image]');
  if(priestImage){event.preventDefault();const img=priestImage.querySelector('img');if(img)openImageViewer(img.currentSrc||img.src,img.alt);return;}
  const img=event.target.closest('.about-flex img,.priest-preview img,.publicSection .card img');
  if(img){event.preventDefault();openImageViewer(img.currentSrc||img.src,img.alt);}
});


function templeLiveEmbed(link){
 try {
  const u=new URL(link);const host=u.hostname.toLowerCase().replace(/^www\./,'').replace(/^m\./,'');
  if(!['youtube.com','youtube-nocookie.com','youtu.be'].includes(host))return '';
  let id='';
  if(host==='youtu.be')id=u.pathname.split('/')[1]||'';
  else if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
  else if(/^\/(?:live|shorts|embed)\//.test(u.pathname))id=u.pathname.split('/')[2]||'';
  if(/^[a-zA-Z0-9_-]{11}$/.test(id))return 'https://www.youtube-nocookie.com/embed/'+id+'?rel=0';
  const channel=u.pathname.match(/^\/channel\/(UC[a-zA-Z0-9_-]{22})\/?/);
  if(channel)return 'https://www.youtube.com/embed/live_stream?channel='+encodeURIComponent(channel[1]);
 }catch(_){}
 return '';
}
function renderTempleLiveTV(records){
 const node=$('templeLiveTVGrid');if(!node)return;
 const streams=(Array.isArray(records)?records:[]).filter((record,index,all)=>{
  const key=youtubeVideoId(record.youtubeUrl||'');
  return !key||all.findIndex(r=>youtubeVideoId(r.youtubeUrl||'')===key)===index;
 });
 node.innerHTML=streams.length?streams.map(record=>{
  const src=templeLiveEmbed(record.youtubeUrl||'');
  return '<article class="temple-live-card"><div class="temple-live-frame">'+(src?'<iframe title="'+esc(record.title)+'" loading="lazy" src="'+esc(src)+'" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>':'<div class="temple-live-unavailable">Use a YouTube watch/live video URL or /channel/UC… link for in-page playback.</div>')+'</div><div class="temple-live-details"><span class="temple-live-kicker">▶ DEVOTIONAL VIDEO / CHANNEL</span><h3>'+esc(record.title)+'</h3>'+(record.description?'<p>'+esc(record.description)+'</p>':'')+'</div></article>';
 }).join(''):'<p class="muted">Live TV channels will appear here when published by the temple.</p>';
}

// Reference-layout weekday badge (India Standard Time).
(()=>{const el=document.getElementById('todayDayChip');if(el)el.textContent=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',weekday:'long'}).format(new Date());})();
