import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, chmod } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const status=JSON.parse(execFileSync('supabase',['status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
assert.equal(status.API_URL,'http://127.0.0.1:54321','Private export browser test refuses hosted databases.');
const base='http://127.0.0.1:3001';
const browser=await chromium.launch({headless:true});
const directory=new URL('../../backups/private-baseline-browser/',import.meta.url);
await mkdir(directory,{recursive:true,mode:0o700});
const file=new URL('baseline.json',directory);
const exportsUrl=base+'/tools/review/exports';
const buttonName='Download private race baseline';
async function testContext(options){
 const context=await browser.newContext(options);
 await context.route('**/auth/v1/**',route=>new URL(route.request().url()).origin===status.API_URL?route.continue():route.abort());
 return context;
}
try{
 const context=await testContext({acceptDownloads:true});
 assert.equal((await context.request.get(base+'/api/collection/race-baseline')).status(),401);
 const page=await context.newPage();
 page.setDefaultTimeout(60000);
 await page.goto(exportsUrl);
 await page.waitForURL(base+'/login');
 assert.equal(await page.getByRole('button',{name:buttonName,exact:true}).count(),0);
 await page.getByRole('button',{name:/password/i}).click();
 await page.locator('input[type=email]').fill('christiancutter02@gmail.com');
 await page.locator('input[type=password]').fill('Velocity-local-test-2026!');
 await page.locator('button[type=submit]').click();
 await page.waitForURL(base+'/tools');
 await page.goto(exportsUrl);
 const action=page.getByRole('button',{name:buttonName,exact:true});
 await action.waitFor();
 const pending=page.waitForEvent('download');
 await action.click();
 const download=await pending;
 await download.saveAs(file.pathname);await chmod(file,0o600);
 const baseline=JSON.parse(await readFile(file,'utf8'));
 assert.equal(baseline.project,'local:aboutvelocityswimming');
 assert.equal(baseline.consistency.verified,true);
 assert.match(baseline.canonicalRevision,/^\d+$/);
 for(const name of baseline.completeCollections)assert.equal(baseline[name].length,baseline.collectionCounts[name]);
 assert.equal(baseline.catalog.length,baseline.catalogCount);
 assert.equal(baseline.catalogComplete,true);
 const response=await context.request.get(base+'/api/collection/race-baseline');
 assert.match(response.headers()['cache-control'],/private.*no-store/);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 await page.screenshot({path:new URL('exports.png',directory).pathname,fullPage:true,animations:'disabled'});
 // A failed middle page must produce a message, never a partial download.
 let downloaded=false;page.on('download',()=>downloaded=true);
 await page.route('**/api/collection/race-baseline?*',async route=>{
  if(new URL(route.request().url()).searchParams.has('collection'))await route.fulfill({status:409,json:{error:'Data changed during export. Discard these pages and start again.'}});
  else await route.continue();
 });
 await action.click();await page.getByRole('status').filter({hasText:'Data changed during export'}).waitFor();
 assert.equal(downloaded,false);
 await context.close();
 const family=await testContext();const familyPage=await family.newPage();
 await familyPage.goto(base+'/login');await familyPage.getByRole('button',{name:/password/i}).click();
 await familyPage.locator('input[type=email]').fill('family-a@example.test');
 await familyPage.locator('input[type=password]').fill('Velocity-local-test-2026!');await familyPage.locator('button[type=submit]').click();
 await familyPage.getByText('This account does not have access to the tools.').waitFor();
 assert.equal((await family.request.get(base+'/api/collection/race-baseline')).status(),403);
 await familyPage.goto(exportsUrl);
 await familyPage.waitForURL(base+'/login');
 assert.equal(await familyPage.getByRole('button',{name:buttonName,exact:true}).count(),0);
 console.log('Verified staff private baseline download, all collection counts/catalog, private headers, mobile layout, changing-export rejection, and anonymous/family denial.');
}finally{await browser.close();}
