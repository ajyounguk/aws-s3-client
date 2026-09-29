const { test, describe } = require('node:test')
const assert = require('node:assert/strict')
const request = require('supertest')
const {
    CreateBucketCommand,
    DeleteBucketCommand,
    DeleteObjectCommand,
    ListBucketsCommand,
    ListObjectsV2Command,
    PutObjectCommand
} = require('@aws-sdk/client-s3')
const fs = require('node:fs')
const path = require('node:path')
const { makeApp, meta, awsError, responseJson, statusBadge, SAMPLES_DIR } = require('./helpers')

// read rather than hard-code: git may check fixtures out with CRLF on Windows
const HELLO = fs.readFileSync(path.join(SAMPLES_DIR, 'hello.txt'))

// POST, follow the 303, and return the rendered page
async function postAndFollow(app, url, form) {
    const agent = request(app)
    const res = await agent.post(url).type('form').send(form)
    assert.equal(res.status, 303, `expected 303 from ${url}, got ${res.status}`)
    const page = await request(app).get(res.headers.location)
    assert.equal(page.status, 200)
    return { location: res.headers.location, page, json: responseJson(page.text), badge: statusBadge(page.text) }
}

describe('GET /', () => {
    test('renders the create view by default with no response', async () => {
        const { app } = makeApp()
        const res = await request(app).get('/')
        assert.equal(res.status, 200)
        assert.match(res.headers['content-type'], /text\/html/)
        assert.match(res.text, /<h1 id="form-title">Create Bucket<\/h1>/)
        assert.match(res.text, /Nothing yet/)
    })

    test('ignores unknown views', async () => {
        const { app } = makeApp()
        const res = await request(app).get('/?view=../../etc')
        assert.equal(res.status, 200)
        assert.match(res.text, /Create Bucket<\/h1>/)
    })

    test('reset clears results and pre-fills', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(CreateBucketCommand).resolves({ $metadata: meta(200), Location: '/b' })
        await postAndFollow(app, '/bucket', { bucketname: 'keep-me' })
        const res = await request(app).post('/reset')
        assert.equal(res.status, 303)
        assert.equal(res.headers.location, '/')
        const page = await request(app).get('/?view=create')
        assert.doesNotMatch(page.text, /keep-me/)
        assert.match(page.text, /Nothing yet/)
    })
})

describe('POST /bucket (create)', () => {
    test('success: 303 to create view, shows result without $metadata', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(CreateBucketCommand).resolves({ $metadata: meta(200, 'CREATE-REQ'), Location: 'http://demo.s3.amazonaws.com/' })
        const { location, page, json, badge } = await postAndFollow(app, '/bucket', { bucketname: 'demo' })
        assert.equal(location, '/?view=create')
        assert.deepEqual(json, { Location: 'http://demo.s3.amazonaws.com/' })
        assert.equal(badge.cls, 'status-ok')
        assert.equal(badge.text, '200 OK')
        assert.match(page.text, /CREATE-REQ/)
        assert.match(page.text, /value="demo"/)
    })

    test('sends a LocationConstraint outside us-east-1', async () => {
        const { app, s3Mock } = makeApp({ region: 'eu-west-2' })
        s3Mock.on(CreateBucketCommand).resolves({ $metadata: meta(200) })
        await postAndFollow(app, '/bucket', { bucketname: 'demo' })
        assert.deepEqual(s3Mock.commandCalls(CreateBucketCommand)[0].args[0].input, {
            Bucket: 'demo',
            CreateBucketConfiguration: { LocationConstraint: 'eu-west-2' }
        })
    })

    test('omits LocationConstraint in us-east-1', async () => {
        const { app, s3Mock } = makeApp({ region: 'us-east-1' })
        s3Mock.on(CreateBucketCommand).resolves({ $metadata: meta(200) })
        await postAndFollow(app, '/bucket', { bucketname: 'demo' })
        assert.deepEqual(s3Mock.commandCalls(CreateBucketCommand)[0].args[0].input, { Bucket: 'demo' })
    })

    test('AWS error: shows real status, name, message and request IDs', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(CreateBucketCommand).rejects(awsError('BucketAlreadyExists', 409, 'The requested bucket name is not available.'))
        const { page, json, badge } = await postAndFollow(app, '/bucket', { bucketname: 'taken' })
        assert.equal(badge.cls, 'status-err')
        assert.equal(badge.text, '409 BucketAlreadyExists')
        assert.equal(json.name, 'BucketAlreadyExists')
        assert.equal(json.message, 'The requested bucket name is not available.')
        assert.equal(json.fault, 'client')
        assert.match(page.text, /ERR-REQ-789/)
        assert.match(page.text, /EXT-456/)
    })

    test('validation: empty name never calls AWS', async () => {
        const { app, s3Mock } = makeApp()
        const { json, badge } = await postAndFollow(app, '/bucket', { bucketname: '   ' })
        assert.equal(badge.text, '400 ValidationError')
        assert.equal(json.message, 'Bucket name is required')
        assert.equal(s3Mock.calls().length, 0)
    })
})

