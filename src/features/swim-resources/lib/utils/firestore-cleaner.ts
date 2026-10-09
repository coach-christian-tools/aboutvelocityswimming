export function cleanFirestoreData<T>(value:T):T {
 if(Array.isArray(value))return value.filter(item=>item!==undefined).map(cleanFirestoreData) as T;
 if(value&&typeof value==='object'&&!(value instanceof Date))return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,cleanFirestoreData(v)])) as T;
 return value;
}
