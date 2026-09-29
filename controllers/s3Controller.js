// AWS S3 Client Controller
const fs = require('node:fs/promises')
const path = require('node:path')
const { STATUS_CODES } = require('node:http')
const express = require('express')
const {
    CreateBucketCommand,
    DeleteBucketCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    PutObjectCommand,
    paginateListBuckets,
    paginateListObjectsV2
} = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { successResult, errorResult, localError } = require('../lib/results')

// sidebar entries, in display order
const VIEWS = [
    { id: 'create', label: 'Create Bucket' },
    { id: 'list', label: 'List Buckets' },
    { id: 'upload', label: 'Upload Object' },
    { id: 'objects', label: 'List Objects' },
    { id: 'delete-object', label: 'Delete Object', destructive: true },
    { id: 'delete-bucket', label: 'Delete Bucket', destructive: true },
    { id: 'presign', label: 'Presigned URLs' }
]
const VIEW_IDS = new Set(VIEWS.map(v => v.id))

const MAX_LISTED_OBJECTS = 5000
const DEFAULT_PRESIGN_SECONDS = 3600
const MAX_PRESIGN_SECONDS = 7 * 24 * 3600 // SigV4 limit

const CONTENT_TYPES = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
    '.txt': 'text/plain', '.json': 'application/json', '.html': 'text/html', '.pdf': 'application/pdf'
}

function initialState() {
    return {
        form: { bucket: '', file: 'cat.jpg', key: 'cat.jpg', expires: DEFAULT_PRESIGN_SECONDS },
        results: {},
        lastView: 'create'
    }
}

