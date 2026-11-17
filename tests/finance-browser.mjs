import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage();
 page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 let pockets=[],entries=[],lastEntry=null,imageBytes=null;
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,method=req.method();
  let result={ok:true};
  if(path.endsWith('/image')&&method==='PUT'){imageBytes=req.postDataBuffer();assert.equal(imageBytes[0],255);assert.equal(imageBytes[1],216);pockets[0].image='test-image';}
  else if(path.endsWith('/image')&&method==='GET'){await route.fulfill({contentType:'image/jpeg',body:imageBytes});return;}
  else if(path==='/api/finance'&&method==='GET')result={pockets,entries,hasPasskey:false};
  else if(path==='/api/finance/pockets'&&method==='POST'){
    const data=req.postDataJSON(),id='test-pocket-123';pockets.push({...data,id,balance:data.initial,nextIndex:0,cycle:'2026-11',createdAt:new Date().toISOString()});result={id};
  }else if(path.endsWith('/entry')){
    lastEntry=req.postDataJSON();const p=pockets[0];if(lastEntry.type==='deposit')p.balance+=lastEntry.amount;if(lastEntry.type==='withdraw')p.balance-=lastEntry.amount;if(lastEntry.scheduled)p.nextIndex++;entries.unshift({...lastEntry,pocketId:p.id,createdAt:new Date().toISOString()});
  }else if(path.endsWith('/test-pocket-123')&&method==='PATCH')Object.assign(pockets[0],req.postDataJSON());
  else if(path.endsWith('/test-pocket-123')&&method==='DELETE'){pockets=[];entries=[];}
  await route.fulfill({json:result});
 });
 await page.goto('http://localhost:8889',{waitUntil:'domcontentloaded'});
 await page.getByPlaceholder('¿Cómo te llamas?').fill('Lucía');await page.getByRole('button',{name:'Comenzar',exact:true}).click();
 await page.locator('nav').getByRole('button',{name:'Finanzas'}).click();
 await page.getByRole('heading',{name:'Desbloquea tus finanzas'}).waitFor();
 assert(await page.getByRole('button',{name:'Ingresar con contraseña'}).isVisible());
 assert(await page.getByRole('button',{name:'Acceder con huella o teléfono'}).isVisible());
 await page.evaluate(()=>{Finance.unlocked=true;Finance.error='Prueba';render()});
 await page.getByRole('button',{name:'Reintentar',exact:true}).click();
 await page.getByRole('heading',{name:'Aquí empieza tu próximo propósito'}).waitFor();
 await page.getByRole('button',{name:'Crear un bolsillo',exact:true}).click();
 await page.getByLabel('Nombre',{exact:true}).fill('Computador para estudiar');
 await page.getByLabel('Descripción de tu propósito').fill('Quiero un computador para mis estudios. '.repeat(30));
 await page.locator('input[name=image]').setInputFiles('public/icons/icon-192.png');
 const past=new Date();past.setUTCDate(10);past.setUTCMonth(past.getUTCMonth()-2);await page.locator('input[name=firstDate]').fill(past.toISOString().slice(0,10));
 await page.getByLabel('Precio o presupuesto (COP)').fill('1000000');await page.getByLabel('Valor de cada abono (COP)').fill('200000');
 assert((await page.locator('#pocket-estimate').textContent()).includes('5 abonos'));
 await page.locator('form').getByRole('button',{name:'Crear bolsillo',exact:true}).click();
 await page.getByRole('heading',{name:'Computador para estudiar',exact:true}).waitFor();
 assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'0');assert(imageBytes?.length>0);assert(await page.getByRole('img',{name:'Inspiración para Computador para estudiar'}).isVisible());
 await page.getByRole('button',{name:'Todavía no',exact:true}).click();await page.getByRole('button',{name:'Dejar pendiente',exact:true}).click();
 assert.equal(pockets[0].balance,0);
 await page.getByRole('button',{name:'Sí, ya aboné',exact:false}).click();
 await page.getByLabel('Sí, ya hice este abono en mi banco.').check();
 await page.getByRole('button',{name:'Guardar abono confirmado'}).click();
 await page.waitForFunction(()=>Finance.pockets[0]?.balance===200000);
 assert.equal(lastEntry.scheduled,true);assert.equal(lastEntry.amount,200000);
 await page.getByRole('button',{name:'Todavía no',exact:true}).click();await page.getByRole('button',{name:'Omitir esta cuota y pasar a la siguiente'}).click();
 await page.waitForFunction(()=>Finance.pockets[0]?.nextIndex===2);assert.equal(lastEntry.type,'skip');assert.equal(pockets[0].balance,200000);
 assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'20');
 assert(!(await page.evaluate(()=>JSON.parse(localStorage.getItem('glowlife_v1')).pockets.length)));
 await page.getByRole('button',{name:'Abono o retiro',exact:true}).click();await page.locator('select[name=type]').selectOption('withdraw');
 await page.getByLabel('Monto (COP)').fill('50000');await page.getByRole('button',{name:'Confirmar registro',exact:true}).click();
 await page.waitForFunction(()=>Finance.pockets[0]?.balance===150000);
 assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'),'15');
 await page.getByRole('button',{name:'Editar',exact:true}).click();await page.getByLabel('Precio o presupuesto (COP)').fill('1200000');await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
 await page.waitForFunction(()=>Finance.pockets[0]?.target===1200000);
 await page.getByRole('button',{name:'Gastos del hogar',exact:true}).click();await page.getByRole('heading',{name:'Sin bolsillos en esta categoría'}).waitFor();
 await page.getByRole('button',{name:'Todos',exact:true}).click();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 assert.notEqual(await page.locator('.finance-total').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 255, 255)');
 await page.screenshot({path:'/tmp/glowlife-finance-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'Nuevo bolsillo',exact:false}).click();
 await page.getByLabel('Nombre',{exact:true}).fill('Servicios de casa');await page.locator('#pocket-kind').selectOption('household');assert((await page.locator('#pocket-category').textContent()).includes('Servicios públicos'));
 await page.getByLabel('Precio o presupuesto (COP)').fill('500000');await page.getByLabel('Valor de cada abono (COP)').fill('50000');
 assert((await page.locator('#pocket-estimate').textContent()).includes('450.000'));await page.getByRole('button',{name:'Cerrar',exact:true}).click();
 await page.setViewportSize({width:1280,height:900});await page.emulateMedia({colorScheme:'dark'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 await page.getByRole('button',{name:'Bloquear',exact:false}).click();await page.getByRole('heading',{name:'Desbloquea tus finanzas'}).waitFor();
 assert.equal(await page.getByRole('progressbar').count(),0);
 assert.deepEqual(errors,[]);
 console.log('Navegador móvil: acceso protegido, estado vacío, creación, estimación, confirmación manual, retiro, edición, filtros, bloqueo y privacidad local verificados con API simulada.');
} finally {await browser.close()}
