function uploadState_(id,owner) {
  if(!/^[a-f0-9]{32}$/.test(id)) fail_('Invalid upload.');
  const state=JSON.parse(props_().getProperty('UPLOAD_'+id)||'null');
  if(!state||state.owner!==owner||state.until<now_()) fail_('This upload has expired. Start again.');
  return state;
}
function uploadStart_(data,owner) {
  const size=Number(data.size), mime=clean_(data.mime,80);
  if(!Number.isSafeInteger(size)||size<1||size>1024*1024*1024||!/^video\/[a-z0-9.+-]+$/i.test(mime)) fail_('Choose a video up to 1 GB with a recognized video type.');
  const title=clean_(data.title,100)||fail_('Enter a video title.');
  limit_('YOUTUBE_START_RATE',12,3600000);
  const description=clean_(data.description,4500), privacy=choice_(data.privacy,['private','unlisted','public']);
  const res=UrlFetchApp.fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{
    method:'post',contentType:'application/json',
    headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken(),'X-Upload-Content-Length':String(size),'X-Upload-Content-Type':mime},
    payload:JSON.stringify({snippet:{title,description,categoryId:'22'},status:{privacyStatus:privacy,selfDeclaredMadeForKids:data.forKids===true}}),
    followRedirects:false,muteHttpExceptions:true
  });
  const responseHeaders=res.getAllHeaders();
  const locationKey=Object.keys(responseHeaders).find(key=>key.toLowerCase()==='location');
  const url=String(responseHeaders[locationKey]||'');
  if(res.getResponseCode()>=300||!/^https:\/\/(?:www\.googleapis\.com|youtube\.googleapis\.com)\/upload\/youtube\/v3\/videos\?[^\s]+$/.test(url)) fail_('YouTube could not start the upload. Check API access, channel authorization and quota.');
  const id=uid_();
  props_().setProperty('UPLOAD_'+id,JSON.stringify({owner,size,mime,url,offset:0,until:now_()+21600000}));
  return {upload:id,chunkSize:CHUNK};
}
function uploadChunk_(data) {
  const id=clean_(data.upload,64);
  const state=lock_(()=>{
    const session=session_(data.token,true), current=uploadState_(id,session.id);
    if(current.result) return current;
    if(current.busyUntil>now_()) fail_('The previous chunk is still processing.');
    current.busyUntil=now_()+360000;
    props_().setProperty('UPLOAD_'+id,JSON.stringify(current));
    return current;
  });
  if(state.result) return state.result;
  let result;
  try {
    if(typeof data.base64!=='string'||data.base64.length>Math.ceil(CHUNK/3)*4) fail_('Invalid video chunk.');
    const bytes=Utilities.base64Decode(data.base64), start=Number(data.offset);
    if(!Number.isSafeInteger(start)||start<0||start>state.offset||!bytes.length||bytes.length!==Math.min(CHUNK,state.size-start)) fail_('Invalid video chunk.');
    if(start<state.offset) {result={offset:state.offset};return result;}
    const res=UrlFetchApp.fetch(state.url,{
      method:'put',contentType:state.mime,headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken(),'Content-Range':'bytes '+start+'-'+(start+bytes.length-1)+'/'+state.size},
      payload:bytes,followRedirects:false,muteHttpExceptions:true
    });
    const status=res.getResponseCode();
    if(status===308) {
      const headers=res.getAllHeaders(), key=Object.keys(headers).find(k=>k.toLowerCase()==='range');
      const match=String(headers[key]||'').match(/^bytes=0-(\d+)$/i);
      const next=match?Number(match[1])+1:0;
      if(next<start||next>start+bytes.length||next>=state.size) fail_('YouTube returned an unexpected upload offset.');
      result={offset:next};
    } else if(status===200||status===201) {
      const video=JSON.parse(res.getContentText());
      if(!/^[A-Za-z0-9_-]{11}$/.test(video.id||'')) fail_('YouTube did not return a video ID.');
      result={offset:state.size,videoId:video.id,url:'https://www.youtube.com/watch?v='+video.id};
    } else fail_('YouTube interrupted the upload (HTTP '+status+'). Check YouTube Studio before starting a new upload.');
    return result;
  } finally {
    lock_(()=>{
      const current=JSON.parse(props_().getProperty('UPLOAD_'+id)||'null');
      if(!current) return;
      if(result) current.offset=result.offset;
      if(result?.videoId) {
        current.result=result;
        current.url='';
        current.until=now_()+3600000;
        audit_('YouTube upload','Content',result.videoId);
      }
      current.busyUntil=0;
      props_().setProperty('UPLOAD_'+id,JSON.stringify(current));
    });
  }
}