describe('GET /bucket (list buckets)', () => {
    test('follows pagination and aggregates buckets', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(ListBucketsCommand)
            .resolvesOnce({ $metadata: meta(200, 'P1'), Buckets: [{ Name: 'alpha' }], Owner: { ID: 'owner-id' }, ContinuationToken: 'next' })
            .resolvesOnce({ $metadata: meta(200, 'P2'), Buckets: [{ Name: 'beta' }] })
        const res = await request(app).get('/bucket')
        assert.equal(res.status, 200)
        const json = responseJson(res.text)
        assert.deepEqual(json.Buckets.map(b => b.Name), ['alpha', 'beta'])
        assert.deepEqual(json.Owner, { ID: 'owner-id' })
        assert.equal(json.$metadata, undefined)
        assert.equal(s3Mock.commandCalls(ListBucketsCommand).length, 2)
        assert.equal(s3Mock.commandCalls(ListBucketsCommand)[1].args[0].input.ContinuationToken, 'next')
        assert.match(res.text, /P2/)
    })

    test('pre-fills the first bucket only when nothing is pre-filled', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(ListBucketsCommand).resolves({ $metadata: meta(200), Buckets: [{ Name: 'first' }, { Name: 'second' }] })
        await request(app).get('/bucket')
        let page = await request(app).get('/?view=create')
        assert.match(page.text, /value="first"/)

        // an existing pre-fill is kept (the old code wiped it)
        s3Mock.on(CreateBucketCommand).resolves({ $metadata: meta(200) })
        await request(app).post('/bucket').type('form').send({ bucketname: 'mine' })
        await request(app).get('/bucket')
        page = await request(app).get('/?view=create')
        assert.match(page.text, /value="mine"/)
    })

    test('AWS error returns the AWS status code', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(ListBucketsCommand).rejects(awsError('AccessDenied', 403, 'Access Denied'))
        const res = await request(app).get('/bucket')
        assert.equal(res.status, 403)
        assert.equal(statusBadge(res.text).text, '403 AccessDenied')
    })

    test('non-AWS error (no $metadata) is a 500 with name and message', async () => {
        const { app, s3Mock } = makeApp()
        const err = new Error('Could not load credentials from any providers')
        err.name = 'CredentialsProviderError'
        s3Mock.on(ListBucketsCommand).rejects(err)
        const res = await request(app).get('/bucket')
        assert.equal(res.status, 500)
        const json = responseJson(res.text)
        assert.deepEqual(json, { name: 'CredentialsProviderError', message: 'Could not load credentials from any providers' })
        assert.match(res.text, /No AWS request ID/)
    })

    test('drops signature details from SignatureDoesNotMatch errors', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(ListBucketsCommand).rejects(awsError('SignatureDoesNotMatch', 403, 'The request signature we calculated does not match', {
            StringToSign: 'AWS4-HMAC-SHA256\nsecret-ish',
            CanonicalRequest: 'GET\n/\n',
            SignatureProvided: 'abcdef',
            AWSAccessKeyId: 'AKIDEXAMPLE',
            $response: { headers: { authorization: 'AWS4-HMAC-SHA256 Credential=...' } }
        }))
        const res = await request(app).get('/bucket')
        assert.equal(res.status, 403)
        assert.doesNotMatch(res.text, /StringToSign|CanonicalRequest|SignatureProvided|AKIDEXAMPLE|Credential=/)
        assert.deepEqual(Object.keys(responseJson(res.text)).sort(), ['fault', 'message', 'name'])
    })
})

