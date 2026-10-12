import { renderToStaticMarkup } from '@/test/markup'
import { expect, test } from 'vitest'

import { IssueNote, RecordList, RecordRow, StatusMark } from '@/kit/record-row'
import { assertPlainCopy } from '@/kit/test-copy'

test('a status mark always pairs its dot with words', () => {
  expect(renderToStaticMarkup(<StatusMark tone="conflict" />)).toContain("Can&#x27;t be used together")
  expect(renderToStaticMarkup(<StatusMark tone="confirm" />)).toContain('Needs confirmation')
  expect(renderToStaticMarkup(<StatusMark tone="ready">2 ready</StatusMark>)).toContain('2 ready')
})

test('a record row is one button that names the object, its fact, its status and what it opens', () => {
  const markup = renderToStaticMarkup(<RecordList heading="Clothes">
    <RecordRow media={<svg />} title="White cotton tee ×2" fact="White · Alex" mark={{ tone: 'confirm' }} label="White cotton tee, White, Needs confirmation. Opens garment record." onOpen={() => undefined} />
  </RecordList>)
  expect(markup).toContain('<h2')
  expect(markup).toContain('aria-label="White cotton tee, White, Needs confirmation. Opens garment record."')
  expect(markup.match(/<button/g)).toHaveLength(1)
  assertPlainCopy(markup)
})

test('a problem sits under its source with actions for that source only', () => {
  const markup = renderToStaticMarkup(<RecordRow media={<svg />} title="Tide" onOpen={() => undefined} issues={
    <IssueNote kind="conflict" title="Tide can't be used with White cotton tee" detail="Recorded: oxygen bleach. Tag: do not bleach." actions={[{ label: 'Use another detergent', onClick: () => undefined }, { label: 'Leave out', onClick: () => undefined }]} />
  } />)
  expect(markup).toContain('aria-label="Can&#x27;t be used together: Tide can&#x27;t be used with White cotton tee"')
  expect(markup.indexOf('Use another detergent')).toBeGreaterThan(markup.indexOf('Recorded: oxygen bleach'))
  // Row button plus the two issue actions; nothing offers an override.
  expect(markup.match(/<button/g)).toHaveLength(3)
  expect(markup.toLowerCase()).not.toContain('override')
})

test('quantity controls are separate native buttons beside the record target', () => {
  const markup = renderToStaticMarkup(<RecordRow title="White tee" label="Open White tee" onOpen={() => undefined} trailing={<><button aria-label="Fewer">−</button><span>2</span><button aria-label="More" disabled>+</button></>} />)
  const buttons = markup.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? []
  expect(buttons).toHaveLength(3)
  expect(buttons[0]).toContain('aria-label="Open White tee"')
  expect(buttons[0]).not.toContain('aria-label="Fewer"')
  expect(buttons[1]).toContain('aria-label="Fewer"')
  expect(buttons[2]).toContain('disabled')
})
