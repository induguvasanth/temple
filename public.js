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
  return Object.hasOwn(config.bundledImages||{},id)?'media/'+id+'.webp':
    'https://drive.google.com/thumbnail?id='+encodeURIComponent(id)+'&sz=w1200';
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
let catalogPage=0;
function render(data) {
  const sections=sorted(data.sections.filter(s=>!['carousel','events','shop'].includes(s.slug)));
  const needle=$('search').value.trim().toLowerCase(), filter=$('filter').value, sort=$('sort').value;
  $('nav').innerHTML='<a href="#browse" '+(!filter?'aria-current="page"':'')+'>Home</a>'+sections.map(s=>'<a href="#'+esc(s.slug)+'" '+(filter===s.id?'aria-current="page"':'')+'>'+esc(s.title)+'</a>').join('');
  const byId=new Map(sections.map(s=>[s.id,s]));
  const pager=$('catalogPager');pager.replaceChildren();
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
    const priestsHtml='<div class="priest-preview">'+(priests.slice(0,2).map(r=>'<a href="#priests">'+(picture(r)||'<div class="priest-fallback">ॐ</div>')+'<strong>'+esc(r.title)+'</strong></a>').join('')||'<p>View temple priest details.</p>')+'</div><a class="mini-button" href="#priests">View all priests ›</a>';
    const timings=sectionItems('timings');
    const timingsHtml='<div class="timing-list">'+(timings.slice(0,6).map(r=>'<a href="#timings"><span>▣ &nbsp; '+esc(r.title)+'</span><strong>'+esc(String(r.extra||'').slice(0,42))+'</strong></a>').join('')||'<a href="#timings">See daily pooja and darshan timings →</a>')+'</div>';
    const gallery=sectionItems('gallery');
    const galleryHtml='<div class="gallery-preview">'+gallery.filter(r=>thumbnail(r.media)).slice(0,4).map(r=>'<button type="button" class="gallery-tile" aria-label="View full image">'+picture(r)+'</button>').join('')+'</div><a class="mini-button" href="#gallery">View gallery ›</a>';
    const videos=sectionItems('videos');
    const video=videos.find(r=>url(r.url));
    const youtube=video?.url?.match(/(?:youtu\.be\/|[?&]v=)([\w-]{11})/)?.[1];
    const videoHtml=youtube?'<div class="video-preview"><iframe title="'+esc(video?.title||'Temple video')+'" loading="lazy" allowfullscreen allow="accelerometer; autoplay; encrypted-media; picture-in-picture" src="https://www.youtube-nocookie.com/embed/'+youtube+'"></iframe></div>':'<a class="video-preview" href="#videos">'+picture(firstPhoto('gallery'))+'<span class="video-play">▶</span></a>';
    const donationList=Array.isArray(data.donations)?data.donations:[];const donationsHtml='<div class="donate-panel"><span class="donate-symbol">♡</span><p>Support temple worship, maintenance and development.</p><strong>'+donationList.length+' recorded donations</strong><a class="mini-button" href="#donations">View donation history ›</a></div>';
    const visitHtml='<div class="visit-preview"><div><strong>⌖ Chidambareshwara Swamy Temple</strong><p>'+esc(config.place)+'</p><a class="mini-button" href="https://www.google.com/maps/search/?api=1&amp;query=Chidambareshwara+Swamy+Temple+Ichchapuram" target="_blank" rel="noopener noreferrer">View on Google Maps ›</a></div><div class="map-placeholder">⌖<small>Ichchapuram, Andhra Pradesh</small></div></div>';
    $('sections').innerHTML='<div class="temple-dashboard">'+block('About the Temple','about',aboutHtml,'♜')+block('Sevas','sevas',sevasHtml,'✿')+block('Priests','priests',priestsHtml,'♙')+block('Pooja Timings','timings',timingsHtml,'◷')+block('Temple Gallery','gallery',galleryHtml,'▧')+block('Temple Video','videos',videoHtml,'▶')+block('Donations','donations',donationsHtml,'♡')+block('Visit & Contact','contact',visitHtml,'⌖')+'</div>';
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
    if(selected?.slug==='donations'&&Array.isArray(data.finance||data.donations)){
      const finance=(data.finance||data.donations.map(r=>({...r,type:'Donation',donor:'Anonymous',donorKey:'',note:''}))).filter(r=>['Donation','Expense'].includes(r.type));
      const money=n=>'₹'+(Number(n||0)/100).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
      const total=type=>finance.filter(r=>r.type===type).reduce((n,r)=>n+Number(r.amountPaise||0),0);
      const donationTotal=total('Donation'),expenseTotal=total('Expense');
      const groups=[...new Set(finance.map(r=>r.category||'General'))].sort();
      $('sections').innerHTML='<section class="public-donations finance-public"><div class="finance-heading"><div><p class="finance-kicker">TEMPLE TRANSPARENCY</p><h2>Donations & Expenses</h2><p class="muted">Read-only financial records · Donor names and notes shown only with consent.</p></div></div><div class="public-finance-stats"><button type="button" data-finance-view="Donation"><small>Active donations</small><strong>'+money(donationTotal)+'</strong><span>View donation details ↗</span></button><button type="button" data-finance-view="Expense"><small>Active expenses</small><strong>'+money(expenseTotal)+'</strong><span>View expense details ↗</span></button><button type="button" data-finance-view="All"><small>Net balance</small><strong>'+money(donationTotal-expenseTotal)+'</strong><span>View full statement ↗</span></button></div><div class="finance-public-toolbar"><label>Search records<input id="donationSearch" type="search" placeholder="Search donor, category, date or note"></label><label>Type<select id="donationType"><option value="All">Donations and expenses</option><option value="Donation">Donations</option><option value="Expense">Expenses</option></select></label><label>Category<select id="donationCategory"><option value="">All categories</option>'+groups.map(g=>'<option value="'+esc(g)+'">'+esc(g)+'</option>').join('')+'</select></label></div><div class="finance-section-title"><h3>Category-wise overview</h3><span>Click any category for details</span></div><div id="financeCategories" class="finance-category-grid"></div><div class="finance-section-title"><h3>Financial history</h3><span id="financeCount"></span></div><div id="donationRows"></div></section><dialog id="financeDialog" class="finance-dialog"><div class="finance-dialog-top"><h2 id="financeDialogTitle">Details</h2><button type="button" id="financeDialogClose" aria-label="Close popup">✕</button></div><div id="financeDialogBody"></div></dialog>';
      const dialog=$('financeDialog');$('financeDialogClose').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
      const recordRow=r=>'<div class="finance-history-row"><span>'+esc(r.date||'')+'</span><span><strong>'+esc(r.category||'General')+'</strong><small>'+esc(r.type)+'</small></span><span>'+(r.type==='Donation'&&r.donorKey?'<button class="finance-donor-link" data-donor="'+esc(r.donorKey)+'">'+esc(r.donor)+'</button>':esc(r.type==='Donation'?'Anonymous':'Temple expense'))+'</span><b class="'+(r.type==='Expense'?'expense':'donation')+'">'+(r.type==='Expense'?'−':'+')+money(r.amountPaise)+'</b></div>';
      const showPopup=(title,records)=>{$('financeDialogTitle').textContent=title;const t=records.reduce((n,r)=>n+(r.type==='Expense'?-1:1)*Number(r.amountPaise||0),0);$('financeDialogBody').innerHTML='<div class="finance-popup-summary"><span>'+records.length+' records</span><strong>Net '+money(t)+'</strong></div><div class="finance-popup-records">'+(records.length?records.map(r=>'<div class="finance-popup-item"><div><strong>'+esc(r.category||'General')+'</strong><small>'+esc(r.date)+' · '+esc(r.type)+(r.donorKey?' · '+esc(r.donor):'')+'</small>'+(r.note?'<p>'+esc(r.note)+'</p>':'')+'</div><b>'+money(r.amountPaise)+'</b></div>').join(''):'<p>No records found.</p>')+'</div>';dialog.showModal();};
      const bindLinks=()=>{document.querySelectorAll('.finance-donor-link').forEach(b=>b.onclick=()=>{const records=finance.filter(r=>r.donorKey&&r.donorKey===b.dataset.donor);showPopup('Donation history · '+(records[0]?.donor||'Donor'),records);});};
      const update=()=>{const q=$('donationSearch').value.trim().toLowerCase(),cat=$('donationCategory').value,type=$('donationType').value;const shown=finance.filter(r=>(type==='All'||r.type===type)&&(!cat||r.category===cat)&&(!q||[r.category,r.date,r.donor,r.note,r.type].some(x=>String(x||'').toLowerCase().includes(q))));$('financeCount').textContent=shown.length+' records';$('donationRows').innerHTML=shown.length?'<div class="finance-history-head"><span>Date</span><span>Category</span><span>Donor / Type</span><span>Amount</span></div>'+shown.map(recordRow).join(''):'<p class="empty">No records match your search.</p>';bindLinks();};
      $('financeCategories').innerHTML=groups.map(cat=>{const subset=finance.filter(r=>(r.category||'General')===cat),d=subset.filter(r=>r.type==='Donation').reduce((n,r)=>n+Number(r.amountPaise||0),0),e=subset.filter(r=>r.type==='Expense').reduce((n,r)=>n+Number(r.amountPaise||0),0);return '<button type="button" class="finance-category-card" data-category="'+esc(cat)+'"><strong>'+esc(cat)+'</strong><span>Donations <b>'+money(d)+'</b></span><span>Expenses <b>'+money(e)+'</b></span><small>'+subset.length+' records · View details ↗</small></button>';}).join('');
      document.querySelectorAll('[data-finance-view]').forEach(b=>b.onclick=()=>{const type=b.dataset.financeView;showPopup(type==='All'?'Full financial statement':type==='Donation'?'Donation records':'Expense records',finance.filter(r=>type==='All'||r.type===type));});
      document.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>showPopup(b.dataset.category+' · Financial records',finance.filter(r=>(r.category||'General')===b.dataset.category)));
      ['donationSearch','donationType','donationCategory'].forEach(id=>$(id).addEventListener(id==='donationSearch'?'input':'change',update));update();return;
    }
    $('sections').innerHTML='<h2>'+esc(selected?.title||'Search results')+'</h2>'+(selected?.summary?'<p>'+esc(selected.summary)+'</p>':'')+(cards?'<div class="grid">'+cards+'</div>':'<p class="empty">No published items match this view.</p>');
    $('resultCount').textContent=items.length+' '+(items.length===1?'item':'items');
    if(pages>1){
      for(const [label,d] of [['Previous',-1],['Next',1]]){
        const button=document.createElement('button');button.type='button';button.className='button secondary';button.textContent=label;button.disabled=catalogPage+d<0||catalogPage+d>=pages;
        button.onclick=()=>{catalogPage+=d;render(data);$('browse').scrollIntoView();};pager.append(button);
      }
      const count=document.createElement('span');count.textContent=(catalogPage+1)+' / '+pages;pager.insertBefore(count,pager.lastChild);
    }
  }
  document.querySelectorAll('#sections img[data-drive]').forEach(img=>{
    const fallback=async()=>{
      const backup=img.dataset.drive?await getPhoto(img.dataset.drive):'';
      if(!img.isConnected)return;
      if(backup){img.addEventListener('error',()=>img.remove(),{once:true});img.src=backup;}
      else img.remove();
    };
    img.addEventListener('error',fallback,{once:true});
    if(img.complete&&img.naturalWidth===0){img.removeEventListener('error',fallback);fallback();}
  });
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
function carousel(data) {
  const custom=data.sections.find(s=>s.slug==='carousel');
  // Use published gallery/about photos until the carousel section has published slides.
  const candidates=id=>sorted(data.content.filter(r=>r.section===id&&(thumbnail(r.media)||url(r.url))));
  const preferred=custom?candidates(custom.id):[];
  const defaultSlides=['about','gallery'].flatMap(slug=>{
    const section=data.sections.find(s=>s.slug===slug);
    return section?candidates(section.id):[];
  });
  const slides=(preferred.length?preferred:defaultSlides).slice(0,12);
  if(!slides.length) return;
  const hero=document.querySelector('.hero');
  let current=0, serial=0;
  const dots=$('photoDots');
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
    if(ready){hero.querySelector('img')?.remove();hero.prepend(image);$('photoFullscreen').onclick=()=>openImageViewer(image.src,slide.title);}else{$('photoFullscreen').onclick=()=>{};}
    $('photoStatus').textContent=(current+1)+' / '+slides.length+' · '+slide.title+(ready?'':' · Photo unavailable');
    [...dots.children].forEach((dot,i)=>dot.setAttribute('aria-current',i===current?'true':'false'));
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
    document.querySelector('.hero').prepend(hero);
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
    const response=await fetch(endpoint,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(9000)});
    if(!response.ok) throw new Error('Catalog unavailable');
    const data=await response.json();
    if(!Array.isArray(data.sections)||!Array.isArray(data.content)) throw new Error('Unexpected catalog format');
    return data;
  };
  try {
    let data;
    try {data=await fetchCatalog(config.endpoint);$('notice').hidden=true;}
    catch {data=await fetchCatalog('./catalog.json');$('notice').textContent='Showing the last saved temple information. Live updates are temporarily unavailable.';}
    const sections=sorted(data.sections.filter(s=>!['carousel','events','shop'].includes(s.slug)));
    renderAnnouncements(data);
    for(const section of sections) $('filter').add(new Option(section.title,section.id));
    const published=new Set(sections.map(section=>section.slug));
    $('heroTimings').hidden=$('quickTimings').hidden=!published.has('timings');
    $('quickSevas').hidden=!published.has('sevas');
    const route=()=>{
      const slug=location.hash.slice(1);
      $('filter').value=sections.find(s=>s.slug===slug)?.id||'';
      $('search').value='';catalogPage=0;render(data);
      if(slug)$('browse').scrollIntoView();
    };
    addEventListener('hashchange',route);
    $('nav').addEventListener('click',event=>{
      const link=event.target.closest('a');
      if(link?.hash===location.hash)route();
    });
    $('search').addEventListener('input',()=>{catalogPage=0;render(data);});
    $('sort').addEventListener('change',()=>{catalogPage=0;render(data);});
    $('filter').addEventListener('change',()=>{
      const hash='#'+(sections.find(s=>s.id===$('filter').value)?.slug||'browse');
      history.replaceState(null,'',hash);catalogPage=0;render(data);
    });
    $('controls').hidden=true;route();carousel(data);
  } catch {$('notice').textContent='Temple information is temporarily unavailable.';}
})();

function openImageViewer(src,title){const dialog=$('imageViewer');if(!dialog||!src)return;$('fullImage').src=src;$('fullImage').alt=title||'Temple image';if(!dialog.open)dialog.showModal();}
$('closeImageViewer').onclick=()=>$('imageViewer').close();
$('imageViewer').onclick=e=>{if(e.target===$('imageViewer'))$('imageViewer').close();};
document.addEventListener('click',e=>{const img=e.target.closest('.gallery-preview img,.about-flex img,.priest-preview img,.publicSection .card img');if(img){e.preventDefault();openImageViewer(img.currentSrc||img.src,img.alt);}});
