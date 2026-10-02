/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const users = app.findCollectionByNameOrId("_pb_users_auth_")

  // File tokens have their own signing secret. Rotate it after the six fields
  // become protected so tokens issued while those fields were public expire.
  // Leave authToken unchanged so existing user sessions remain valid.
  users.fileToken.secret = $security.randomString(50)

  return app.save(users)
}, () => {
  throw new Error("Refusing to restore the previous file-token secret during rollback")
})
