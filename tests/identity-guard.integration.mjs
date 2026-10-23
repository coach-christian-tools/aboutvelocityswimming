import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const status=JSON.parse(execFileSync('supabase',['status','--output','json'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}));
assert.equal(status.API_URL,'http://127.0.0.1:54321','Identity tests refuse hosted data.');
const project=readFileSync('supabase/config.toml','utf8').match(/^project_id = "([a-zA-Z0-9_-]+)"/m)?.[1];
assert.ok(project);
const args=['exec','-i','supabase_db_'+project,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-qAt'];
const q=v=>"'"+String(v).replaceAll("'","''")+"'";
const j=v=>q(JSON.stringify(v))+'::jsonb';
const run=(body,commit=false)=>execFileSync('docker',args,{input:'BEGIN;\n'+body+'\n'+(commit?'COMMIT;':'ROLLBACK;'),encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const asyncRun=(body,onChunk=()=>{})=>new Promise((resolve,reject)=>{const p=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',x=>{out+=x;onChunk(String(x));});p.stderr.on('data',x=>err+=x);p.on('error',reject);p.on('close',code=>code===0?resolve(out):reject(new Error(err)));p.stdin.end('BEGIN;\n'+body+'\nCOMMIT;');});
const staff=`select set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'email',email,'role','authenticated')::text from auth.users where email='coach@velocity-swimming.com'),true); SET LOCAL ROLE authenticated;`;
const assertSql=(condition,message)=>`if not coalesce((${condition}),false) then raise exception ${q(message)}; end if;`;
const expect=(body,state)=>`declare caught boolean:=false; begin begin ${body} exception when sqlstate '${state}' then caught:=true; end; ${assertSql('caught','Expected rejection '+state)} end;`;
function fixture(prefix){return `select private.put_record(${q('teams/'+prefix)},${j({name:'Synthetic identity club'})});
 select private.put_record(${q('athletes/'+prefix)},${j({id:prefix,name:{first:'Synthetic',last:'Identity'}})});
 select private.put_record(${q('meets/'+prefix)},${j({id:prefix,name:'Synthetic identity meet'})});`;}
function race(prefix,id='race',changes={}){return {id:prefix+'-'+id,athleteId:prefix,teamId:prefix,eventCode:'100_FR_SCY',course:'SCY',distance:100,stroke:'FR',round:'F',gender:'F',ageAtSwim:15,ageGroup:'15-16',timeMs:60000,status:'OK',isOfficial:false,isRelay:false,meet:{id:prefix,date:'2001-01-01',name:'Synthetic identity meet'},...changes};}
const putRace=b=>`select private.put_record(${q('swims/'+b.id)},${j(b)});`;
const proof=occurrence=>({occurrence,reviewed:true,basis:'Synthetic reviewed separate start evidence',sourceUrl:'https://example.test/starts'});
const id=()=> 'identity-fixture-'+randomUUID();

const workerFixture=p=>`insert into private.collection_workers(name,token_hash,divisions) values(${q(p)},encode(extensions.digest(${q(p)},'sha256'),'hex'),array['times']);`;
const localStaff=staff.replace('SET LOCAL ROLE authenticated;','');
const collectionBatch=(p,writes,extra={})=>({division:'times',scope:p,sourceUrl:'https://example.test/'+p,capturedAt:new Date().toISOString(),coverage:'partial',evidence:{text:'Synthetic prerequisite routing evidence'},writes,...extra});
const fullRebuildMustNotRun=`create or replace function private.rebuild_bests() returns void language plpgsql security definer set search_path='' set work_mem='64MB' as $$ begin raise exception 'Unexpected full rebuild'; end; $$;`;

await test('fresh athlete and meet additions rebuild only incoming events, and prerequisite-only additions preserve all bests',()=>{
 const p=id(),a=p+'-new',m=p+'-new',ok=race(p,'fresh',{athleteId:a,isOfficial:true,meet:{id:m,date:'2001-01-01',name:'Synthetic new meet'}}),dq=race(p,'dq',{status:'DQ',eventCode:'50_FR_SCY',distance:50});
 const writes=[{path:'athletes/'+a,after:{id:a,name:{first:'New',last:'Fixture'},status:'active'}},{path:'meets/'+m,after:{id:m,name:'Synthetic new meet'}},{path:'swims/'+ok.id,after:ok},{path:'swims/'+dq.id,after:dq}];
 run(fixture(p)+workerFixture(p)+fullRebuildMustNotRun+localStaff+`DO $$ declare bid uuid; begin
 bid:=private.stage_collection(${q(p)},${j(collectionBatch(p,writes))}); perform private.review_collection(bid,'approved','Synthetic routing test');
 ${assertSql(`(select status='approved' from public.collection_batches where id=bid)`,'Fresh mixed batch was not approved')}
 ${assertSql(`(select data->>'swimId'=${q(ok.id)} from public.athlete_bests where athlete_id=${q(a)} and event_code='100_FR_SCY')`,'New athlete PB missing')}
 ${assertSql(`not exists(select 1 from public.athlete_bests where data->>'swimId'=${q(dq.id)})`,'DQ entered derived bests')}
 end; $$;
 create temp table prior_bests as select athlete_id,event_code,data,ctid row_tid from public.athlete_bests;
 DO $$ declare bid uuid; begin bid:=private.stage_collection(${q(p)},${j(collectionBatch(p,[{path:'athletes/'+a+'-only',after:{name:{first:'Only',last:'Prerequisite'}}},{path:'meets/'+m+'-only',after:{name:'Only prerequisite'}}]))});
 perform private.review_collection(bid,'approved','Synthetic prerequisite-only test');
 ${assertSql(`not exists(select 1 from prior_bests x full join public.athlete_bests b using(athlete_id,event_code) where x.data is distinct from b.data or x.row_tid is distinct from b.ctid)`,'Prerequisite-only insertion touched derived bests')}
 end; $$;`);
});

await test('existing athlete, meet, and team changes retain full rebuild and failure rolls back claims and all writes',()=>{
 for(const root of ['athletes','meets','teams']){
  const p=id(),a=p+'-added',swim=race(p,'added',{athleteId:a});
  const after=root==='athletes'?{id:p,name:{first:'Synthetic',last:'Identity'},status:'active'}:{id:p,name:'Changed synthetic '+root};
  const writes=[{path:root+'/'+p,after},{path:'athletes/'+a,after:{name:{first:'Rollback',last:'Fixture'}}},{path:'swims/'+swim.id,after:swim}];
  run(fixture(p)+workerFixture(p)+fullRebuildMustNotRun+localStaff+`DO $$ declare bid uuid; rev bigint; caught boolean:=false; begin
   bid:=private.stage_collection(${q(p)},${j(collectionBatch(p,writes))}); select revision into rev from private.canonical_revision;
   begin perform private.review_collection(bid,'approved','Synthetic fallback test'); exception when raise_exception then if sqlerrm='Unexpected full rebuild' then caught:=true; else raise; end if; end;
   ${assertSql('caught','Existing canonical update skipped full rebuild')}
   ${assertSql('(select revision=rev from private.canonical_revision)','Failed approval advanced revision')}
   ${assertSql(`not exists(select 1 from public.athletes where id=${q(a)}) and not exists(select 1 from public.swims where id=${q(swim.id)})`,'Failed approval persisted canonical rows')}
   ${assertSql(`not exists(select 1 from private.result_occurrences where result_id=${q(swim.id)})`,'Failed approval persisted identity claim')}
   ${assertSql("not exists(select 1 from public.collection_reviews where batch_id=bid) and (select status='pending' from public.collection_batches where id=bid)",'Failed approval persisted decision')}
  end; $$;`);
 }
});

await test('routing requires physical row absence and complete fresh before-images, and retains every read swim event',()=>{
 const p=id(),a=p+'-new',m=p+'-json-null',r=race(p,'new'),other=race(p,'prior',{eventCode:'50_FR_SCY',distance:50});
 run(fixture(p)+workerFixture(p)+fullRebuildMustNotRun+localStaff+`insert into public.meets(id,data) values(${q(m)},'null'::jsonb);
 DO $$ declare bid uuid; caught boolean:=false; begin bid:=private.stage_collection(${q(p)},${j(collectionBatch(p,[{path:'meets/'+m,after:{name:'Existing malformed meet'}}]))});
 begin perform private.review_collection(bid,'approved','Synthetic physical absence test'); exception when raise_exception then if sqlerrm='Unexpected full rebuild' then caught:=true; else raise; end if; end;
 ${assertSql('caught','JSON-null existing row was treated as physically absent')} end; $$;
 DO $$ declare bid uuid; caught boolean:=false; begin bid:=private.stage_collection(${q(p)},${j(collectionBatch(p,[{path:'athletes/'+a,after:{name:{first:'Absent',last:'Read'}}}]))});
 update public.collection_batches set reads='[]'::jsonb where id=bid;
 begin perform private.review_collection(bid,'approved','Synthetic missing before-image test'); exception when raise_exception then if sqlerrm='Unexpected full rebuild' then caught:=true; else raise; end if; end;
 ${assertSql('caught','Missing before-image qualified for narrow routing')} end; $$;
 select set_config('velocity.defer_bests','true',true);
 ${putRace(other)}
 create temp table routed_events(events text[]);
 create or replace function private.rebuild_bests_for_events(event_codes text[]) returns void language plpgsql security definer set search_path='' set work_mem='64MB' as $$ begin insert into pg_temp.routed_events values(event_codes); end; $$;
 DO $$ declare bid uuid; begin bid:=private.stage_collection(${q(p)},${j(collectionBatch(p,[{path:'swims/'+r.id,after:r}],{reads:[{path:'swims/'+other.id,before:other}]}))}); perform private.review_collection(bid,'approved','Synthetic read event test');
 ${assertSql("(select array_agg(e order by e)=array['100_FR_SCY','50_FR_SCY'] from pg_temp.routed_events,unnest(events)e)",'Read and written swim events were not both rebuilt')}
 end; $$;`);
});

await test('stable member claims allow reviewed aliases and reject a second canonical person atomically',()=>{
 const p=id(),hash='a'.repeat(24),hash2='b'.repeat(24);
 run(fixture(p)+`select private.claim_athlete_identity('hytek-member','${hash}',${q(p)},'{}'); select private.claim_athlete_identity('hytek-member','${hash2}',${q(p)},'{}');
 DO $$ ${expect(`perform private.put_record(${q('athletes/'+p+'-other')},${j({name:{first:'Other',last:'Person'},sourceObservation:{memberIdHash:hash}})});`,'23505')} $$;
 DO $$ begin ${assertSql(`(select count(*)=2 from private.athlete_source_identities where athlete_id=${q(p)})`,'Aliases were lost')}
 ${assertSql(`not exists(select 1 from public.athletes where id=${q(p+'-other')})`,'Rejected person partially persisted')} end; $$;`);
});
await test('different external IDs cannot bypass occurrence identity, including direct service-role writes',()=>{
 const p=id(),a=race(p,'a',{externalResult:{namespace:'fixture-a',id:'one'}}),b=race(p,'b',{externalResult:{namespace:'fixture-b',id:'two'}});
 run(fixture(p)+putRace(a)+`SET LOCAL ROLE service_role; DO $$ ${expect(`insert into public.swims(id,data) values(${q(b.id)},${j(b)});`,'23505')} $$; RESET ROLE;
 DO $$ begin ${assertSql(`(select count(*)=1 from public.swims where data->>'athleteId'=${q(p)})`,'Duplicate performance persisted')} end; $$;`);
});
await test('prelims, finals, courses, and explicitly reviewed repeated starts remain distinct',()=>{
 const p=id();
 run(fixture(p)+putRace(race(p,'p',{round:'P'}))+putRace(race(p,'f'))+putRace(race(p,'lcm',{eventCode:'100_FR_LCM',course:'LCM'}))
  +putRace(race(p,'tt1',{round:'TT',raceIdentity:proof('tt-1')}))+putRace(race(p,'tt2',{round:'TT',raceIdentity:proof('tt-2')}))
  +`DO $$ begin ${assertSql(`(select count(*)=5 from public.swims where data->>'athleteId'=${q(p)})`,'Distinct starts collapsed')} end; $$;`);
});
await test('unresolved legacy overlaps fail closed without mutating the existing fact',()=>{
 const p=id(),a=race(p,'legacy'),b=race(p,'new',{raceIdentity:proof('alternate')});
 run(fixture(p)+putRace(a)+`delete from private.result_occurrences where kind='swim' and result_id=${q(a.id)};
 DO $$ ${expect(`perform private.put_record(${q('swims/'+b.id)},${j(b)});`,'23505')} $$;
 DO $$ begin ${assertSql(`(select data=${j(a)} from public.swims where id=${q(a.id)})`,'Legacy fact changed')} end; $$;`);
});
await test('staff-only export is complete, bounded, and invalidated by alias/canonical changes',()=>{
 const p=id();
 run(fixture(p)+`insert into public.knowledge_entries(id,data) select ${q(p)}||'-catalog-'||lpad(n::text,3,'0'),jsonb_build_object('kind','meet','title','Synthetic catalog','sourceUrl','https://example.test/catalog') from generate_series(1,205)n;
 ${staff} DO $$ declare meta jsonb; page jsonb; n integer:=0; cursor text; begin
 meta:=public.private_race_baseline_page();
 loop page:=public.private_race_baseline_page('catalog',cursor,17,meta->>'revision'); n:=n+jsonb_array_length(page->'rows'); cursor:=page->>'nextAfter'; exit when cursor is null; end loop;
 ${assertSql("n=(meta#>>'{counts,catalog}')::integer and n>=205",'Catalog export incomplete')}
 begin perform public.private_race_baseline_page('athletes',null,501,meta->>'revision'); raise exception 'Unbounded export accepted'; exception when sqlstate '22023' then null; end;
 end; $$; RESET ROLE;
 DO $$ declare rev text; caught boolean:=false; begin select revision::text into rev from private.canonical_revision;
 perform private.claim_athlete_identity('fixture','new-alias',${q(p)},'{}');
 perform set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'email',email,'role','authenticated')::text from auth.users where email='coach@velocity-swimming.com'),true);
 begin perform public.private_race_baseline_page('athletes',null,100,rev); exception when sqlstate '40001' then caught:=true; end;
 ${assertSql('caught','Changing export revision was accepted')} end; $$;`);
 for (const role of ['anon','family']) {
  const identity=role==='anon'?`select set_config('request.jwt.claims','{"role":"anon"}',true); SET LOCAL ROLE anon;`:`select set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'email',email,'role','authenticated')::text from auth.users where email='family-a@example.test'),true); SET LOCAL ROLE authenticated;`;
  run(identity+`DO $$ ${expect('perform public.private_race_baseline_page();','42501')} $$;`);
 }
 run(`DO $$ begin ${assertSql("not has_table_privilege('authenticated','private.athlete_source_identities','SELECT') and not has_table_privilege('service_role','private.result_occurrences','SELECT')",'Private tables gained access')} end; $$;`);
});

function createBatches(p){
 const a=race(p,'a',{externalResult:{namespace:'alias-a',id:p}}),b=race(p,'b',{externalResult:{namespace:'alias-b',id:p}});
 const setup=fixture(p)+`insert into private.collection_workers(name,token_hash,divisions) values(${q(p)},encode(extensions.digest(${q(p)},'sha256'),'hex'),array['times']);`;
 run(setup,true);
 const batches=[a,b].map((body,i)=>({division:'times',scope:p,sourceUrl:'https://example.test/'+p+'/'+i,capturedAt:new Date().toISOString(),coverage:'partial',evidence:{text:'Synthetic review evidence'},writes:[{path:'athletes/'+p+'-extra-'+i,after:{name:{first:'Extra',last:'Synthetic'}}},{path:'swims/'+body.id,after:body}]}));
 return batches.map(b=>run(`select private.stage_collection(${q(p)},${j(b)});`,true).split('\n').at(-1));
}
function cleanup(p){run(`delete from public.collection_reviews where batch_id in (select id from public.collection_batches where scope=${q(p)}); delete from public.collection_batches where scope=${q(p)}; delete from private.collection_workers where name=${q(p)};
 delete from public.swims where data->>'athleteId'=${q(p)}; delete from public.meets where id=${q(p)};
 delete from public.athletes where id=${q(p)} or id like ${q(p+'-extra-%')}; delete from public.public_athletes where id like ${q(p+'%')}; delete from public.people where id like ${q('person_'+p+'%')}; delete from public.teams where id=${q(p)};`,true);}
await test('competing approvals with different source IDs yield one result and roll back every losing write and receipt',async()=>{
 const p=id();
 try{
  const batches=createBatches(p);
  const outcomes=await Promise.allSettled(batches.map(batch=>asyncRun(staff+`select public.review_collection(${q(batch)},'approved','Synthetic concurrency check');`)));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.match(outcomes.find(x=>x.status==='rejected').reason.message,/baseline changed/i);
  const result=JSON.parse(run(`select jsonb_build_object('races',(select count(*) from public.swims where data->>'athleteId'=${q(p)}),'extras',(select count(*) from public.athletes where id like ${q(p+'-extra-%')}),'reviews',(select count(*) from public.collection_reviews where batch_id in (select id from public.collection_batches where scope=${q(p)})),'claims',(select count(*) from private.result_occurrences where result_id like ${q(p+'-%')}));`).split('\n').at(-1));
  assert.deepEqual(result,{races:1,extras:1,reviews:1,claims:1});
 }finally{cleanup(p);}
});
await test('alias changes after staging reject approval and held/declined decisions remain available',()=>{
 const p=id();
 try{
  const [batch]=createBatches(p);
  run(`select private.claim_athlete_identity('fixture',${q(p)},${q(p)},'{}');`,true);
  run(staff+`DO $$ ${expect(`perform public.review_collection(${q(batch)},'approved','Stale must reject');`,'40001')} $$;
 select public.review_collection(${q(batch)},'held','Keep existing review decision');`);
  assert.equal(run(`select count(*) from public.swims where data->>'athleteId'=${q(p)};`),'0');
 }finally{cleanup(p);}
});
console.log('Identity/revision/export verification completed against localhost only.');
await test('a duplicate rejected after earlier writes rolls back profiles, aliases, revision, and review receipt',()=>{
 const p=id(),original=race(p,'original'),duplicate=race(p,'duplicate'),extra=p+'-extra-0';
 run(fixture(p)+putRace(original)+`insert into private.collection_workers(name,token_hash,divisions) values(${q(p)},encode(extensions.digest(${q(p)},'sha256'),'hex'),array['times']);`,true);
 try{
  const revision=run('select revision from private.canonical_revision;');
  const batch={division:'times',scope:p,sourceUrl:'https://example.test/rollback',capturedAt:new Date().toISOString(),coverage:'partial',evidence:{identityGuard:{version:1,revision,athleteAliases:[{namespace:'fixture',sourceId:p,athleteId:extra,reviewed:true,basis:'Synthetic alias rollback',sourceUrl:'https://example.test/alias'}]}},writes:[{path:'athletes/'+extra,after:{name:{first:'Must',last:'Rollback'}}},{path:'swims/'+duplicate.id,after:duplicate}]};
  const bid=run(`select private.stage_collection(${q(p)},${j(batch)});`,true);
  run(staff+`DO $$ ${expect(`perform public.review_collection(${q(bid)},'approved','Reject duplicate atomically');`,'23505')} $$;`);
  const result=JSON.parse(run(`select jsonb_build_object('revision',(select revision::text from private.canonical_revision),'extra',(select count(*) from public.athletes where id=${q(extra)}),'aliases',(select count(*) from private.athlete_source_identities where namespace='fixture' and source_id=${q(p)}),'reviews',(select count(*) from public.collection_reviews where batch_id=${q(bid)}),'original',(select data=${j(original)} from public.swims where id=${q(original.id)}));`));
  assert.deepEqual(result,{revision,extra:0,aliases:0,reviews:0,original:true});
 }finally{cleanup(p);}
});
await test('an export revision cannot be reused for staging after a canonical alias changes',()=>{
 const p=id();
 run(fixture(p)+`insert into private.collection_workers(name,token_hash,divisions) values(${q(p)},encode(extensions.digest(${q(p)},'sha256'),'hex'),array['times']);`,true);
 try{
  const rev=run('select revision from private.canonical_revision;');
  run(`select private.claim_athlete_identity('fixture',${q(p)},${q(p)},'{}');`,true);
  const batch={division:'times',scope:'Pilot race preparation: stale',sourceUrl:'https://example.test/stale',capturedAt:new Date().toISOString(),coverage:'partial',evidence:{sourceManifestRequired:true,baselineComplete:true,catalogScope:'pilot',identityGuard:{version:1,revision:rev}},writes:[{path:'swims/'+race(p).id,after:race(p)}]};
  run(`DO $$ ${expect(`perform private.stage_collection(${q(p)},${j(batch)});`,'40001')} $$;`);
 }finally{cleanup(p);}
});

await test('a concurrent committed alias change wins the shared lock and invalidates waiting approval',async()=>{
 const p=id();
 try{
  const [batch]=createBatches(p);
  let signal;
  const locked=new Promise(resolve=>{signal=resolve;});
  const alias=asyncRun(`select private.claim_athlete_identity('fixture',${q(p)},${q(p)},'{}'); select 'alias-lock-held'; select pg_sleep(0.3);`,chunk=>{if(chunk.includes('alias-lock-held'))signal();});
  await locked;
  const approval=asyncRun(staff+`select public.review_collection(${q(batch)},'approved','Waiting behind alias');`).then(()=>null,error=>error);
  await alias;
  assert.match((await approval)?.message??'',/baseline changed/i);
 }finally{cleanup(p);}
});

await test('joined athlete group names invalidate baseline revisions too',()=>{
 const p=id();
 run(fixture(p)+`DO $$ declare rev text; caught boolean:=false; begin
 select revision::text into rev from private.canonical_revision;
 update public.training_groups set name='Synthetic changed group name' where id='unassigned';
 perform set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'email',email,'role','authenticated')::text from auth.users where email='coach@velocity-swimming.com'),true);
 begin perform public.private_race_baseline_page('athletes',null,100,rev); exception when sqlstate '40001' then caught:=true; end;
 ${assertSql('caught','Joined athlete snapshot dependency did not invalidate export')} end; $$;`);
});

await test('legacy upsert and collection corrections preserve unclaimed S/TT and overlapping facts',()=>{
 const p=id(),tt=race(p,'legacy-tt',{round:'TT',raceIdentity:proof('tt')}),
  one=race(p,'legacy-one',{raceIdentity:proof('one')}),two=race(p,'legacy-two',{raceIdentity:proof('two')});
 const legacy={...tt}; delete legacy.raceIdentity;
 const corrected={...legacy,timeMs:61000,sourceObservation:{url:'https://example.test/correction'}};
 const details={...corrected,splits:[{distance:50,cumulativeMs:30000,lapMs:30000},{distance:100,cumulativeMs:61000,lapMs:31000}],splitCoverage:'complete'};
 const correctedOverlap={...one,timeMs:62000}; delete correctedOverlap.raceIdentity;
 const batch={division:'times',scope:p,sourceUrl:'https://example.test/correction',capturedAt:new Date().toISOString(),coverage:'partial',evidence:{text:'Reviewed legacy split details'},writes:[{path:'swims/'+tt.id,after:details}]};
 run(fixture(p)+putRace(tt)+putRace(one)+putRace(two)+`
 delete from private.result_occurrences where result_id like ${q(p+'-%')};
 update public.swims set data=data-'raceIdentity' where data->>'athleteId'=${q(p)};
 `+putRace(corrected)+putRace(correctedOverlap)+`
 insert into private.collection_workers(name,token_hash,divisions) values(${q(p)},encode(extensions.digest(${q(p)},'sha256'),'hex'),array['times']);
 select set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'email',email,'role','authenticated')::text from auth.users where email='coach@velocity-swimming.com'),true);
 DO $$ declare bid uuid; begin bid:=private.stage_collection(${q(p)},${j(batch)}); perform public.review_collection(bid,'approved','Reviewed details');
 ${assertSql(`(select data=${j(details)} from public.swims where id=${q(tt.id)})`,'Legacy details correction failed')}
 ${assertSql(`(select data=${j(correctedOverlap)} from public.swims where id=${q(one.id)})`,'Overlapping legacy correction failed')}
 ${assertSql(`not exists(select 1 from private.result_occurrences where result_id like ${q(p+'-%')})`,'Correction invented a historical claim')}
 ${assertSql(`(select count(*)=3 from public.swims where data->>'athleteId'=${q(p)})`,'Legacy rows changed count')}
 end; $$;
 DO $$ ${expect(`perform private.put_record(${q('swims/'+p+'-new-overlap')},${j(race(p,'new-overlap'))});`,'23505')} $$;
 DO $$ ${expect(`perform private.put_record(${q('swims/'+tt.id)},${j({...details,sourceObservation:{memberIdHash:'a'.repeat(24)}})});`,'P0001')} $$;`);
});

await test('the existing staging CLI refreshes an unchanged old collector proposal after an unrelated change',()=>{
 const p=id(),body=race(p),folder='backups/identity-regression-'+p,path=folder+'/batch.json';
 const batch={division:'times',scope:p,sourceUrl:'https://example.test/old-collector',capturedAt:new Date().toISOString(),coverage:'partial',evidence:{text:'Existing collector contract without identityGuard'},writes:[{path:'swims/'+body.id,after:body}]};
 run(fixture(p)+`insert into private.collection_workers(name,token_hash,divisions) values(${q(p)},encode(extensions.digest(${q(p)},'sha256'),'hex'),array['times']);`,true);
 mkdirSync(folder,{recursive:true,mode:0o700}); writeFileSync(path,JSON.stringify(batch),{mode:0o600});
 const stage=()=>execFileSync(process.execPath,['scripts/collection/stage.mjs',path],{encoding:'utf8',env:{...process.env,NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:status.PUBLISHABLE_KEY,VELOCITY_COLLECTOR_TOKEN:p},stdio:['ignore','pipe','pipe']}).match(/Staged batch ([a-f0-9-]+)/)?.[1];
 try{
  const old=stage(); assert.ok(old); assert.equal(stage(),old);
  run(`select private.claim_athlete_identity('fixture',${q(p)},${q(p)},'{}');`,true);
  run(staff+`DO $$ ${expect(`perform public.review_collection(${q(old)},'approved','Must reject stale old batch');`,'40001')} $$;`);
  const fresh=stage(); assert.ok(fresh); assert.notEqual(fresh,old); assert.equal(stage(),fresh);
  run(staff+`select public.review_collection(${q(fresh)},'approved','Fresh legacy collector proposal');`,true);
  assert.equal(run(`select count(*) from public.swims where id=${q(body.id)};`),'1');
  assert.equal(run(`select status from public.collection_batches where id=${q(old)};`),'pending');
 }finally{cleanup(p);rmSync(folder,{recursive:true});}
});

await test('actual verified lead-off producer keeps an equal-time individual final and same-batch relay start distinct',()=>{
 const p=id(),parent={id:p+'-relay',teamId:p,eventCode:'200_FR-R_SCY',distance:200,stroke:'FR',course:'SCY',round:'F',status:'OK',isRelay:true,isOfficial:true,timeMs:120000,gender:'F',ageGroup:'15-16',relayName:'Synthetic relay',meet:{id:p,date:'2001-01-01',name:'Synthetic identity meet'},members:[{leg:1,athleteId:p,name:'Synthetic Identity',gender:'F',stroke:'FR',timeMs:30000}],splits:[50,100,150,200].map(distance=>({distance,cumulativeMs:distance*600,lapMs:30000})),splitCoverage:'complete',sourceObservation:{memberNames:{'1':{first:'Synthetic',last:'Identity'}},memberAges:{'1':15}}};
 const verification={verified:true,flatStart:true,timingVerified:true,leadOffStatus:'OK',sourceUrl:'https://example.test/lead-proof',relayResultId:parent.id,athleteId:p,timeMs:30000};
 const individual=race(p,'final',{eventCode:'50_FR_SCY',distance:50,timeMs:30000,isOfficial:true});
 const python=`import importlib.util,json,sys\ns=importlib.util.spec_from_file_location('producer','scripts/swim-resources/prepare-ies-relays.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)\nv=json.load(sys.stdin);body,error=m.verified_leadoff(v['parent'],v['verification'],{m.fingerprint(v['individual'])});assert error is None,error;print(json.dumps(body))`;
 const lead=JSON.parse(execFileSync('python3',['-c',python],{input:JSON.stringify({parent,verification,individual}),encoding:'utf8'}));
 const batch={division:'times',scope:p,sourceUrl:verification.sourceUrl,capturedAt:new Date().toISOString(),coverage:'partial',evidence:{text:'Actual verified relay producer'},writes:[{path:'swims/'+lead.id,after:lead},{path:'relay_results/'+parent.id,after:parent}]};
 run(fixture(p)+putRace(individual)+`
 delete from private.result_occurrences where result_id=${q(individual.id)};
 insert into private.collection_workers(name,token_hash,divisions) values(${q(p)},encode(extensions.digest(${q(p)},'sha256'),'hex'),array['times']);
 select set_config('request.jwt.claims',(select jsonb_build_object('sub',id,'email',email,'role','authenticated')::text from auth.users where email='coach@velocity-swimming.com'),true);
 DO $$ declare bid uuid; begin bid:=private.stage_collection(${q(p)},${j(batch)}); perform public.review_collection(bid,'approved','Separate reviewed relay start');
 ${assertSql(`(select count(*)=2 from public.swims where data->>'athleteId'=${q(p)})`,'Distinct starts collapsed')}
 ${assertSql(`(select data=${j(individual)} from public.swims where id=${q(individual.id)})`,'Individual final changed')}
 end; $$;
 DO $$ ${expect(`perform private.put_record(${q('swims/'+p+'-duplicate-lead')},${j({...lead,id:p+'-duplicate-lead'})});`,'23505')} $$;
 DO $$ ${expect(`perform private.put_record(${q('swims/'+lead.id)},${j({...lead,leadOffVerification:{...lead.leadOffVerification,flatStart:false}})});`,'P0001')} $$;
 DO $$ begin ${assertSql(`(select data=${j(lead)} from public.swims where id=${q(lead.id)})`,'Rejected verification changed lead-off')} end; $$;`);
});

for (const root of ['teams','athletes']) await test(`indexed ${root} snapshots preserve evidence-only, collision, and joined data semantics`,()=>{
 const p=id(),path=root+'/'+p,only=root+'/'+p+'-evidence-only';
 const evidence={fixture:'Evidence-only snapshot',sourceUrl:'https://example.test/snapshot'};
 const setup=fixture(p)+(root==='athletes'?`
 update public.people set data=data||'{"name":"Renamed Synthetic"}'::jsonb where id=(select person_id from public.athletes where id=${q(p)});
 insert into public.training_groups(id,name) values(${q(p)},'Reviewed synthetic group');
 update public.athletes set group_id=${q(p)} where id=${q(p)};`:'');
 run(setup+`
 insert into public.evidence_records(path,data) values(${q(only)},${j(evidence)});
 DO $$ begin
 ${assertSql(`private.collection_snapshot(${q(path)})=(select data from public.app_records where path=${q(path)})`,'Canonical snapshot differs from record view')}
 ${assertSql(`private.collection_snapshot(${q(only)})=${j(evidence)}`,'Evidence-only snapshot was omitted')}
 ${assertSql(`private.collection_snapshot(${q(root+'/'+p+'-missing')}) is null`,'Missing snapshot changed')}
 ${assertSql(`private.collection_snapshot(${q(root+'/'+p+'/extra')}) is null`,'Nested path changed')}
 ${root==='athletes'?assertSql(`private.collection_snapshot(${q(path)})#>>'{name,first}'='Renamed' and private.collection_snapshot(${q(path)})#>>'{currentGroup,name}'='Reviewed synthetic group'`,'Joined athlete name/group was lost'):''}
 end; $$;
 insert into public.evidence_records(path,data) values(${q(path)},${j({fixture:'Exact-path collision'})});
 DO $$ ${expect(`perform (select data from public.app_records where path=${q(path)});`,'21000')} $$;
 DO $$ ${expect(`perform private.collection_snapshot(${q(path)});`,'21000')} $$;`);
});
