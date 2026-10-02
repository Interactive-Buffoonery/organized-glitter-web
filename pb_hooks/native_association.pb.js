/// <reference path="../pb_data/types.d.ts" />

routerAdd('GET', '/.well-known/apple-app-site-association', e => {
  return e.json(200, {
    webcredentials: {
      apps: ['7CNK4YPCQX.com.interactivebuffoonery.organizedglitter'],
    },
  });
});
