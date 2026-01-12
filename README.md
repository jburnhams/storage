# Auth & Storage Service

A centralized authentication and storage service for the application ecosystem. It handles user login via Google OAuth and provides APIs for storing files, key-value data, and managing collections.

## Authentication

### Flow
1.  **Login**: Redirect the user to `/auth/login?redirect={return_url}`.
2.  **Provider**: The user authenticates with Google.
3.  **Callback**: Upon success, the service redirects back to the specified `{return_url}`.
4.  **Session**: A `storage_session` cookie is set on the root domain (`.jonathanburnhams.com` or `.jburnhams.workers.dev`), allowing all subdomains to share the authenticated state.

### Session Verification
Apps can verify if a user is logged in by calling `GET /api/session`.
*   **Success**: Returns HTTP 200 with the session and user details.
*   **Failure**: Returns HTTP 401 Unauthorized with a login URL.

---

## API Overview

*   **Base URL**: The root domain of this service.
*   **Authentication**: All API requests must include the `storage_session` cookie (handled automatically by browsers for subdomains).
*   **Error Handling**: Errors return 4xx/5xx status codes with a JSON body containing `error` (code) and `message` (description).

---

## Storage API

Manage individual files and key-value pairs (Entries).

### List Entries
`GET /api/storage/entries`
*   **Parameters**:
    *   `collection_id` (optional): Filter by collection ID.
    *   `prefix` (optional): Filter keys starting with this string.
    *   `search` (optional): Search term for keys.
*   **Response**: A list of entry objects containing ID, key, type, and metadata.

### Create Entry
`POST /api/storage/entry`
*   **Format**: `multipart/form-data`
*   **Fields**:
    *   `key`: Unique identifier/path for the entry.
    *   `type`: MIME type (e.g., `text/plain`, `image/png`).
    *   `collection_id` (optional): ID of the parent collection.
    *   `string_value`: Text content (if storing text).
    *   `file`: File content (if storing a binary file).

### Read Entry
`GET /api/storage/entry/:id`
*   **Response**: JSON object with entry metadata and content (if text).
*   **Download**: Append `?download=true` to the URL to retrieve the raw file content (Response body is the file).

### Update Entry
`PUT /api/storage/entry/:id`
*   **Format**: `multipart/form-data`
*   **Fields**: Same as Create (`key`, `type`, `string_value`, `file`). Omitted fields retain existing values.

### Delete Entry
`DELETE /api/storage/entry/:id`
*   **Action**: Permanently removes the entry.

---

## Collections API

Group entries into named collections.

### List Collections
`GET /api/collections`
*   **Response**: A list of all collections belonging to the user.

### Create Collection
`POST /api/collections`
*   **Format**: JSON
*   **Fields**: `name` (required), `description` (optional).

### Get Collection Details
`GET /api/collections/:id`
*   **Response**: Metadata for the specific collection.

### Update Collection
`PUT /api/collections/:id`
*   **Format**: JSON
*   **Fields**: `name`, `description`.

### Delete Collection
`DELETE /api/collections/:id`
*   **Action**: Removes the collection. **Note**: Does not delete the entries inside, but unlinks them.

### Bulk Operations (Collection)
*   **Upload ZIP**: `POST /api/collections/:id/upload` (Multipart with `file` field containing a ZIP). Extracts and creates/updates entries in the collection.
*   **Download ZIP**: `GET /api/collections/:id/download`. Returns a ZIP file containing all entries in the collection.
*   **Export JSON**: `GET /api/collections/:id`. Returns a JSON manifest of all entries, including download URLs.

---

## Bulk Operations API

Perform actions on multiple entries at once.

*   **Download**: `POST /api/storage/bulk/download` - JSON body with `entry_ids` (array of numbers). Returns a ZIP file.
*   **Export**: `POST /api/storage/bulk/export` - JSON body with `entry_ids` (array of numbers). Returns JSON metadata list.
*   **Delete**: `POST /api/storage/bulk/delete` - JSON body with `entry_ids` (array of numbers). Deletes specified entries.

---

## Public Access API

Share content via secret links.

*   **Share File/Value**: `GET /api/public/share?key={key}&secret={hash}`.
    *   Returns metadata by default.
    *   Add `?raw=true` or `?download=true` to get the content directly.
*   **Share Collection**: `GET /api/public/collection?secret={secret}`. Returns collection metadata and entry list.

---

## Roadmap

Future improvements to support multi-app integration:

1.  **App Identification**: Add a mechanism to tag files and collections with an "App ID" or "Category" to allow apps to filter for only their own data.
2.  **Metadata Support**: Update `entries` and `collections` tables to support an arbitrary JSON `metadata` field. This would allow apps to store custom properties (e.g., tags, specific configurations) alongside the content.
3.  **Origin Tracking**: Automatically record the `Origin` domain of the request when creating entries or collections. This enables filtering and auditing based on which app created the data.
4.  **Scoped Access**: Implement API keys or scoped tokens that restrict access to specific collections or "app namespaces," rather than the current all-or-nothing user session access.
5.  **CORS Configuration**: Explicitly manage Cross-Origin Resource Sharing policies to strictly define which subdomains are allowed to access the API.
