// Invoked by the OS scheduler, not by a browser timer. Node loads .env.local.
const secret=process.env.CRON_SECRET;
if(!secret||secret.startsWith('replace-'))throw new Error('Configure CRON_SECRET before scheduling attendance.');
const base=process.env.ATTENDANCE_APP_URL||'http://localhost:3000';
const url=new URL('/api/cron/grooming-no-shows',base);
if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Remote attendance endpoint requires HTTPS.');
try{const response=await fetch(url,{headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(55000)});if(!response.ok)throw new Error(`Attendance endpoint returned ${response.status}`);console.log(JSON.stringify(await response.json()));}catch{console.error('Attendance job unavailable. Scheduler will retry on its next run.');process.exitCode=1;}
