import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
export async function checkGoogleAuth({test,p,request,html,admin}){
  const {resolveGoogleCustomer}=await import('../src/lib/google-auth.ts');
  await test('Google sign-in button, state/PKCE redirect and safe callback rejection',async()=>{
    assert.ok((await html('/client/login')).includes('Continue with Google'));
    const start=await request('/api/auth/google');assert.equal(start.status,303);
    const redirect=new URL(start.headers.get('location'));assert.equal(redirect.origin,'https://accounts.google.com');assert.equal(redirect.searchParams.get('code_challenge_method'),'S256');assert.equal(redirect.searchParams.get('scope'),'openid email profile');assert.equal(redirect.searchParams.get('redirect_uri'),'http://localhost:3107/api/auth/google/callback');assert.equal(redirect.searchParams.get('state').length,43);assert.equal(redirect.searchParams.get('nonce').length,43);assert.ok(!redirect.searchParams.has('client_secret'));assert.ok(start.headers.get('set-cookie').includes('HttpOnly'));
    const callback=await request('/api/auth/google/callback?code=untrusted&state=untrusted');assert.equal(callback.status,303);assert.ok(callback.headers.get('location').includes('/client/login?error=google'));assert.ok(!callback.headers.get('set-cookie').includes('petshop_session='));
    const cancelled=await request('/api/auth/google/callback?error=access_denied&state='+redirect.searchParams.get('state'),start.headers.get('set-cookie').split(';')[0]);assert.equal(cancelled.status,303);assert.ok(cancelled.headers.get('set-cookie').includes('Max-Age=0'));assert.ok(!cancelled.headers.get('set-cookie').includes('petshop_session='));
  });
  await test('Google identities preserve account history, separate roles and reject unsafe email links',async()=>{
    const subject=()=>BigInt('0x'+randomBytes(8).toString('hex')).toString();
    const identity={subject:subject(),email:`google-${randomBytes(5).toString('hex')}@gmail.com`,firstName:'Google',surname:'Audit',authoritative:true};
    const created=await resolveGoogleCustomer(p,identity);assert.equal(created.role,'User');assert.equal(created.accountStatus,'Active');
    const customer=await p.customer.findFirstOrThrow({where:{email:identity.email}});assert.equal(customer.customerName,'Google Audit');
    const again=await resolveGoogleCustomer(p,{...identity,email:'changed@gmail.com'});assert.equal(again.id,created.id);assert.equal(again.email,identity.email);assert.equal(await p.customer.count({where:{email:identity.email}}),1);
    const user=await p.user.findUniqueOrThrow({where:{email:'client@audit.invalid'}});
    await assert.rejects(()=>resolveGoogleCustomer(p,{...identity,subject:subject(),email:user.email,authoritative:false}));
    await assert.rejects(()=>resolveGoogleCustomer(p,{...identity,subject:subject(),email:admin.email}));
    await p.user.update({where:{id:created.id},data:{accountStatus:'Suspended'}});await assert.rejects(()=>resolveGoogleCustomer(p,identity));await p.user.update({where:{id:created.id},data:{accountStatus:'Active'}});
    const trusted={...identity,subject:subject(),email:`local-${randomBytes(5).toString('hex')}@gmail.com`};
    const local=await p.user.create({data:{email:trusted.email,role:'User',firstName:'Existing',password:user.password}});
    const linked=await resolveGoogleCustomer(p,trusted);assert.equal(linked.id,local.id);assert.equal(linked.password,user.password);
  });
}
