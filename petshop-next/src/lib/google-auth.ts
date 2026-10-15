import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {SignJWT,jwtVerify,createRemoteJWKSet,type JWTVerifyGetKey} from 'jose';
import {hash} from 'bcryptjs';
import type {PrismaClient} from '@prisma/client';

export const googleFlowCookie='petshop_google_flow';
const issuer='dizons-google-login';
const googleKeys=createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'),{timeoutDuration:8000});
export function googleConfig(){
  const clientId=process.env.GOOGLE_CLIENT_ID?.trim(),clientSecret=process.env.GOOGLE_CLIENT_SECRET?.trim(),redirectUri=process.env.GOOGLE_REDIRECT_URI?.trim();
  if(!clientId||!clientSecret||!redirectUri)throw new Error('Google sign-in is not configured.');
  const url=new URL(redirectUri);
  if(url.pathname!=='/api/auth/google/callback'||url.search||url.hash||url.username||url.password||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname))))throw new Error('Invalid Google redirect configuration.');
  return {clientId,clientSecret,redirectUri,origin:url.origin,secure:url.protocol==='https:'};
}
function secret(){const value=process.env.AUTH_SECRET;if(!value||value.length<32)throw new Error('Authentication configuration is unavailable.');return new TextEncoder().encode(value);}
export async function createGoogleFlow(){
  const state=randomBytes(32).toString('base64url'),nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
  const token=await new SignJWT({state,nonce,verifier}).setProtectedHeader({alg:'HS256'}).setIssuer(issuer).setAudience('google-oauth-callback').setIssuedAt().setExpirationTime('10m').sign(secret());
  return {state,nonce,token,challenge:createHash('sha256').update(verifier).digest('base64url')};
}
export async function verifyGoogleFlow(token:string,state:string){
  const {payload}=await jwtVerify(token,secret(),{algorithms:['HS256'],issuer,audience:'google-oauth-callback',maxTokenAge:'10m'});
  if(typeof payload.state!=='string'||typeof payload.nonce!=='string'||typeof payload.verifier!=='string'||!/^[\w-]{43}$/.test(state)||payload.state.length!==state.length||!timingSafeEqual(Buffer.from(payload.state),Buffer.from(state)))throw new Error('Invalid Google login state.');
  return {nonce:payload.nonce,verifier:payload.verifier};
}
export type GoogleIdentity={subject:string;email:string;firstName:string;surname:string;authoritative:boolean};
export async function verifyGoogleIdentity(token:string,nonce:string,clientId:string,keys:JWTVerifyGetKey=googleKeys):Promise<GoogleIdentity>{
  const {payload}=await jwtVerify(token,keys,{algorithms:['RS256'],issuer:['https://accounts.google.com','accounts.google.com'],audience:clientId,maxTokenAge:'10m',clockTolerance:30,requiredClaims:['sub','iat','exp','nonce','email','email_verified']});
  if(payload.nonce!==nonce||payload.email_verified!==true||typeof payload.sub!=='string'||!/^\d{1,255}$/.test(payload.sub)||typeof payload.email!=='string'||payload.email.length>150||!/^\S+@\S+\.\S+$/.test(payload.email)||(payload.azp!==undefined&&payload.azp!==clientId)||(Array.isArray(payload.aud)&&payload.aud.length>1&&payload.azp!==clientId))throw new Error('Invalid Google identity.');
  const email=payload.email.toLowerCase();
  return {subject:payload.sub,email,firstName:typeof payload.given_name==='string'?payload.given_name.trim().slice(0,100):'Customer',surname:typeof payload.family_name==='string'?payload.family_name.trim().slice(0,100):'',authoritative:email.endsWith('@gmail.com')||(typeof payload.hd==='string'&&payload.hd.length>0)};
}
export async function resolveGoogleCustomer(db:PrismaClient,identity:GoogleIdentity){
  return db.$transaction(async tx=>{
    const linked=await tx.$queryRaw<{user_id:number}[]>`SELECT user_id FROM google_identities WHERE google_subject=${identity.subject}`;
    let user=linked.length?await tx.user.findUnique({where:{id:linked[0].user_id}}):await tx.user.findUnique({where:{email:identity.email}});
    if(user&&(user.role!=='User'||user.accountStatus!=='Active'))throw new Error('Google account is unavailable.');
    if(linked.length){if(!user)throw new Error('Google account is unavailable.');return user;}
    // Google does not control arbitrary third-party email addresses. Never
    // attach their existing shop history using email_verified alone.
    if(!identity.authoritative&&(user||await tx.customer.findFirst({where:{email:identity.email},select:{id:true}})))throw new Error('Use your existing email and password to sign in.');
    if(!user){
      user=await tx.user.create({data:{role:'User',accountStatus:'Active',email:identity.email,firstName:identity.firstName||'Customer',surname:identity.surname,password:await hash(randomBytes(32).toString('hex'),12),emailVerifiedAt:new Date()}});
      if(!await tx.customer.findFirst({where:{email:identity.email},select:{id:true}}))await tx.customer.create({data:{email:identity.email,customerName:[identity.firstName,identity.surname].filter(Boolean).join(' ').slice(0,150)||'Customer',phone:'Not provided'}});
    }
    await tx.$executeRaw`INSERT INTO google_identities(google_subject,user_id,created_at) VALUES(${identity.subject},${user.id},UTC_TIMESTAMP(3))`;
    return user;
  });
}
