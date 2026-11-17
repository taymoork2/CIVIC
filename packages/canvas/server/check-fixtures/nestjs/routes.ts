/* oxlint-disable eslint/max-classes-per-file -- One fixture exercises several controller forms. */
import { Controller as Resource, Get as Read, Post, Put, Patch, Delete, Options, Head, All } from '@nestjs/common'
import { Get } from 'another-package'

@Resource({ path: '/cats/' })
export class Cats {
  @Read(':id') find() { return this }
  @Post() create() { return this }
  @Put(':id') replace() { return this }
  @Patch(':id') update() { return this }
  @Delete(':id') remove() { return this }
  @Options() options() { return this }
  @Head() head() { return this }
  @All('health') health() { return this }
  @Read(dynamic) dynamic() { return this }
  @Get('false') unrelated() { return this }
}
@Resource()
export class Root { @Read() index() { return this } }
@Resource(prefix)
export class Dynamic { @Read('skip') skip() { return this } }
// @Resource('fake') class Fake { @Read() fake() {} }
