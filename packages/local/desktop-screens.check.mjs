import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtemp,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
const {_electron}=createRequire(new URL('../canvas/package.json',import.meta.url))('@playwright/test')
const origin=process.env.CIVIC_TEST_ORIGIN
assert(origin)
const store=await mkdtemp(join(tmpdir(),'civic-screens-'))
const env={...process.env,CIVIC_LOCAL_STORE:store,CIVIC_DESKTOP_ORIGIN:origin+'/review?scenario=legacy.home-one'}
delete env.ELECTRON_RUN_AS_NODE
const app=await _electron.launch({executablePath:env.CIVIC_ELECTRON_BINARY,args:[fileURLToPath(new URL('desktop.mjs',import.meta.url))],env})
const budget=setTimeout(()=>app.process().kill('SIGKILL'),120000)
try {
  const page=await app.firstWindow()
  const errors=[]
  page.on('pageerror',error=>{errors.push(error.message);console.log('PAGE_ERROR',error.message)})
  page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())})
  page.on('response',r=>{if(r.status()>=500)console.log('FAILED',r.status(),r.url())})
  await page.getByLabel('Entire application canvas',{exact:true}).waitFor()
  const index=await(await page.request.get(origin+'/api/review/index')).json()
  const scenario=index.scenarios.find(row=>row.id==='legacy.home-one')
  assert(scenario,'Laundry Home one scenario')
  await page.goto(`${origin}/review?desktop=darwin&scenario=${scenario.id}`)
  const card=page.getByRole('button',{name:/View Home one snapshot/i})
  await card.locator('img').waitFor({timeout:60000}).catch(async error=>{console.log('BODY',await page.locator('body').innerText());await page.screenshot({path:join(store,'failure.png')});throw error})
  const geometry=await card.evaluate(button=>{
    const box=el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return{tag:el.tagName,className:el.className,x:r.x,y:r.y,width:r.width,height:r.height,padding:s.padding,minHeight:s.minHeight,scrollWidth:el.scrollWidth}}
    return {button:box(button),picture:box(button.querySelector('.rh-fixture-picture')),image:box(button.querySelector('img')),natural:[button.querySelector('img').naturalWidth,button.querySelector('img').naturalHeight],flow:box(button.closest('.app-flow'))}
  })
  const client=await page.context().newCDPSession(page)
  const trees=[]
  client.on('LayerTree.layerTreeDidChange',event=>trees.push(event.layers?.map(({layerId,width,height,drawsContent})=>({layerId,width,height,drawsContent}))))
  await client.send('LayerTree.enable')
  const measure=()=>page.evaluate(async()=>{
    const canvas=document.querySelector('.rh-canvas'),scene=document.querySelector('.app-scene'),r=canvas.getBoundingClientRect()
    const frames=[],long=[],changes=[];let last
    const observer=new PerformanceObserver(list=>long.push(...list.getEntries().map(e=>e.duration)));observer.observe({type:'longtask'})
    const mutations=new MutationObserver(list=>changes.push(...list.filter(r=>r.target instanceof HTMLImageElement).map(r=>r.attributeName)))
    mutations.observe(scene,{subtree:true,childList:true,attributes:true,attributeFilter:['src']})
    for(let i=0;i<180;i++){
      const now=await new Promise(requestAnimationFrame);if(last)frames.push(now-last);last=now
      canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,ctrlKey:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,deltaY:i%60<30?-8:8}))
    }
    observer.disconnect();mutations.disconnect();frames.sort((a,b)=>a-b)
    return{p95:frames[Math.floor(frames.length*.95)],max:frames.at(-1),longTasks:long,imageChanges:changes.length,willChange:getComputedStyle(scene).willChange}
  })
  const motion=await measure()
  const baselineLayers=trees.at(-1)
  await page.waitForFunction(()=>!document.querySelector('.rh-canvas.is-navigating'))
  const optimized=await measure()
  const optimizedLayers=trees.at(-1)
  await page.waitForFunction(()=>!document.querySelector('.rh-canvas.is-navigating'))
  await page.screenshot({path:join(store,'screen.png')})
  const camera=await page.locator('.app-scene').evaluate(e=>({willChange:getComputedStyle(e).willChange,transform:getComputedStyle(e).transform}))
  await app.evaluate(({BaseWindow})=>BaseWindow.getAllWindows()[0].setSize(393,852))
  await page.goto(`${origin}/review-frame.html?desktop=darwin&scenario=${scenario.id}`)
  await page.locator('h1').waitFor()
  const frame=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],elements:['body','#review-root','main','.app-main','h1'].map(q=>{const e=document.querySelector(q);if(!e)return{selector:q};const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{selector:q,className:e.className,width:r.width,x:r.x,padding:s.padding,scrollWidth:e.scrollWidth}}),ancestors:(()=>{const rows=[];for(let e=document.querySelector('h1');e;e=e.parentElement){let r=e.getBoundingClientRect(),s=getComputedStyle(e);rows.push({tag:e.tagName,className:e.className,width:r.width,x:r.x,padding:s.padding})}return rows})()}))
  await page.screenshot({path:join(store,'frame.png')})
  const result={geometry,motion,optimized,camera,layerChanges:trees.length,layerSamples:[baselineLayers,optimizedLayers],frame,errors,store}
  await writeFile(join(store,'result.json'),JSON.stringify(result,null,2))
  assert(Math.abs(geometry.button.height/geometry.button.width-852/393)<.01,'Snapshot retains the actual viewport aspect ratio')
  assert.equal(motion.imageChanges,0,'Images do not swap during camera motion')
  assert.equal(optimized.imageChanges,0)
  assert.equal(camera.willChange,'auto','Gesture completion does not tear down a promoted world layer')
  assert(optimized.p95<25,`Warm navigation frame interval: ${optimized.p95}`)
  assert(optimizedLayers.filter(layer=>layer.drawsContent).every(layer=>layer.width*layer.height<250_000_000),'Compositor never promotes the entire world')
  assert.equal(frame.elements.find(e=>e.selector==='body').scrollWidth,393)
  assert.equal(frame.elements.find(e=>e.selector==='h1').x,16,'Native AppShell supplies the page gutter')
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({motion,optimized,viewport:frame.viewport,store},null,2))
} finally {
  await Promise.race([app.evaluate(({app})=>app.exit(0)).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,2000))])
  app.process().kill('SIGKILL');clearTimeout(budget)
}
