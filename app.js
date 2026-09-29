// AWS S3 API demo
const path = require('node:path')
const express = require('express')
const { S3Client } = require('@aws-sdk/client-s3')
const { loadAwsConfig } = require('./lib/config')
const s3Controller = require('./controllers/s3Controller')

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function hostnameOf(value) {
    try {
        return new URL(value.includes('://') ? value : 'http://' + value).hostname
    } catch {
        return null
    }
}

// Reject cross-site POSTs (CSRF) and, when bound to loopback, requests whose Host header
// isn't loopback (DNS rebinding). Requests with no Origin/Referer (curl, tests) are allowed.
function requestGuard({ loopbackOnly }) {
    return (req, res, next) => {
        const host = req.headers.host || ''
        if (loopbackOnly && !LOOPBACK.has(hostnameOf(host))) {
            return res.status(403).type('text').send('Forbidden: unexpected Host header')
        }
        if (req.method === 'POST') {
            const source = req.headers.origin || req.headers.referer
            if (source && source !== 'null') {
                let sourceHost
                try { sourceHost = new URL(source).host } catch { sourceHost = null }
                if (sourceHost !== host) {
                    return res.status(403).type('text').send('Forbidden: cross-origin request')
                }
            } else if (source === 'null') {
                return res.status(403).type('text').send('Forbidden: opaque origin')
            }
        }
        next()
    }
}

function createApp({ s3, environment = { kind: 'aws', endpoint: null }, samplesDir, loopbackOnly = true } = {}) {
    if (!s3) {
        const { clientConfig, environment: env } = loadAwsConfig()
        s3 = new S3Client(clientConfig)
        environment = env
    }

    // resolve the region once for the environment badge
    let envPromise
    const getEnvironment = () => {
        envPromise = envPromise || s3.config.region()
            .catch(() => null)
            .then(region => ({ ...environment, region: region || 'region not set' }))
        return envPromise
    }

    const app = express()
    app.disable('x-powered-by')
    app.set('views', path.join(__dirname, 'views'))
    app.set('view engine', 'ejs')

    app.use(requestGuard({ loopbackOnly }))
    app.use((req, res, next) => {
        res.set({
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'same-origin',
            'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'"
        })
        next()
    })
    app.use('/assets', express.static(path.join(__dirname, 'public')))
    app.use(express.urlencoded({ extended: false, limit: '16kb' }))

    app.use(s3Controller({ s3, samplesDir: samplesDir || path.join(__dirname, 'samples'), getEnvironment }))

    // last-resort handler: never leak stacks or raw SDK errors
    app.use((err, req, res, next) => {
        console.error(err && err.name, err && err.message)
        res.status(err.status || 500).type('text').send('Internal error')
    })

    return app
}

module.exports = { createApp, requestGuard }

// Start server only when run directly
if (require.main === module) {
    const host = process.env.HOST || '127.0.0.1'
    const port = Number(process.env.PORT) || 3000
    const { clientConfig, environment } = loadAwsConfig()
    const s3 = new S3Client(clientConfig)
    const app = createApp({ s3, environment, loopbackOnly: LOOPBACK.has(host) })
    app.listen(port, host, () => {
        console.log(`S3 target: ${environment.kind}${environment.endpoint ? ' (' + environment.endpoint + ')' : ''}, credentials: ${environment.credentialSource}`)
        console.log(`AWS S3 Client listening on http://${host.includes(':') ? `[${host}]` : host}:${port}`)
        if (!LOOPBACK.has(host)) console.warn('WARNING: bound to a non-loopback address. This UI has no authentication.')
    })
}
