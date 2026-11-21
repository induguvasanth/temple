function runTempleImport() {
  const result = importConsolidatedWorkbook_();
  console.log(result);
}
function importConsolidatedWorkbook_() {
  initialize_();
  return lock_(()=>{
    const ss=SpreadsheetApp.openById(cfg_('SHEET_ID'));
    const read=(name,expected)=>{
      const tab=ss.getSheetByName(name);
      if(!tab) fail_('Missing source tab: '+name);
      const [header,...rows]=tab.getDataRange().getDisplayValues();
      if(!expected.every(k=>header.includes(k))) fail_('Unexpected source headers in '+name);
      return rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(header.map((k,i)=>[k,r[i]||''])));
    };
    const stamp=stamp_();
    const sourceSections=read('Public Sections',['slug','title','sort_order']);
    const sourceContent=read('Public Content',['section_slug','title','description','timing_or_label','external_url','drive_media_url']);
    const sourceFinance=read('Finance Staging',['Source ID','Transaction type','Transaction date','Amount INR','Paid by or to','Status','Coverage','Receipt Drive URL']);
    const sectionMap=new Map(alive_('Sections').map(row=>[row.slug,row.id]));
    const newSections=[];
    for(const source of sourceSections) if(!sectionMap.has(source.slug)) {
      const row={id:'catalog-'+source.slug,slug:source.slug,title:source.title,order:source.sort_order,status:'Published',updated:stamp};
      sectionMap.set(source.slug,row.id);newSections.push(row);
    }
    const mediaId=url=>String(url).match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)\//)?.[1]||'';
    const contents=sourceContent.map((r,i)=>({
      id:'catalog-'+hash_(JSON.stringify([r.section_slug,r.title,r.description,r.timing_or_label,r.external_url,r.drive_media_url])).slice(0,24),
      section:sectionMap.get(r.section_slug)||fail_('Unknown catalog section: '+r.section_slug),
      title:r.title,body:r.description,extra:r.timing_or_label,url:safeUrl_(r.external_url),
      media:mediaId(r.drive_media_url),order:i+1,status:'Published',updated:stamp
    }));
    const finance=sourceFinance.map(r=>{
      if(!/^\d+$/.test(r['Source ID'])) fail_('Invalid source transaction ID.');
      const amount=String(r['Amount INR']).replace(/[,₹\s]/g,'');
      if(!/^\d+(\.\d{1,2})?$/.test(amount)||!Number.isSafeInteger(Math.round(Number(amount)*100))) fail_('Invalid imported amount.');
      return {id:'legacy-'+r['Source ID'],type:choice_(r['Transaction type'],['Donation','Expense']),date:date_(r['Transaction date']),amountPaise:Math.round(Number(amount)*100),category:r.Category||'Uncategorized',method:r['Payment method']||'Other',reference:r['Reference number'],party:r['Paid by or to'],notes:r['Notes (plain text)'],receipt:mediaId(r['Receipt Drive URL']),status:['Active','Inactive'].includes(r.Status)?r.Status:'Review',recordedBy:r['Recorded by'],coverage:r.Coverage,updated:stamp};
    });
    const append=(name,records)=>{
      const tab=sheet_(name), keys=SCHEMA[name], seen=new Set(rows_(name).map(r=>r.id));
      const pending=records.filter(r=>!seen.has(r.id)&&(seen.add(r.id),true));
      if(!pending.length) return 0;
      const start=tab.getLastRow()+1, extra=start+pending.length-1-tab.getMaxRows();
      if(extra>0) tab.insertRowsAfter(tab.getMaxRows(),extra);
      const range=tab.getRange(start,1,pending.length,keys.length);
      range.setNumberFormat('@');
      range.setValues(pending.map(row=>keys.map(key=>{
        const value=String(row[key]??'');
        return /^[=+\-@']/.test(value)?"'"+value:value;
      })));
      return pending.length;
    };
    const result={sections:append('Sections',newSections),content:append('Content',contents),finance:append('Finance',finance)};
    if(Object.values(result).some(Boolean)) audit_('Import consolidated workbook','Finance',String(result.finance));
    return result;
  });
}
