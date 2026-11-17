export const CATEGORIES = {
  purchase: ['Tecnología', 'Ropa y accesorios', 'Viajes', 'Hogar y muebles', 'Ocio y experiencias', 'Educación', 'Salud y bienestar', 'Otro gusto'],
  household: ['Arriendo o hipoteca', 'Servicios públicos', 'Mercado', 'Internet y telefonía', 'Transporte', 'Salud', 'Mascotas', 'Suscripciones', 'Otros del hogar'],
  reserve: ['Fondo de emergencia', 'Ahorro general', 'Impuestos', 'Deudas', 'Otro ahorro'],
};
export const FREQUENCIES = { weekly: 'Cada semana', fortnightly: 'Cada 15 días', twiceMonthly: 'Dos veces al mes', monthly: 'Cada mes' };
export const MAX_MONEY = 1_000_000_000_000;
export function validDate(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s+'T12:00:00Z')) && new Date(s+'T12:00:00Z').toISOString().slice(0,10) === s; }
export function colombiaToday() { return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Bogota',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function addMonths(date, count) {
  const d = new Date(date+'T12:00:00Z'), day=d.getUTCDate();
  d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+count);
  d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate()));
  return d.toISOString().slice(0,10);
}
export function dueDate(p, index=p.nextIndex||0) {
  if(p.frequency==='monthly')return addMonths(p.firstDate,index);
  if(p.frequency==='twiceMonthly') {
    // Fixed two dates each month, anchored to the first date (1–15).
    const base=addMonths(p.firstDate,Math.floor(index/2));
    if(index%2===0)return base;
    const d=new Date(base+'T12:00:00Z'), last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
    d.setUTCDate(Math.min(d.getUTCDate()+15,last));return d.toISOString().slice(0,10);
  }
  const d=new Date(p.firstDate+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+index*(p.frequency==='weekly'?7:15));return d.toISOString().slice(0,10);
}
export function projection(p, now=colombiaToday()) {
  const remaining=Math.max(0,p.target-p.balance);
  if(!remaining)return {remaining:0,count:0,months:0,date:null};
  if(!(p.contribution>0))return {remaining,count:null,months:null,date:null};
  const count=Math.ceil(remaining/p.contribution);
  let start=p.nextIndex||0;
  // Overdue contributions stay pending; the estimate resumes from the next available date.
  if(dueDate(p,start)<now){
    let low=start,high=start+1;
    while(dueDate(p,high)<now)high=high*2+1;
    while(low<high){const mid=Math.floor((low+high)/2);if(dueDate(p,mid)<now)low=mid+1;else high=mid;}
    start=low;
  }
  const maxCount={weekly:5200,fortnightly:2435,twiceMonthly:2400,monthly:1200}[p.frequency];
  if(count>maxCount)return {remaining,count,months:null,date:null,tooLong:true};
  const date=dueDate(p,start+count-1);
  const months=Math.ceil(Math.max(0,(Date.parse(date+'T12:00:00Z')-Date.parse(now+'T12:00:00Z'))/86400000)/30.4375);
  return {remaining,count,months,date};
}
export function monthlyCommitment(p) {
  const factors={weekly:52/12,fortnightly:365.25/15/12,twiceMonthly:2,monthly:1};
  return Math.round(p.contribution*factors[p.frequency]);
}
export function validatePocket(x) {
  if(!x || typeof x.name!=='string' || !x.name.trim() || x.name.length>100)throw Error('Escribe un nombre de máximo 100 caracteres.');
  if(!CATEGORIES[x.kind]?.includes(x.category))throw Error('Selecciona un tipo y una categoría válidos.');
  for(const k of ['target','contribution'])if(!Number.isSafeInteger(x[k])||x[k]<=0||x[k]>MAX_MONEY)throw Error('El precio y el abono deben ser pesos enteros mayores que cero (máximo un billón).');
  if(!Object.hasOwn(FREQUENCIES,x.frequency)||!validDate(x.firstDate))throw Error('Revisa la frecuencia y la fecha del primer abono.');
  if(x.firstDate<'2000-01-01'||Number(x.firstDate.slice(0,4))>new Date().getUTCFullYear()+100)throw Error('La fecha del plan debe estar entre el año 2000 y los próximos 100 años.');
  if(x.frequency==='twiceMonthly'&&Number(x.firstDate.slice(-2))>15)throw Error('Para dos abonos al mes elige un primer día entre el 1 y el 15.');
  if(typeof x.description!=='string'||x.description.length>10000)throw Error('La descripción admite hasta 10.000 caracteres.');
  return {name:x.name.trim(),kind:x.kind,category:x.category,description:x.description,target:x.target,contribution:x.contribution,frequency:x.frequency,firstDate:x.firstDate};
}
