/// <reference path="../pb_data/types.d.ts" />

routerAdd('GET', '/.well-known/apple-app-site-association', e => {
  return e.json(200, {
    webcredentials: {
      apps: [
        ...new Set(
          ($os.getenv('APPLE_APP_IDS') || '')
            .split(',')
            .map(value => value.trim())
            .filter(value => /^[A-Z0-9]{10}\.[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)+$/.test(value))
        ),
      ],
    },
  });
});
