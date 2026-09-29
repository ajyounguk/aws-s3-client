// Turn SDK v3 responses and errors into something safe and useful to display

// fields on SDK v3 service errors that are safe to show. Anything else (e.g. the
// StringToSign / CanonicalRequest / AWSAccessKeyId returned with SignatureDoesNotMatch,
// or the raw $response) is deliberately dropped.
const SAFE_ERROR_FIELDS = ['BucketName', 'Key', 'Region', 'Endpoint', 'Condition']

function successResult(action, output, status) {
    const meta = (output && output.$metadata) || {}
    const body = { ...output }
    delete body.$metadata
    return {
        action,
        ok: true,
        timestamp: new Date().toISOString(),
        status: status || meta.httpStatusCode || 200,
        requestId: meta.requestId || null,
        body
    }
}

function errorResult(action, err) {
    const meta = (err && err.$metadata) || {}
    const body = {
        name: (err && err.name) || 'Error',
        message: (err && err.message) || String(err)
    }
    if (err && err.Code && err.Code !== body.name) body.code = err.Code
    for (const field of SAFE_ERROR_FIELDS) {
        if (err && typeof err[field] === 'string') body[field] = err[field]
    }
    if (err && err.$fault) body.fault = err.$fault

    return {
        action,
        ok: false,
        timestamp: new Date().toISOString(),
        // real HTTP status from AWS; local failures (no credentials, bad file, network) are 500
        status: meta.httpStatusCode || err.statusCode || 500,
        requestId: meta.requestId || null,
        extendedRequestId: meta.extendedRequestId || null,
        body
    }
}

// local validation failure (never reached AWS)
function localError(action, status, name, message) {
    const err = new Error(message)
    err.name = name
    err.statusCode = status
    return errorResult(action, err)
}

module.exports = { successResult, errorResult, localError }
