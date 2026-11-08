# MongoDB configuration

Set `MONGODB_URI` in the API service's private environment settings. Include the intended database as a path segment, for example:

```text
mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
```

Do not omit `<database>`: without an explicit name, Mongoose selects its default `test` database. ScoreFlow startup rejects missing, malformed, or database-less URIs in both development and production. Use a named local database during development and a TLS-enabled URI with a least-privilege database user in production.

The API waits for MongoDB before listening and exits with a safe startup error if the connection cannot be established. `/health` reports whether the database connection is ready. No connection string or credentials belong in Git.
