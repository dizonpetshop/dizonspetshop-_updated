import {NextResponse} from 'next/server';
import {googleConfig,createGoogleFlow,googleFlowCookie} from '@/lib/google-auth';
export async function GET(request:Request){
  try{
    const config=googleConfig();if(new URL(request.url).origin!==config.origin)throw new Error('Wrong login origin.');
    const flow=await createGoogleFlow();
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:'openid email profile',state:flow.state,nonce:flow.nonce,code_challenge:flow.challenge,code_challenge_method:'S256',prompt:'select_account'}).toString();
    const response=NextResponse.redirect(url,303);
    response.headers.set('Cache-Control','no-store');
    response.cookies.set(googleFlowCookie,flow.token,{httpOnly:true,sameSite:'lax',secure:config.secure,path:'/api/auth/google',maxAge:600});
    return response;
  }catch{return NextResponse.redirect(new URL('/client/login?error=google-config',request.url),303);}
}
