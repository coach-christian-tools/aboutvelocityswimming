import {createClient} from '@supabase/supabase-js';
export const PRIVATE_IMPORT_HEADERS={'Cache-Control':'private, no-store'};
export async function authorizePreparedImports(request:Request):Promise<Response|null>{
 if(process.env.NODE_ENV!=='development'||!['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname))return Response.json({available:false},{status:404,headers:PRIVATE_IMPORT_HEADERS});
 const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!token)return Response.json({error:'Sign in to view prepared imports.'},{status:401,headers:PRIVATE_IMPORT_HEADERS});
 if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)return Response.json({error:'The backend is unavailable.'},{status:503,headers:PRIVATE_IMPORT_HEADERS});
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{global:{headers:{Authorization:'Bearer '+token}},auth:{persistSession:false}});
 const {data:{user},error}=await client.auth.getUser(token);if(error||!user)return Response.json({error:'Sign in again.'},{status:401,headers:PRIVATE_IMPORT_HEADERS});
 const {data:staff}=await client.rpc('is_staff');return staff?null:Response.json({error:'Staff access required.'},{status:403,headers:PRIVATE_IMPORT_HEADERS});
}