describe('POST /bucket/file (upload)', () => {
    test('uploads a file from the samples folder', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(PutObjectCommand).resolves({ $metadata: meta(200, 'PUT-REQ'), ETag: '"abc"' })
        const { location, json, badge } = await postAndFollow(app, '/bucket/file', { bucketname: 'demo', filename: 'hello.txt' })
        assert.equal(location, '/?view=upload')
        assert.equal(badge.text, '200 OK')
        assert.deepEqual(json, { Bucket: 'demo', Key: 'hello.txt', Size: HELLO.length, ETag: '"abc"' })
        const input = s3Mock.commandCalls(PutObjectCommand)[0].args[0].input
        assert.equal(input.Key, 'hello.txt')
        assert.equal(input.ContentType, 'text/plain')
        assert.equal(input.Body.toString(), 'hello from the sample folder\n')
    })

    test('nested sample files use the base name as the key', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(PutObjectCommand).resolves({ $metadata: meta(200) })
        await postAndFollow(app, '/bucket/file', { bucketname: 'demo', filename: 'subdir/nested.txt' })
        assert.equal(s3Mock.commandCalls(PutObjectCommand)[0].args[0].input.Key, 'nested.txt')
    })

    for (const filename of ['../../app.js', '../helpers.js', '/etc/passwd', 'C:\\Windows\\win.ini', '..']) {
        test(`rejects path outside samples: ${filename}`, async () => {
            const { app, s3Mock } = makeApp()
            const { json, badge } = await postAndFollow(app, '/bucket/file', { bucketname: 'demo', filename })
            assert.equal(badge.text, '400 ValidationError')
            assert.match(json.message, /inside the samples folder/)
            assert.equal(s3Mock.calls().length, 0)
        })
    }

    test('missing file is a 404 and never calls AWS', async () => {
        const { app, s3Mock } = makeApp()
        const { json, badge } = await postAndFollow(app, '/bucket/file', { bucketname: 'demo', filename: 'nope.jpg' })
        assert.equal(badge.text, '404 FileNotFound')
        assert.match(json.message, /nope\.jpg/)
        assert.equal(s3Mock.calls().length, 0)
    })

    test('directory is a 404', async () => {
        const { app } = makeApp()
        const { badge } = await postAndFollow(app, '/bucket/file', { bucketname: 'demo', filename: 'subdir' })
        assert.equal(badge.text, '404 FileNotFound')
    })

    test('AWS error is shown with its status', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(PutObjectCommand).rejects(awsError('NoSuchBucket', 404, 'The specified bucket does not exist'))
        const { badge } = await postAndFollow(app, '/bucket/file', { bucketname: 'ghost', filename: 'hello.txt' })
        assert.equal(badge.text, '404 NoSuchBucket')
    })
})

