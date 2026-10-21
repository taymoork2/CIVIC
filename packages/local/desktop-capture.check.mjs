import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtemp,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
const {_electron}=createRequire(new URL('../canvas/package.json',import.meta.url))('@playwright/test')
const origin=process.env.CIVIC_TEST_ORIGIN
assert(origin)
const store=await mkdtemp(join(tmpdir(),'civic-capture-'))
const env={...process.env,CIVIC_LOCAL_STORE:store,CIVIC_DESKTOP_ORIGIN:origin+'/review?scenario=legacy.home-one'}
delete env.ELECTRON_RUN_AS_NODE
const app=await _electron.launch({executablePath:env.CIVIC_ELECTRON_BINARY,args:[fileURLToPath(new URL('desktop.mjs',import.meta.url))],env})
const budget=setTimeout(()=>app.process().kill('SIGKILL'),120000)
try{
 const page=await app.firstWindow(),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.getByLabel('Entire application canvas',{exact:true}).waitFor({timeout:60000})
 await page.goto(origin+'/review?desktop=darwin&scenario=legacy.home-one')
 await page.getByRole('button',{name:'Capture 01 Home one screenshot',exact:true}).waitFor()
 await page.getByRole('button',{name:'Capture 01 Home one screenshot',exact:true}).click()
 const download=page.getByRole('link',{name:'Download PNG',exact:true})
 await download.waitFor({timeout:90000})
 const png=Buffer.from(await(await page.request.get(new URL(await download.getAttribute('href'),origin).href)).body())
 assert.equal(png.readUInt32BE(16),786);assert.equal(png.readUInt32BE(20),1704)
 await page.getByText('Set region with keyboard (%)',{exact:true}).click()
 const form=page.locator('.rh-review-panel form').first()
 await form.getByLabel('x',{exact:true}).fill('10')
 await form.getByLabel('y',{exact:true}).fill('10')
 await form.getByLabel('width',{exact:true}).fill('30')
 await form.getByLabel('height',{exact:true}).fill('20')
 await form.getByLabel('Annotation label',{exact:true}).fill('Care overview spacing')
 await form.getByLabel('What should change?',{exact:true}).fill('Capture acceptance: preserve this region and full-resolution evidence.')
 for(const width of [1440,390]){
  await app.evaluate(({BaseWindow},w)=>BaseWindow.getAllWindows()[0].setSize(w,900),width)
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.screenshot({path:join(store,`annotation-${width}.png`)})
 }
 await form.getByRole('button',{name:'Save review',exact:true}).click()
 await page.getByRole('heading',{name:'Captured review',exact:true}).waitFor()
 const saved=(await(await page.request.get(origin+'/api/review/feedback')).json()).at(-1)
 assert.equal(saved.anchor.x,.1);assert.equal(saved.anchor.width,.3)
 assert.equal(saved.context.screen,'legacy.home-one');assert.equal(saved.target.kind,'region')
 const evidence=Buffer.from(await(await page.request.get(origin+saved.screenshot)).body())
 assert.deepEqual(evidence,png,'Comment references the exact saved image without recapture')
 await page.goto(`${origin}/review?desktop=darwin&scenario=legacy.home-one&feedback=${saved.id}`)
 await page.locator('.rh-review-panel').waitFor()
 const retained=(await(await page.request.get(origin+'/api/review/feedback')).json()).find(row=>row.id===saved.id)
 assert.equal(retained.anchor.label,'Care overview spacing')
 assert.deepEqual(errors,[])
 await writeFile(join(store,'result.json'),JSON.stringify({dimensions:[786,1704],review:saved.id,anchor:saved.anchor,errors},null,2))
 console.log(`2× PNG, annotation, comment, reload persistence, desktop and 390px Electron passed. Evidence: ${store}`)
}finally{await Promise.race([app.evaluate(({app})=>app.exit(0)).catch(()=>{}),new Promise(r=>setTimeout(r,2000))]);app.process().kill('SIGKILL');clearTimeout(budget)}
