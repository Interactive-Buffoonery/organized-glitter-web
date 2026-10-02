#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SCHEMA_PATH = 'docs/pocketbase/collections.schema.json';
const DEFAULT_TYPES_PATH = 'src/types/pocketbase.types.ts';

const allowedCollectionKeys = new Set([
  'authAlert',
  'authRule',
  'authToken',
  'collectionId',
  'collectionName',
  'confirmEmailChangeTemplate',
  'createRule',
  'created',
  'deleteRule',
  'emailChangeToken',
  'fields',
  'fileToken',
  'id',
  'indexes',
  'listRule',
  'manageRule',
  'mfa',
  'name',
  'oauth2',
  'otp',
  'passwordAuth',
  'passwordResetToken',
  'resetPasswordTemplate',
  'system',
  'type',
  'updated',
  'updateRule',
  'verificationTemplate',
  'verificationToken',
  'viewRule',
]);

const secretPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /pk_[A-Za-z0-9_-]{20,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/,
];

const requiredFieldChecks = [
  {
    collection: 'projects',
    field: 'color_count',
    reason: 'diamond painting project color count must persist in local PocketBase QA',
    validate(field) {
      return (
        field.type === 'number' &&
        field.required === false &&
        field.onlyInt === true &&
        field.min === 0 &&
        field.max === null
      );
    },
    expected: 'optional integer number with min 0 and no max',
  },
];

function getArgValue(name, fallback) {
  const arg = process.argv.find(value => value.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : fallback;
}

function readCollectionNamesFromTypes(typesSource) {
  const matches = [...typesSource.matchAll(/\t[A-Za-z]+: "([^"]+)"/g)];
  return matches.map(match => match[1]).sort();
}

function describePath(parts) {
  return parts.length ? parts.join('.') : '<root>';
}

function looksLikeRecordRow(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

  const keys = Object.keys(value);
  if (!keys.includes('collectionName')) return false;
  if (!keys.includes('collectionId')) return false;
  if (!keys.includes('id')) return false;
  if (keys.includes('fields') || keys.includes('indexes')) return false;

  return true;
}

function findRisks(value, pathParts = [], risks = []) {
  if (looksLikeRecordRow(value)) {
    risks.push(`record-shaped object at ${describePath(pathParts)}`);
    return risks;
  }

  if (typeof value === 'string') {
    const isIndexSql = /^CREATE\s+(UNIQUE\s+)?INDEX/i.test(value);
    const isRule = /^@request\./.test(value) || value.includes('@request.');
    const isCollectionId = /^pbc_\d+$/.test(value) || value === '_pb_users_auth_';
    const isTemplate = pathParts.some(part => String(part).endsWith('Template'));

    if (!isIndexSql && !isRule && !isCollectionId && !isTemplate) {
      for (const pattern of secretPatterns) {
        if (pattern.test(value)) {
          risks.push(`secret-looking value at ${describePath(pathParts)}`);
          break;
        }
      }
    }
    return risks;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => findRisks(item, [...pathParts, index], risks));
    return risks;
  }

  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => findRisks(item, [...pathParts, key], risks));
  }

  return risks;
}

async function main() {
  const schemaPath = getArgValue('--schema', DEFAULT_SCHEMA_PATH);
  const typesPath = getArgValue('--types', DEFAULT_TYPES_PATH);

  const schemaSource = await readFile(schemaPath, 'utf8');
  const typesSource = await readFile(typesPath, 'utf8');
  const schema = JSON.parse(schemaSource);

  if (!Array.isArray(schema)) {
    throw new Error(`${schemaPath} must be a PocketBase collections array`);
  }

  const invalidCollections = schema.filter(collection => {
    return !collection || typeof collection !== 'object' || !collection.name || !collection.type;
  });

  if (invalidCollections.length > 0) {
    throw new Error(
      `${schemaPath} contains ${invalidCollections.length} invalid collection entries`
    );
  }

  const unexpectedKeys = [];
  schema.forEach(collection => {
    Object.keys(collection).forEach(key => {
      if (!allowedCollectionKeys.has(key)) {
        unexpectedKeys.push(`${collection.name}.${key}`);
      }
    });
  });

  if (unexpectedKeys.length > 0) {
    throw new Error(`Unexpected collection keys found: ${unexpectedKeys.join(', ')}`);
  }

  const expectedNames = readCollectionNamesFromTypes(typesSource);
  const exportedNames = schema.map(collection => collection.name).sort();
  const missingFromSchema = expectedNames.filter(name => !exportedNames.includes(name));
  const extraInSchema = exportedNames.filter(name => !expectedNames.includes(name));

  if (missingFromSchema.length || extraInSchema.length) {
    throw new Error(
      [
        'Schema collection names do not match src/types/pocketbase.types.ts.',
        missingFromSchema.length ? `Missing: ${missingFromSchema.join(', ')}` : '',
        extraInSchema.length ? `Extra: ${extraInSchema.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  const fieldErrors = [];
  for (const check of requiredFieldChecks) {
    const collection = schema.find(item => item.name === check.collection);
    const field = collection?.fields?.find(item => item.name === check.field);

    if (!field) {
      fieldErrors.push(`${check.collection}.${check.field} is missing: ${check.reason}`);
      continue;
    }

    if (!check.validate(field)) {
      fieldErrors.push(
        `${check.collection}.${check.field} should be ${check.expected}: ${check.reason}`
      );
    }
  }

  if (fieldErrors.length > 0) {
    throw new Error(`Schema field check failed:\n${fieldErrors.join('\n')}`);
  }

  const risks = findRisks(schema);
  if (risks.length > 0) {
    throw new Error(`Schema risk check failed:\n${risks.join('\n')}`);
  }

  console.log(
    `Validated ${path.relative(process.cwd(), schemaPath)} with ${schema.length} collections.`
  );
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