describe('GET /bucket/objects (list objects)', () => {
    test('follows pagination with continuation tokens', async () => {
        const { app, s3Mock } = makeApp()
        const when = new Date('2026-01-02T03:04:05Z')
        s3Mock.on(ListObjectsV2Command)
            .resolvesOnce({ $metadata: meta(200), IsTruncated: true, NextContinuationToken: 'tok', Contents: [{ Key: 'a.txt', Size: 1, LastModified: when, ETag: '"x"', StorageClass: 'STANDARD' }] })
            .resolvesOnce({ $metadata: meta(200, 'LAST'), IsTruncated: false, Contents: [{ Key: 'b.txt', Size: 2, LastModified: when, StorageClass: 'STANDARD' }] })
        const res = await request(app).get('/bucket/objects').query({ bucketname: 'demo' })
        assert.equal(res.status, 200)
        const json = responseJson(res.text)
        assert.equal(json.Name, 'demo')
        assert.equal(json.KeyCount, 2)
        assert.deepEqual(json.Contents.map(o => o.Key), ['a.txt', 'b.txt'])
        assert.equal(json.Truncated, undefined)
        const calls = s3Mock.commandCalls(ListObjectsV2Command)
        assert.equal(calls.length, 2)
        assert.equal(calls[1].args[0].input.ContinuationToken, 'tok')
        assert.match(res.text, /LAST/)
    })

    test('empty bucket', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(ListObjectsV2Command).resolves({ $metadata: meta(200), KeyCount: 0 })
        const res = await request(app).get('/bucket/objects').query({ bucketname: 'demo' })
        assert.deepEqual(responseJson(res.text).Contents, [])
    })

    test('stops at the object cap and says so', async () => {
        const { app, s3Mock } = makeApp()
        const page = n => Array.from({ length: 1000 }, (_, i) => ({ Key: `k${n}-${i}` }))
        let n = 0
        s3Mock.on(ListObjectsV2Command).callsFake(() => ({ $metadata: meta(200), IsTruncated: true, NextContinuationToken: 't' + n, Contents: page(n++) }))
        const res = await request(app).get('/bucket/objects').query({ bucketname: 'huge' })
        const json = responseJson(res.text)
        assert.equal(json.KeyCount, 5000)
        assert.match(json.Truncated, /5000/)
        assert.ok(s3Mock.commandCalls(ListObjectsV2Command).length <= 6)
    })

    test('AWS error returns the AWS status code', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(ListObjectsV2Command).rejects(awsError('NoSuchBucket', 404, 'The specified bucket does not exist'))
        const res = await request(app).get('/bucket/objects').query({ bucketname: 'ghost' })
        assert.equal(res.status, 404)
        assert.equal(statusBadge(res.text).text, '404 NoSuchBucket')
    })

    test('missing bucket name is a 400', async () => {
        const { app, s3Mock } = makeApp()
        const res = await request(app).get('/bucket/objects')
        assert.equal(res.status, 400)
        assert.equal(s3Mock.calls().length, 0)
    })
})

describe('POST /bucket/file/delete (delete object)', () => {
    test('success', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(DeleteObjectCommand).resolves({ $metadata: meta(204, 'DEL-REQ') })
        const { location, json, badge, page } = await postAndFollow(app, '/bucket/file/delete', { bucketname: 'demo', key: 'a.txt' })
        assert.equal(location, '/?view=delete-object')
        assert.equal(badge.text, '204 No Content')
        assert.deepEqual(json, {})
        assert.match(page.text, /DEL-REQ/)
        assert.deepEqual(s3Mock.commandCalls(DeleteObjectCommand)[0].args[0].input, { Bucket: 'demo', Key: 'a.txt' })
    })

    test('AWS error', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(DeleteObjectCommand).rejects(awsError('AccessDenied', 403, 'Access Denied'))
        const { badge } = await postAndFollow(app, '/bucket/file/delete', { bucketname: 'demo', key: 'a.txt' })
        assert.equal(badge.text, '403 AccessDenied')
    })

    test('validation', async () => {
        const { app, s3Mock } = makeApp()
        const { badge } = await postAndFollow(app, '/bucket/file/delete', { bucketname: 'demo' })
        assert.equal(badge.text, '400 ValidationError')
        assert.equal(s3Mock.calls().length, 0)
    })
})

describe('POST /bucket/delete (delete bucket)', () => {
    test('success clears the bucket pre-fill', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(DeleteBucketCommand).resolves({ $metadata: meta(204) })
        const { badge, page } = await postAndFollow(app, '/bucket/delete', { bucketname: 'gone' })
        assert.equal(badge.text, '204 No Content')
        assert.match(page.text, /id="delbucket-bucket" type="text" name="bucketname" value=""/)
    })

    test('AWS error keeps the pre-fill', async () => {
        const { app, s3Mock } = makeApp()
        s3Mock.on(DeleteBucketCommand).rejects(awsError('BucketNotEmpty', 409, 'The bucket you tried to delete is not empty'))
        const { badge, json, page } = await postAndFollow(app, '/bucket/delete', { bucketname: 'full' })
        assert.equal(badge.text, '409 BucketNotEmpty')
        assert.equal(json.message, 'The bucket you tried to delete is not empty')
        assert.match(page.text, /value="full"/)
    })

    test('validation', async () => {
        const { app, s3Mock } = makeApp()
        const { badge } = await postAndFollow(app, '/bucket/delete', {})
        assert.equal(badge.text, '400 ValidationError')
        assert.equal(s3Mock.calls().length, 0)
    })
})

