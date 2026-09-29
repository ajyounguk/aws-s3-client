const path = require('node:path')
const { S3Client, S3ServiceException } = require('@aws-sdk/client-s3')
const { mockClient } = require('aws-sdk-client-mock')
const { createApp } = require('../app')

const SAMPLES_DIR = path.join(__dirname, 'fixtures', 'samples')

function makeApp({ region = 'eu-west-2', environment = { kind: 'aws', endpoint: null } } = {}) {
    const s3 = new S3Client({ region, credentials: { accessKeyId: 'test', secretAccessKey: 'test' } })
    const s3Mock = mockClient(s3)
    const app = createApp({ s3, environment, samplesDir: SAMPLES_DIR })
    return { app, s3, s3Mock }
}

function meta(status = 200, requestId = 'REQ-123') {
    return { httpStatusCode: status, requestId, extendedRequestId: 'EXT-456', attempts: 1, totalRetryDelay: 0 }
}

function awsError(name, status, message, extra = {}) {
    const err = new S3ServiceException({ name, $fault: status >= 500 ? 'server' : 'client', $metadata: meta(status, 'ERR-REQ-789'), message })
    return Object.assign(err, extra)
}

// pull the JSON shown in the response panel back out of the page
function responseJson(html) {
    const m = html.match(/<code id="response-json">([\s\S]*?)<\/code>/)
    if (!m) return null
    const text = m[1]
        .replace(/&#34;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    return JSON.parse(text)
}

function statusBadge(html) {
    const m = html.match(/<span class="status (status-ok|status-err)">\s*([\s\S]*?)\s*<\/span>/)
    return m && { cls: m[1], text: m[2].replace(/\s+/g, ' ') }
}

module.exports = { makeApp, meta, awsError, responseJson, statusBadge, SAMPLES_DIR }
