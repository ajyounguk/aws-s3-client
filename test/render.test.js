const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const request = require('supertest')
const { CreateBucketCommand, ListBucketsCommand } = require('@aws-sdk/client-s3')
const { makeApp, meta, awsError } = require('./helpers')
const { VIEWS } = require('../controllers/s3Controller')

const XSS = '"><script>alert(1)</script><img src=x onerror=alert(2)>'

describe('page rendering', () => {
    test('escapes user input in form values and the response panel (XSS)', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(CreateBucketCommand).rejects(awsError('InvalidBucketName', 400, `The specified bucket is not valid: ${XSS}`, { BucketName: XSS }))
        await request(app).post('/bucket').type('form').send({ bucketname: XSS })
        for (const view of VIEWS.map(v => v.id)) {
            const res = await request(app).get('/?view=' + view)
            assert.doesNotMatch(res.text, /<script>alert/, view)
            assert.doesNotMatch(res.text, /<img src=x/, view)
        }
        const page = await request(app).get('/?view=create')
        assert.match(page.text, /value="&#34;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
        assert.match(page.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
    })

    test('escapes data returned by AWS', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(ListBucketsCommand).resolves({ $metadata: meta(200, '<b>req</b>'), Buckets: [{ Name: XSS }] })
        const res = await request(app).get('/bucket')
        assert.doesNotMatch(res.text, /<script>alert|<img src=x|<b>req<\/b>/)
        assert.match(res.text, /&lt;b&gt;req&lt;\/b&gt;/)
    })

    test('no inline scripts or event handlers (CSP-friendly)', async () => {
        const { app } = makeApp()
        const res = await request(app).get('/')
        assert.doesNotMatch(res.text, /<script>(?!\s*<\/script>)/)
        assert.doesNotMatch(res.text, /\son[a-z]+=/i)
        assert.match(res.headers['content-security-policy'], /default-src 'self'/)
        assert.equal(res.headers['x-frame-options'], 'DENY')
        assert.equal(res.headers['x-powered-by'], undefined)
    })

    test('every view renders valid-ish HTML with unique ids and one h1', async () => {
        const { app } = makeApp()
        for (const { id } of VIEWS) {
            const res = await request(app).get('/?view=' + id)
            assert.equal(res.status, 200)
            assert.match(res.text, /^<!DOCTYPE html>/)
            assert.equal((res.text.match(/<body/g) || []).length, 1, id)
            assert.equal((res.text.match(/<h1\b/g) || []).length, 1, id)
            const ids = [...res.text.matchAll(/\sid="([^"]+)"/g)].map(m => m[1])
            assert.deepEqual(ids, [...new Set(ids)], `duplicate ids in ${id}`)
            for (const m of res.text.matchAll(/<label for="([^"]+)"/g)) {
                assert.ok(ids.includes(m[1]), `label for missing #${m[1]} in ${id}`)
            }
        }
    })

    test('sidebar lists every view and marks the active one', async () => {
        const { app } = makeApp()
        const res = await request(app).get('/?view=objects')
        for (const v of VIEWS) assert.match(res.text, new RegExp(`href="/\\?view=${v.id}"`))
        assert.match(res.text, /class="nav-link active"\s+href="\/\?view=objects" aria-current="page"/)
        assert.equal((res.text.match(/aria-current="page"/g) || []).length, 1)
    })

    test('destructive actions use red buttons and confirm dialogs', async () => {
        const { app } = makeApp()
        for (const view of ['delete-object', 'delete-bucket']) {
            const res = await request(app).get('/?view=' + view)
            assert.match(res.text, /class="btn btn-danger"/)
            assert.match(res.text, /<form method="POST" action="[^"]+" data-confirm="Delete/)
        }
        const safe = await request(app).get('/?view=create')
        assert.doesNotMatch(safe.text, /btn-danger|data-confirm/)
    })

    test('upload view lists sample files', async () => {
        const { app } = makeApp()
        const res = await request(app).get('/?view=upload')
        assert.match(res.text, /<option value="hello.txt">/)
    })

    describe('environment badge', () => {
        for (const [kind, label, endpoint] of [
            ['aws', 'AWS', null],
            ['local', 'Local', 'http://localhost:4566'],
            ['custom', 'Custom endpoint', 'https://minio.example.com']
        ]) {
            test(`${kind}: ${label}`, async () => {
                const { app } = makeApp({ region: 'eu-west-2', environment: { kind, endpoint } })
                const res = await request(app).get('/')
                assert.match(res.text, new RegExp(`<div class="env env-${kind}" title="${endpoint ? 'Endpoint: ' + endpoint : 'Default AWS endpoints'}">`))
                assert.match(res.text, new RegExp(`<span class="env-kind">${label}</span>`))
                assert.match(res.text, /<span class="env-region">eu-west-2<\/span>/)
            })
        }
    })

    test('serves the stylesheet and client script', async () => {
        const { app } = makeApp()
        const css = await request(app).get('/assets/styles.css')
        assert.equal(css.status, 200)
        assert.match(css.text, /prefers-color-scheme: dark/)
        const js = await request(app).get('/assets/app.js')
        assert.equal(js.status, 200)
        assert.doesNotMatch(js.text, /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write/)
    })
})
