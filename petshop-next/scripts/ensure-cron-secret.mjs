import { readFile,writeFile } from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const path='.env.local';const text=await readFile(path,'utf8');
const match=text.match(/^CRON_SECRET\s*=\s*["']?([^"'\r\n]*)/m);
if(!match||!match[1]||match[1].startsWith('replace-')){const line=`CRON_SECRET="${randomBytes(32).toString('hex')}"`;await writeFile(path,match?text.replace(/^CRON_SECRET.*$/m,line):text+'\n'+line+'\n');console.log('Local scheduler secret configured.');}else console.log('Existing scheduler secret preserved.');
