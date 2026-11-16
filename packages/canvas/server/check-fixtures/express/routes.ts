import express, { Router as makeRouter } from 'express'
import external from './external'

function handler() { return null }
const variable = '/computed'
const app = express()
const router = express.Router()
const nested = makeRouter()
const other = { get() { return null } }
other.get('/false', () => null)
app.use('/api', router)
router.use('/v1', nested)
router.get('/users/:id', handler)
nested.route('/items').post(() => null).delete(handler)
app.all('/health', handler)
app.get(variable, handler)
app.get(/regex/u, handler)
app.use('/external', external)
