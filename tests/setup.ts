// Stockage sur disque isolé par exécution de tests; aucune clé de fournisseur réelle.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.IMMOPILOT_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'immopilot-test-'))
process.env.SESSION_SECRET = 'test-secret'
process.env.SECRETS_KEY = 'test-vault-key'
delete process.env.VERCEL
delete process.env.BLOB_READ_WRITE_TOKEN
delete process.env.BLOB_STORE_ID