module.exports = function s3Controller({ s3, samplesDir, getEnvironment }) {
    const router = express.Router()
    let state = initialState()

    const field = (req, name) => (typeof req.body?.[name] === 'string' ? req.body[name].trim() : '')

    async function listSamples() {
        try {
            const entries = await fs.readdir(samplesDir, { withFileTypes: true })
            return entries.filter(e => e.isFile() && !e.name.startsWith('.')).map(e => e.name).sort()
        } catch {
            return []
        }
    }

    async function render(req, res, view, status = 200) {
        res.status(status).render('index', {
            view,
            views: VIEWS,
            form: state.form,
            result: state.results[view] || null,
            env: await getEnvironment(),
            samples: await listSamples(),
            statusText: code => STATUS_CODES[code]
        })
    }

    function store(view, result) {
        state.results[view] = result
        state.lastView = view
    }

    // post/redirect/get: store the result, then send the browser back to the page
    function redirectTo(res, view) {
        res.redirect(303, '/?view=' + encodeURIComponent(view))
    }

    // run an SDK call, turning any failure into a displayable result
    async function attempt(view, fn) {
        try {
            return await fn()
        } catch (err) {
            return errorResult(view, err)
        }
    }

    // main page
    router.get('/', async (req, res) => {
        const view = VIEW_IDS.has(req.query.view) ? req.query.view : state.lastView
        await render(req, res, view)
    })

    router.post('/reset', (req, res) => {
        state = initialState()
        res.redirect(303, '/')
    })

    // 1. Create Bucket
    router.post('/bucket', async (req, res) => {
        const bucket = field(req, 'bucketname')
        state.form.bucket = bucket
        const result = !bucket
            ? localError('create', 400, 'ValidationError', 'Bucket name is required')
            : await attempt('create', async () => {
                const params = { Bucket: bucket }
                // outside us-east-1 S3 needs an explicit location constraint (SDK v2 added it for you, v3 doesn't)
                const region = await s3.config.region()
                if (region && region !== 'us-east-1') {
                    params.CreateBucketConfiguration = { LocationConstraint: region }
                }
                return successResult('create', await s3.send(new CreateBucketCommand(params)))
            })
        store('create', result)
        redirectTo(res, 'create')
    })

    // 2. List Buckets (all pages)
    router.get('/bucket', async (req, res) => {
        const result = await attempt('list', async () => {
            const buckets = []
            let owner, last
            for await (const page of paginateListBuckets({ client: s3 }, {})) {
                buckets.push(...(page.Buckets || []))
                owner = owner || page.Owner
                last = page
            }
            if (!state.form.bucket && buckets.length) state.form.bucket = buckets[0].Name
            return successResult('list', { $metadata: last && last.$metadata, Buckets: buckets, Owner: owner })
        })
        store('list', result)
        await render(req, res, 'list', result.status)
    })

    // 3. Upload a file from the samples folder
    router.post('/bucket/file', async (req, res) => {
        const bucket = field(req, 'bucketname')
        const file = field(req, 'filename')
        state.form.bucket = bucket
        state.form.file = file

        let result
        const root = path.resolve(samplesDir)
        const full = path.resolve(root, file)
        if (!bucket || !file) {
            result = localError('upload', 400, 'ValidationError', 'Bucket name and file name are required')
        } else if (!full.startsWith(root + path.sep)) {
            result = localError('upload', 400, 'ValidationError', 'File must be inside the samples folder')
        } else {
            result = await attempt('upload', async () => {
                let body
                try {
                    body = await fs.readFile(full)
                } catch (err) {
                    if (err.code === 'ENOENT' || err.code === 'EISDIR') {
                        return localError('upload', 404, 'FileNotFound', `No file named "${file}" in the samples folder`)
                    }
                    throw err
                }
                const key = path.basename(full)
                const out = await s3.send(new PutObjectCommand({
                    Bucket: bucket,
                    Key: key,
                    Body: body,
                    ContentType: CONTENT_TYPES[path.extname(key).toLowerCase()] || 'application/octet-stream'
                }))
                state.form.key = key
                return successResult('upload', { Bucket: bucket, Key: key, Size: body.length, ...out })
            })
        }
        store('upload', result)
        redirectTo(res, 'upload')
    })

    // 4. List Objects in Bucket (all pages, capped)
    router.get('/bucket/objects', async (req, res) => {
        const bucket = typeof req.query.bucketname === 'string' ? req.query.bucketname.trim() : ''
        if (bucket) state.form.bucket = bucket
        const result = !bucket
            ? localError('objects', 400, 'ValidationError', 'Bucket name is required')
            : await attempt('objects', async () => {
                const contents = []
                let last, truncated = false
                for await (const page of paginateListObjectsV2({ client: s3, pageSize: 1000 }, { Bucket: bucket })) {
                    last = page
                    for (const obj of page.Contents || []) {
                        if (contents.length >= MAX_LISTED_OBJECTS) { truncated = true; break }
                        contents.push({ Key: obj.Key, Size: obj.Size, LastModified: obj.LastModified, StorageClass: obj.StorageClass })
                    }
                    if (truncated) break
                }
                return successResult('objects', {
                    $metadata: last && last.$metadata,
                    Name: bucket,
                    KeyCount: contents.length,
                    ...(truncated && { Truncated: `Stopped after ${MAX_LISTED_OBJECTS} objects` }),
                    Contents: contents
                })
            })
        store('objects', result)
        await render(req, res, 'objects', result.status)
    })

    // 5. Delete object
    router.post('/bucket/file/delete', async (req, res) => {
        const bucket = field(req, 'bucketname')
        const key = field(req, 'key')
        state.form.bucket = bucket
        state.form.key = key
        const result = !bucket || !key
            ? localError('delete-object', 400, 'ValidationError', 'Bucket name and object key are required')
            : await attempt('delete-object', async () =>
                successResult('delete-object', await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))))
        store('delete-object', result)
        redirectTo(res, 'delete-object')
    })

    // 6. Delete Bucket
    router.post('/bucket/delete', async (req, res) => {
        const bucket = field(req, 'bucketname')
        state.form.bucket = bucket
        const result = !bucket
            ? localError('delete-bucket', 400, 'ValidationError', 'Bucket name is required')
            : await attempt('delete-bucket', async () =>
                successResult('delete-bucket', await s3.send(new DeleteBucketCommand({ Bucket: bucket }))))
        // don't keep pre-filling a bucket that no longer exists
        if (result.ok) state.form.bucket = ''
        store('delete-bucket', result)
        redirectTo(res, 'delete-bucket')
    })

    // 7. Presigned URLs (signed locally, no AWS call)
    router.post('/bucket/presign', async (req, res) => {
        const bucket = field(req, 'bucketname')
        const key = field(req, 'key')
        const expiresRaw = field(req, 'expires')
        const expiresIn = expiresRaw === '' ? DEFAULT_PRESIGN_SECONDS : Number(expiresRaw)
        state.form.bucket = bucket
        state.form.key = key

        let result
        if (!bucket || !key) {
            result = localError('presign', 400, 'ValidationError', 'Bucket name and object key are required')
        } else if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > MAX_PRESIGN_SECONDS) {
            result = localError('presign', 400, 'ValidationError', `Expiry must be a whole number of seconds between 1 and ${MAX_PRESIGN_SECONDS}`)
        } else {
            state.form.expires = expiresIn
            result = await attempt('presign', async () => {
                const params = { Bucket: bucket, Key: key }
                const opts = { expiresIn }
                return successResult('presign', {
                    expiresInSeconds: expiresIn,
                    getURL: await getSignedUrl(s3, new GetObjectCommand(params), opts),
                    putURL: await getSignedUrl(s3, new PutObjectCommand(params), opts),
                    deleteURL: await getSignedUrl(s3, new DeleteObjectCommand(params), opts)
                }, 200)
            })
        }
        store('presign', result)
        redirectTo(res, 'presign')
    })

    return router
}

module.exports.VIEWS = VIEWS
