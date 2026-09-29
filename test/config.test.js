const { test, describe, beforeEach, afterEach } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { loadAwsConfig, endpointKind } = require('../lib/config')

// every test gets its own temp config dir with dummy files - never the real config/
let dir
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 's3client-config-')) })
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const write = (name, value) => fs.writeFileSync(path.join(dir, name), typeof value === 'string' ? value : JSON.stringify(value))
const load = (env = {}) => loadAwsConfig({ configDir: dir, env })

describe('loadAwsConfig', () => {
    test('no files: default provider chain against real AWS', () => {
        const { clientConfig, environment } = load()
        assert.deepEqual(clientConfig, {})
        assert.deepEqual(environment, { kind: 'aws', endpoint: null, credentialSource: 'default provider chain' })
    })

    test('aws-config.json with keys: static credentials and region', () => {
        write('aws-config.json', { accessKeyId: 'dummy-id', secretAccessKey: 'dummy-secret', region: 'eu-west-2' })
        const { clientConfig, environment } = load()
        assert.deepEqual(clientConfig, { region: 'eu-west-2', credentials: { accessKeyId: 'dummy-id', secretAccessKey: 'dummy-secret' } })
        assert.equal(environment.credentialSource, 'config/aws-config.json')
    })

    test('aws-config.json passes through a session token', () => {
        write('aws-config.json', { accessKeyId: 'a', secretAccessKey: 'b', sessionToken: 'c' })
        assert.equal(load().clientConfig.credentials.sessionToken, 'c')
    })

    test('aws-config.json with only a region keeps the provider chain', () => {
        write('aws-config.json', { region: 'eu-west-1' })
        const { clientConfig, environment } = load()
        assert.deepEqual(clientConfig, { region: 'eu-west-1' })
        assert.equal(environment.credentialSource, 'default provider chain')
    })

    test('aws-override.json points at LocalStack with path-style and dummy creds', () => {
        write('aws-override.json', { s3_endpoint: 'http://localhost:4566' })
        const { clientConfig, environment } = load()
        assert.equal(clientConfig.endpoint, 'http://localhost:4566')
        assert.equal(clientConfig.forcePathStyle, true)
        assert.deepEqual(clientConfig.credentials, { accessKeyId: 'test', secretAccessKey: 'test' })
        assert.equal(clientConfig.region, 'us-east-1')
        assert.equal(environment.kind, 'local')
        assert.equal(environment.credentialSource, 'LocalStack dummy credentials')
    })

    test('local endpoint keeps configured credentials and region', () => {
        write('aws-config.json', { accessKeyId: 'a', secretAccessKey: 'b', region: 'eu-west-2' })
        write('aws-override.json', { s3_endpoint: 'http://127.0.0.1:4566' })
        const { clientConfig } = load()
        assert.equal(clientConfig.credentials.accessKeyId, 'a')
        assert.equal(clientConfig.region, 'eu-west-2')
    })

    test('local endpoint respects AWS_PROFILE / AWS_REGION', () => {
        write('aws-override.json', { s3_endpoint: 'http://localhost:4566' })
        const { clientConfig } = load({ AWS_PROFILE: 'localstack', AWS_REGION: 'eu-west-2' })
        assert.equal(clientConfig.credentials, undefined)
        assert.equal(clientConfig.region, undefined)
    })

    test('AWS_ENDPOINT_URL_S3 beats AWS_ENDPOINT_URL beats the override file', () => {
        write('aws-override.json', { s3_endpoint: 'http://localhost:4566' })
        assert.equal(load({ AWS_ENDPOINT_URL: 'http://localhost:9000' }).clientConfig.endpoint, 'http://localhost:9000')
        assert.equal(load({ AWS_ENDPOINT_URL: 'http://localhost:9000', AWS_ENDPOINT_URL_S3: 'https://s3.example.com' }).clientConfig.endpoint, 'https://s3.example.com')
    })

    test('non-local endpoint is "custom"', () => {
        const { environment, clientConfig } = load({ AWS_ENDPOINT_URL_S3: 'https://minio.example.com' })
        assert.equal(environment.kind, 'custom')
        assert.equal(clientConfig.forcePathStyle, true)
        assert.equal(clientConfig.credentials, undefined)
    })

    test('invalid JSON fails with the file name but not its contents', () => {
        write('aws-config.json', '{ "secretAccessKey": "should-not-appear", ')
        assert.throws(() => load(), err => {
            assert.match(err.message, /Invalid JSON in aws-config\.json/)
            assert.doesNotMatch(err.message, /should-not-appear/)
            return true
        })
    })

    test('invalid endpoint URL fails clearly', () => {
        assert.throws(() => load({ AWS_ENDPOINT_URL_S3: 'not a url' }), /Invalid S3 endpoint URL/)
    })
})

describe('endpointKind', () => {
    for (const [url, kind] of [
        [null, 'aws'],
        ['http://localhost:4566', 'local'],
        ['http://127.0.0.1:4566', 'local'],
        ['http://[::1]:4566', 'local'],
        ['http://localstack:4566', 'local'],
        ['http://host.docker.internal:4566', 'local'],
        ['https://s3.localhost.localstack.cloud:4566', 'local'],
        ['https://s3.eu-west-2.amazonaws.com', 'custom'],
        ['https://minio.example.com', 'custom']
    ]) {
        test(`${url} -> ${kind}`, () => assert.equal(endpointKind(url), kind))
    }
})
