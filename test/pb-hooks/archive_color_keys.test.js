import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { expect, it } from 'vitest';

it('rejects null key metadata with a bad request before preparing a create', () => {
  class BadRequestError extends Error {}
  const module = { exports: {} };
  vm.runInNewContext(readFileSync('pb_hooks/archive_color_keys.js', 'utf8'), {
    module,
    BadRequestError,
    __hooks: '.',
    require: () => ({
      prepareKeyCreate: value => {
        if (value.position === undefined) throw new BadRequestError();
      },
    }),
  });
  expect(() => module.exports.saveKey({}, {}, null, {})).toThrow(BadRequestError);
});