describe('POST /bucket/presign', () => {
    test('signs GET, PUT and DELETE URLs with the default expiry', async () => {
        const { app, s3Mock } = makeApp()
        const { json, badge, page } = await postAndFollow(app, '/bucket/presign', { bucketname: 'demo-bucket', key: 'cat.jpg' })
        assert.equal(badge.text, '200 OK')
        assert.equal(json.expiresInSeconds, 3600)
        for (const k of ['getURL', 'putURL', 'deleteURL']) {
            const url = new URL(json[k])
            assert.match(url.hostname, /demo-bucket\.s3\.eu-west-2\.amazonaws\.com/)
            assert.equal(url.pathname, '/cat.jpg')
            assert.equal(url.searchParams.get('X-Amz-Expires'), '3600')
            assert.ok(url.searchParams.get('X-Amz-Signature'))
        }
        assert.match(page.text, /No AWS request ID/)
        assert.equal(s3Mock.calls().length, 0)
    })

    test('custom expiry', async () => {
        const { app } = makeApp()
        const { json } = await postAndFollow(app, '/bucket/presign', { bucketname: 'demo-bucket', key: 'k', expires: '60' })
        assert.equal(new URL(json.getURL).searchParams.get('X-Amz-Expires'), '60')
    })

    for (const expires of ['0', '604801', 'abc', '1.5']) {
        test(`rejects expiry ${expires}`, async () => {
            const { app } = makeApp()
            const { badge, json } = await postAndFollow(app, '/bucket/presign', { bucketname: 'b', key: 'k', expires })
            assert.equal(badge.text, '400 ValidationError')
            assert.match(json.message, /604800/)
        })
    }

    test('validation', async () => {
        const { app } = makeApp()
        const { badge } = await postAndFollow(app, '/bucket/presign', { bucketname: 'b' })
        assert.equal(badge.text, '400 ValidationError')
    })
})

describe('request guard', () => {
    test('rejects cross-origin POSTs', async () => {
        const { app, s3Mock } = makeApp()
        const res = await request(app).post('/bucket/delete').set('Origin', 'https://evil.example.com').type('form').send({ bucketname: 'x' })
        assert.equal(res.status, 403)
        assert.equal(s3Mock.calls().length, 0)
    })

    test('rejects cross-origin Referer when there is no Origin', async () => {
        const { app } = makeApp()
        const res = await request(app).post('/bucket/delete').set('Referer', 'https://evil.example.com/page').type('form').send({ bucketname: 'x' })
        assert.equal(res.status, 403)
    })

    test('rejects opaque (null) origins', async () => {
        const { app } = makeApp()
        const res = await request(app).post('/reset').set('Origin', 'null')
        assert.equal(res.status, 403)
    })

    test('allows same-origin POSTs', async () => {
        const { app } = makeApp()
        const agent = request(app)
        const res = await agent.post('/reset').set('Host', '127.0.0.1:3000').set('Origin', 'http://127.0.0.1:3000')
        assert.equal(res.status, 303)
    })

    test('rejects non-loopback Host headers (DNS rebinding)', async () => {
        const { app } = makeApp()
        const res = await request(app).get('/').set('Host', 'rebind.example.com:3000')
        assert.equal(res.status, 403)
    })

    test('accepts localhost and [::1]', async () => {
        const { app } = makeApp()
        assert.equal((await request(app).get('/').set('Host', 'localhost:3000')).status, 200)
        assert.equal((await request(app).get('/').set('Host', '[::1]:3000')).status, 200)
    })
})
