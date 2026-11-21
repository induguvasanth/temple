function resetAdminPassword_(password) {
  const props=props_();
  props.setProperty('PASSWORD_HASH',mac_(password,cfg_('PASSWORD_PEPPER')));
  ['LOGIN_RATE','DELETE_PASSWORD_RATE','EMAIL_OTP'].forEach(key=>props.deleteProperty(key));
  rows_('Sessions').filter(row=>!row.revoked).forEach(row=>{row.revoked='yes';put_('Sessions',row);});
  audit_('Password reset','Sessions','');
}
function emailOtp_(action,data) {
  const props=props_(), key='EMAIL_OTP', pepper=cfg_('PASSWORD_PEPPER');
  if(action==='sendOtp') {
    limit_('EMAIL_OTP_SEND_RATE',3,3600000);
    const to=cfg_('RECOVERY_EMAIL');
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) fail_('Recovery email is not configured.');
    const nonce=token_();
    const code=String(parseInt(mac_(nonce,pepper).slice(0,12),16)%1000000).padStart(6,'0');
    MailApp.sendEmail({to,subject:'Temple administrator password reset',body:'Your temple portal verification code is '+code+'. It expires in 10 minutes. If you did not request it, you can ignore this message.'});
    props.setProperty(key,JSON.stringify({nonce,digest:mac_(nonce+':'+code,pepper),until:now_()+600000}));
    return {};
  }
  limit_('EMAIL_OTP_CHECK_RATE',6,600000);
  validatePassword_(data.password);
  const state=JSON.parse(props.getProperty(key)||'null');
  if(!state||now_()>=state.until||!/^\d{6}$/.test(data.code||'')||!eq_(mac_(state.nonce+':'+data.code,pepper),state.digest)) fail_('Code invalid or expired.');
  resetAdminPassword_(data.password);
  return {};
}
