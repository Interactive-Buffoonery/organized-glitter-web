#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const DANGEROUS_DOWN_PATTERNS = [
  {
    label: 'app.delete(...)',
    pattern: /\bapp\s*\.\s*delete\s*\(/g,
  },
  {
    label: 'fields.removeByName(...)',
    pattern: /\bfields\s*\.\s*removeByName\s*\(/g,
  },
  {
    label: 'fields.removeById(...)',
    pattern: /\bfields\s*\.\s*removeById\s*\(/g,
  },
];

const ROLLBACK_REFUSAL_PATTERN = /\bthrow\b|\brefuseDestructiveRollback\s*\(/g;

function isIdentifierCharacter(character) {
  return /[A-Za-z0-9_$]/.test(character);
}

function scanPastQuotedValue(source, index) {
  const quote = source[index];
  let cursor = index + 1;

  while (cursor < source.length) {
    const character = source[cursor];

    if (character === '\\') {
      cursor += 2;
      continue;
    }

    if (character === quote) {
      return cursor + 1;
    }

    cursor += 1;
  }

  return cursor;
}

function scanPastLineComment(source, index) {
  const newlineIndex = source.indexOf('\n', index + 2);
  return newlineIndex === -1 ? source.length : newlineIndex + 1;
}

function scanPastBlockComment(source, index) {
  const endIndex = source.indexOf('*/', index + 2);
  return endIndex === -1 ? source.length : endIndex + 2;
}

function nextSignificantIndex(source, index) {
  if (source[index] === '"' || source[index] === "'" || source[index] === '`') {
    return scanPastQuotedValue(source, index);
  }

  if (source[index] === '/' && source[index + 1] === '/') {
    return scanPastLineComment(source, index);
  }

  if (source[index] === '/' && source[index + 1] === '*') {
    return scanPastBlockComment(source, index);
  }

  return index + 1;
}

function maskNonCode(source) {
  const characters = source.split('');
  let cursor = 0;

  while (cursor < source.length) {
    const character = source[cursor];
    let end = cursor + 1;

    if (character === '"' || character === "'" || character === '`') {
      end = scanPastQuotedValue(source, cursor);
    } else if (character === '/' && source[cursor + 1] === '/') {
      end = scanPastLineComment(source, cursor);
    } else if (character === '/' && source[cursor + 1] === '*') {
      end = scanPastBlockComment(source, cursor);
    } else {
      cursor += 1;
      continue;
    }

    for (let index = cursor; index < end; index += 1) {
      if (characters[index] !== '\n') {
        characters[index] = ' ';
      }
    }

    cursor = end;
  }

  return characters.join('');
}

function findMatchingDelimiter(source, startIndex, openDelimiter, closeDelimiter) {
  let depth = 0;
  let cursor = startIndex;

  while (cursor < source.length) {
    const character = source[cursor];

    if (
      character === '"' ||
      character === "'" ||
      character === '`' ||
      (character === '/' && (source[cursor + 1] === '/' || source[cursor + 1] === '*'))
    ) {
      cursor = nextSignificantIndex(source, cursor);
      continue;
    }

    if (character === openDelimiter) {
      depth += 1;
    } else if (character === closeDelimiter) {
      depth -= 1;

      if (depth === 0) {
        return cursor;
      }
    }

    cursor += 1;
  }

  return -1;
}

function findMigrateCallIndexes(source) {
  const indexes = [];
  let cursor = 0;

  while (cursor < source.length) {
    const index = source.indexOf('migrate', cursor);

    if (index === -1) {
      break;
    }

    const previous = source[index - 1] || '';
    const next = source[index + 'migrate'.length] || '';

    if (!isIdentifierCharacter(previous) && !isIdentifierCharacter(next)) {
      const openParen = source.indexOf('(', index + 'migrate'.length);

      if (openParen !== -1 && source.slice(index + 'migrate'.length, openParen).trim() === '') {
        indexes.push(openParen);
      }
    }

    cursor = index + 'migrate'.length;
  }

  return indexes;
}

function splitTopLevelArguments(source) {
  const args = [];
  let depth = 0;
  let start = 0;
  let cursor = 0;

  while (cursor < source.length) {
    const character = source[cursor];

    if (
      character === '"' ||
      character === "'" ||
      character === '`' ||
      (character === '/' && (source[cursor + 1] === '/' || source[cursor + 1] === '*'))
    ) {
      cursor = nextSignificantIndex(source, cursor);
      continue;
    }

    if (character === '(' || character === '{' || character === '[') {
      depth += 1;
    } else if (character === ')' || character === '}' || character === ']') {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      args.push(source.slice(start, cursor).trim());
      start = cursor + 1;
    }

    cursor += 1;
  }

  args.push(source.slice(start).trim());

  return args;
}

function extractFunctionBody(source) {
  const arrowIndex = source.indexOf('=>');
  const searchStart = arrowIndex === -1 ? 0 : arrowIndex + 2;
  const openBrace = source.indexOf('{', searchStart);

  if (openBrace === -1) {
    return source.slice(searchStart).trim();
  }

  const closeBrace = findMatchingDelimiter(source, openBrace, '{', '}');

  if (closeBrace === -1) {
    return source.slice(openBrace + 1);
  }

  return source.slice(openBrace + 1, closeBrace);
}

function extractDownBodies(source) {
  return findMigrateCallIndexes(source).flatMap(openParen => {
    const closeParen = findMatchingDelimiter(source, openParen, '(', ')');

    if (closeParen === -1) {
      return [];
    }

    const args = splitTopLevelArguments(source.slice(openParen + 1, closeParen));
    const downFunction = args[1];

    if (!downFunction) {
      return [];
    }

    return [extractFunctionBody(downFunction)];
  });
}

function findPatternMatches(pattern, source) {
  pattern.lastIndex = 0;
  const matches = [];
  let match = pattern.exec(source);

  while (match) {
    matches.push({
      index: match.index,
      text: match[0],
    });
    match = pattern.exec(source);
  }

  return matches;
}

function hasRollbackRefusalBefore(source, index) {
  return findPatternMatches(ROLLBACK_REFUSAL_PATTERN, source).some(match => match.index < index);
}

function validateMigrationSource(source, filename = '<inline>') {
  const findings = [];
  const downBodies = extractDownBodies(source);

  downBodies.forEach((downBody, migrationIndex) => {
    const downCode = maskNonCode(downBody);

    DANGEROUS_DOWN_PATTERNS.forEach(({ label, pattern }) => {
      findPatternMatches(pattern, downCode).forEach(match => {
        if (hasRollbackRefusalBefore(downCode, match.index)) {
          return;
        }

        findings.push({
          filename,
          migrationIndex,
          label,
          detail: `down migration contains ${label} without an earlier rollback refusal`,
        });
      });
    });
  });

  return findings;
}

function validateMigrationFiles(files) {
  return files.flatMap(file => {
    const source = fs.readFileSync(file, 'utf8');
    return validateMigrationSource(source, file);
  });
}

function runCli(files) {
  if (files.length === 0) {
    console.error('Usage: node scripts/validate-migration.cjs <migration-file> [...]');
    return 1;
  }

  const findings = validateMigrationFiles(files);

  if (findings.length === 0) {
    console.log(`Validated ${files.length} migration file${files.length === 1 ? '' : 's'}.`);
    return 0;
  }

  console.error('Unsafe PocketBase migration rollback detected:');
  findings.forEach(finding => {
    console.error(`- ${path.relative(process.cwd(), finding.filename)}: ${finding.detail}`);
  });

  return 1;
}

if (require.main === module) {
  process.exitCode = runCli(process.argv.slice(2));
}

module.exports = {
  extractDownBodies,
  validateMigrationFiles,
  validateMigrationSource,
};
