// AWS client configuration
//
// Credentials: config/aws-config.json if it exists, otherwise the default AWS SDK
// provider chain (env vars, SSO, shared profiles, container/instance roles).
// Endpoint override: AWS_ENDPOINT_URL_S3, AWS_ENDPOINT_URL, or config/aws-override.json.

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_CONFIG_DIR = path.join(__dirname, '..', 'config')
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'localstack', 'host.docker.internal'])

function readJsonIfExists(file) {
    let text
    try {
        text = fs.readFileSync(file, 'utf8')
    } catch (err) {
        if (err.code === 'ENOENT') return null
        throw err
    }
    try {
        return JSON.parse(text)
    } catch (err) {
        // don't echo the file contents - it may hold credentials
        throw new Error(`Invalid JSON in ${path.basename(file)}: ${err.message.split('\n')[0]}`)
    }
}

// classify an endpoint for the environment badge
function endpointKind(endpoint) {
    if (!endpoint) return 'aws'
    let host
    try {
        host = new URL(endpoint).hostname
    } catch {
        throw new Error(`Invalid S3 endpoint URL: ${endpoint}`)
    }
    return LOCAL_HOSTS.has(host) || host.endsWith('.localhost') || host.endsWith('.localstack.cloud') ? 'local' : 'custom'
}

function loadAwsConfig({ configDir = DEFAULT_CONFIG_DIR, env = process.env } = {}) {
    const clientConfig = {}
    const fileConfig = readJsonIfExists(path.join(configDir, 'aws-config.json'))
    const override = readJsonIfExists(path.join(configDir, 'aws-override.json'))

    let credentialSource = 'default provider chain'
    if (fileConfig) {
        if (fileConfig.region) clientConfig.region = fileConfig.region
        if (fileConfig.accessKeyId && fileConfig.secretAccessKey) {
            clientConfig.credentials = {
                accessKeyId: fileConfig.accessKeyId,
                secretAccessKey: fileConfig.secretAccessKey,
                ...(fileConfig.sessionToken && { sessionToken: fileConfig.sessionToken })
            }
            credentialSource = 'config/aws-config.json'
        }
    }

    const endpoint = env.AWS_ENDPOINT_URL_S3 || env.AWS_ENDPOINT_URL || (override && override.s3_endpoint) || null
    const kind = endpointKind(endpoint)

    if (endpoint) {
        clientConfig.endpoint = endpoint
        // LocalStack and most S3-compatible endpoints need path-style addressing
        // (http://localhost:4566/bucket rather than http://bucket.localhost:4566)
        clientConfig.forcePathStyle = true
    }

    // LocalStack accepts any credentials; don't make people set up a profile just for it
    if (kind === 'local' && !clientConfig.credentials && !env.AWS_ACCESS_KEY_ID && !env.AWS_PROFILE) {
        clientConfig.credentials = { accessKeyId: 'test', secretAccessKey: 'test' }
        credentialSource = 'LocalStack dummy credentials'
    }

    if (!clientConfig.region && kind !== 'aws' && !env.AWS_REGION && !env.AWS_DEFAULT_REGION) {
        clientConfig.region = 'us-east-1'
    }

    return { clientConfig, environment: { kind, endpoint, credentialSource } }
}

module.exports = { loadAwsConfig, endpointKind }
